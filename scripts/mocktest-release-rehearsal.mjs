import crypto from "node:crypto";
import pg from "pg";
import { releaseMockTest } from "../lib/mockTest/release.ts";
import { shouldRevealMockResults } from "../lib/mockTest/release-policy.ts";

const { Pool } = pg;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const databaseUrl = new URL(process.env.DATABASE_URL);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (process.env.NODE_ENV === "production" || !localHosts.has(databaseUrl.hostname)) {
  throw new Error("Refusing to run release rehearsal outside a local development database.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const slug = `release-rehearsal-${suffix}`;
const REHEARSAL_SOURCE = `release-rehearsal-${suffix}`;
const emails = [
  `release-finished-a-${suffix}@aced.local`,
  `release-finished-b-${suffix}@aced.local`,
  `release-unfinished-${suffix}@aced.local`,
];
const releaseDelaySeconds = Number(process.env.REHEARSAL_DELAY_SECONDS ?? 180);
const releaseAt = new Date(Date.now() + releaseDelaySeconds * 1000);

function log(label, value) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  console.log(`[${new Date().toISOString()}] ${label}: ${body}`);
}

async function createSession(client, {
  mockTestId,
  formId,
  userId,
  email,
  mode,
}) {
  const startedAt = new Date(Date.now() - 35 * 60 * 1000);
  const registration = (
    await client.query(
      `insert into mock_registrations
        (mock_test_id,user_id,time_zone,agreed_no_refund_at,paid_at,started_at,finished_at,updated_at)
       values($1,$2,'America/Los_Angeles',now(),now(),$3,$4,now())
       returning id`,
      [mockTestId, userId, startedAt, mode === "finished" ? new Date(startedAt.getTime() + 20_000) : null]
    )
  ).rows[0];

  const session = (
    await client.query(
      `insert into mock_test_sessions
        (registration_id,form_id,status,current_section_order,started_at,completed_at,updated_at)
       values($1,$2,$3,$4,$5,$6,now())
       returning id`,
      [
        registration.id,
        formId,
        mode === "finished" ? "completed" : "in_progress",
        mode === "finished" ? 3 : 0,
        startedAt,
        mode === "finished" ? new Date(startedAt.getTime() + 20_000) : null,
      ]
    )
  ).rows[0];

  const sectionKeys = ["english", "math", "reading", "science"];
  const runIds = new Map();
  for (let order = 0; order < sectionKeys.length; order += 1) {
    const sectionStart = new Date(startedAt.getTime() + order * 2_000);
    const deadline = new Date(sectionStart.getTime() + 1_000);
    const finished = mode === "finished";
    const firstOnly = mode === "unfinished" && order === 0;
    const run = (
      await client.query(
        `insert into mock_test_section_runs
          (session_id,section_key,section_order,time_limit_seconds,started_at,deadline_at,completed_at,outbox_cleared_at,updated_at)
         values($1,$2,$3,1,$4,$5,$6,$7,now())
         returning id`,
        [
          session.id,
          sectionKeys[order],
          order,
          finished || firstOnly ? sectionStart : null,
          finished || firstOnly ? deadline : null,
          finished ? deadline : null,
          finished ? deadline : null,
        ]
      )
    ).rows[0];
    runIds.set(sectionKeys[order], run.id);
  }

  const assignments = (
    await client.query(
      `select question_id,section_key,position,correct_answer_snapshot
       from mock_test_form_questions
       where form_id=$1
       order by section_key,position`,
      [formId]
    )
  ).rows;

  if (assignments.length !== 171) {
    throw new Error(`Rehearsal form has ${assignments.length}/171 questions.`);
  }

  for (const assignment of assignments) {
    let selectedAnswer = null;
    if (mode === "finished") {
      selectedAnswer = email.includes("finished-a")
        ? assignment.correct_answer_snapshot
        : "A";
    } else if (assignment.position <= 2) {
      selectedAnswer = assignment.correct_answer_snapshot;
    }

    await client.query(
      `insert into mock_test_answers
        (session_id,section_run_id,question_id,question_order,selected_answer,flagged,client_sequence,updated_at)
       values($1,$2,$3,$4,$5,false,$6,now())`,
      [
        session.id,
        runIds.get(assignment.section_key),
        assignment.question_id,
        assignment.position,
        selectedAnswer,
        selectedAnswer ? 1 : 0,
      ]
    );
  }

  return {
    registrationId: registration.id,
    sessionId: session.id,
    email,
    unfinished: mode === "unfinished",
  };
}

async function setup() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const sourceForm = (
      await client.query(
        `select f.id
         from mock_test_forms f
         where f.status='locked'
           and (select count(*) from mock_test_form_questions q where q.form_id=f.id)=171
         order by (f.version='DEV') desc, f.created_at desc
         limit 1`
      )
    ).rows[0];
    if (!sourceForm) throw new Error("No locked 171-question form is available for rehearsal.");

    const mockTest = (
      await client.query(
        `insert into mock_tests
          (slug,test_date,act_date,start_cutoff,results_release_at,price_cents,seat_limit,status)
         values($1,current_date,current_date,'21:00:00',$2,200,100,'open')
         returning id`,
        [slug, releaseAt]
      )
    ).rows[0];

    const form = (
      await client.query(
        `insert into mock_test_forms(mock_test_id,version,status)
         values($1,'REHEARSAL','draft')
         returning id`,
        [mockTest.id]
      )
    ).rows[0];

    const sourceAssignments = (
      await client.query(
        `select
           mfq.question_id,
           mfq.section_key,
           mfq.position,
           mfq.correct_answer_snapshot,
           mfq.topic_id_snapshot,
           mfq.topic_name_snapshot,
           q.difficulty,
           q.question_type,
           q.prompt,
           q.passage,
           q.choices,
           q.explanation
         from mock_test_form_questions mfq
         inner join questions q on q.id=mfq.question_id
         where mfq.form_id=$1
         order by mfq.section_key,mfq.position`,
        [sourceForm.id]
      )
    ).rows;

    for (const assignment of sourceAssignments) {
      const fingerprint = crypto
        .createHash("sha256")
        .update(`${REHEARSAL_SOURCE}:${assignment.question_id}`)
        .digest("hex");
      const clonedQuestion = (
        await client.query(
          `insert into questions
            (section_key,topic_id,difficulty,question_type,prompt,passage,fingerprint,choices,
             correct_answer,explanation,source,generation_model,usage_scope,status,created_at,updated_at)
           values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,'release-rehearsal','retired','published',now(),now())
           returning id`,
          [
            assignment.section_key,
            assignment.topic_id_snapshot,
            assignment.difficulty,
            assignment.question_type,
            assignment.prompt,
            assignment.passage,
            fingerprint,
            JSON.stringify(assignment.choices),
            assignment.correct_answer_snapshot,
            assignment.explanation,
            REHEARSAL_SOURCE,
          ]
        )
      ).rows[0];

      await client.query(
        `insert into mock_test_form_questions
          (form_id,question_id,section_key,position,correct_answer_snapshot,topic_id_snapshot,topic_name_snapshot)
         values($1,$2,$3,$4,$5,$6,$7)`,
        [
          form.id,
          clonedQuestion.id,
          assignment.section_key,
          assignment.position,
          assignment.correct_answer_snapshot,
          assignment.topic_id_snapshot,
          assignment.topic_name_snapshot,
        ]
      );
    }

    await client.query(
      `update mock_test_forms
       set status='locked',reviewed_at=now(),locked_at=now(),updated_at=now()
       where id=$1`,
      [form.id]
    );

    const sessions = [];
    for (let index = 0; index < emails.length; index += 1) {
      const user = (
        await client.query(
          `insert into users(email,name,created_at,updated_at)
           values($1,$2,now(),now())
           returning id`,
          [emails[index], `Release Rehearsal ${index + 1}`]
        )
      ).rows[0];

      sessions.push(
        await createSession(client, {
          mockTestId: mockTest.id,
          formId: form.id,
          userId: user.id,
          email: emails[index],
          mode: index === 2 ? "unfinished" : "finished",
        })
      );
    }

    await client.query("commit");
    return { mockTestId: mockTest.id, formId: form.id, sessions };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function cleanup() {
  const client = await pool.connect();
  try {
    await client.query('alter table mock_test_form_questions disable trigger protect_locked_mock_test_form_questions_trigger');
    await client.query('alter table mock_test_forms disable trigger protect_locked_mock_test_form_trigger');
    try {
      await client.query("delete from mock_tests where slug=$1", [slug]);
    } finally {
      await client.query('alter table mock_test_form_questions enable trigger protect_locked_mock_test_form_questions_trigger');
      await client.query('alter table mock_test_forms enable trigger protect_locked_mock_test_form_trigger');
    }
    await client.query("delete from questions where source=$1", [REHEARSAL_SOURCE]);
    await client.query("delete from users where email = any($1::text[])", [emails]);
  } finally {
    client.release();
  }
}

async function inspect(mockTestId, unfinishedSessionId) {
  const client = await pool.connect();
  try {
    const test = (
      await client.query(
        `select status,released_at,composite_distribution
         from mock_tests where id=$1`,
        [mockTestId]
      )
    ).rows[0];
    const unfinished = (
      await client.query(
        `select mts.status,mts.completed_at,mr.composite,mr.percentile
         from mock_test_sessions mts
         inner join mock_registrations mr on mr.id=mts.registration_id
         where mts.id=$1`,
        [unfinishedSessionId]
      )
    ).rows[0];
    const scored = (
      await client.query(
        `select count(*)::int as count
         from mock_registrations
         where mock_test_id=$1 and composite is not null and percentile is not null`,
        [mockTestId]
      )
    ).rows[0];

    return {
      test,
      unfinished,
      scoredCount: Number(scored.count),
    };
  } finally {
    client.release();
  }
}

async function main() {
  let fixture;
  try {
    fixture = await setup();
    const unfinished = fixture.sessions.find((session) => session.unfinished);
    if (!unfinished) throw new Error("Unfinished rehearsal session missing.");

    log("rehearsal test created", {
      slug,
      releaseAt: releaseAt.toISOString(),
      finishedSessions: 2,
      unfinishedSessions: 1,
    });

    const earlyNow = new Date();
    const early = await releaseMockTest({
      connectionString: process.env.DATABASE_URL,
      slug,
      now: earlyNow,
      includeDev: true,
    });
    log("scheduler tick before release", early);

    const earlyState = await inspect(fixture.mockTestId, unfinished.sessionId);
    const earlyReveal = shouldRevealMockResults({
      status: earlyState.test.status,
      now: earlyNow,
      releaseAt,
    });
    log("results page state before release", {
      reveal: earlyReveal,
      status: earlyState.test.status,
    });

    if (early.released || earlyReveal) {
      throw new Error("Rehearsal released early.");
    }

    const waitMs = Math.max(0, releaseAt.getTime() - Date.now() + 1000);
    log("scheduler wait", `${Math.ceil(waitMs / 1000)} seconds until release tick`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    const releaseNow = new Date();
    const released = await releaseMockTest({
      connectionString: process.env.DATABASE_URL,
      slug,
      now: releaseNow,
      includeDev: true,
    });
    log("scheduler tick at release", released);

    const after = await inspect(fixture.mockTestId, unfinished.sessionId);
    const afterReveal = shouldRevealMockResults({
      status: after.test.status,
      now: releaseNow,
      releaseAt,
    });
    log("unfinished session after release", {
      status: after.unfinished.status,
      completedAt: after.unfinished.completed_at,
      composite: after.unfinished.composite,
      percentile: after.unfinished.percentile,
    });
    log("results page state after release", {
      reveal: afterReveal,
      status: after.test.status,
      scoredCount: after.scoredCount,
    });

    const firstReleasedAt = after.test.released_at?.toISOString?.() ?? String(after.test.released_at);
    const second = await releaseMockTest({
      connectionString: process.env.DATABASE_URL,
      slug,
      now: new Date(releaseNow.getTime() + 5000),
      includeDev: true,
    });
    const afterSecond = await inspect(fixture.mockTestId, unfinished.sessionId);
    const secondReleasedAt =
      afterSecond.test.released_at?.toISOString?.() ?? String(afterSecond.test.released_at);
    log("scheduler repeat tick", second);
    log("idempotency check", {
      alreadyReleased: second.alreadyReleased === true,
      releasedAtUnchanged: firstReleasedAt === secondReleasedAt,
    });

    if (!released.released || released.alreadyReleased) {
      throw new Error("Release tick did not perform the release.");
    }
    if (after.unfinished.status !== "completed" || after.unfinished.composite == null) {
      throw new Error("Unfinished session was not finalized and scored.");
    }
    if (!afterReveal) {
      throw new Error("Results reveal did not flip after release.");
    }
    if (!second.alreadyReleased || firstReleasedAt !== secondReleasedAt) {
      throw new Error("Release was not idempotent.");
    }

    log("rehearsal result", "PASS");
  } finally {
    await cleanup();
    log("cleanup", "throwaway rehearsal data removed");
    await pool.end();
  }
}

await main();
