import pg from "pg";
import crypto from "node:crypto";

if (process.env.NODE_ENV === "production") {
  throw new Error("mocktest-admin-busy refuses to run in production.");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const parsedUrl = new URL(databaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname)) {
  throw new Error("mocktest-admin-busy only runs against a local database.");
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const client = await pool.connect();

const SECTION_LIMITS = {
  english: 35 * 60,
  math: 50 * 60,
  reading: 40 * 60,
  science: 40 * 60,
};
const SECTION_TOTALS = { english: 50, math: 45, reading: 36, science: 40 };
const SECTION_KEYS = ["english", "math", "reading", "science"];

function pacificDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function addDays(dateKey, days) {
  const date = new Date(dateKey + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function stateFor(index) {
  if (index < 6) return "not started";
  if (index < 12) return "english";
  if (index < 18) return "math";
  if (index < 23) return "break";
  if (index < 29) return "reading";
  if (index < 35) return "science";
  return "finished";
}

function sectionIndexFor(state) {
  if (state === "english") return 0;
  if (state === "math" || state === "break") return 1;
  if (state === "reading") return 2;
  return 3;
}

async function insertAnswers({
  sessionId,
  runId,
  sectionKey,
  count,
  answeredAt,
  syncedLate = false,
}) {
  if (count <= 0) return;
  await client.query(
    "insert into mock_test_answers " +
      "(session_id, section_run_id, question_id, question_order, selected_answer, flagged, answered_at, client_sequence, picked_at_server, synced_late, created_at, updated_at) " +
      "select $1::uuid, $2::uuid, q.id, q.rn, 'A', false, $5::timestamptz, q.rn, $5::timestamptz, $6::boolean, $5::timestamptz, $5::timestamptz " +
      "from (" +
      "  select id, row_number() over (order by created_at, id)::int as rn " +
      "  from questions where section_key=$3 order by created_at, id limit $4" +
      ") q",
    [sessionId, runId, sectionKey, count, answeredAt, syncedLate]
  );
}

try {
  await client.query("begin");

  const now = new Date();
  const today = pacificDate(now);
  const slug = "DEV-ADMIN-BUSY";
  const actDate = addDays(today, 7);
  const releaseAt = new Date(now.getTime() - 20 * 60 * 1000);

  const oldTest = await client.query("select id from mock_tests where slug=$1", [slug]);
  if (oldTest.rows[0]) {
    await client.query("delete from mock_tests where id=$1", [oldTest.rows[0].id]);
  }
  await client.query("delete from users where email like 'admin-fixture+%@aced.test'");

  const testResult = await client.query(
    "insert into mock_tests " +
      "(slug, test_date, act_date, results_release_at, seat_limit, status, price_cents) " +
      "values ($1,$2,$3,$4,60,'open',200) returning id",
    [slug, today, actDate, releaseAt]
  );
  const testId = testResult.rows[0].id;

  const formResult = await client.query(
    "insert into mock_test_forms " +
      "(mock_test_id, version, status, created_at, updated_at) " +
      "values ($1,'ADMIN-DEV','draft',$2,$2) returning id",
    [testId, now]
  );
  const formId = formResult.rows[0].id;

  const registrations = [];

  for (let index = 0; index < 40; index += 1) {
    const email = "admin-fixture+" + String(index + 1).padStart(2, "0") + "@aced.test";
    const userResult = await client.query(
      "insert into users (email, name, created_at, updated_at) values ($1,$2,$3,$3) returning id",
      [email, "Admin Fixture " + (index + 1), new Date(now.getTime() - (45 - index) * 60_000)]
    );
    const userId = userResult.rows[0].id;
    const timeZones = [
      "America/Los_Angeles",
      "America/Denver",
      "America/Chicago",
      "America/New_York",
    ];
    const timeZone = timeZones[index % timeZones.length];
    const registeredAt = new Date(now.getTime() - (70 - index) * 60_000);
    const paidAt = new Date(registeredAt.getTime() + 2 * 60_000);

    const registrationResult = await client.query(
      "insert into mock_registrations " +
        "(mock_test_id,user_id,time_zone,agreed_no_refund_at,marketing_opt_in,stripe_payment_intent_id,paid_at,created_at,updated_at) " +
        "values ($1,$2,$3,$4,false,$5,$6,$4,$4) returning id",
      [
        testId,
        userId,
        timeZone,
        registeredAt,
        "test_payment_admin_" + (index + 1),
        paidAt,
      ]
    );
    const registrationId = registrationResult.rows[0].id;
    const state = stateFor(index);
    registrations.push({ registrationId, email, userId, state });

    if (state === "not started") continue;

    const currentOrder = sectionIndexFor(state);
    const sessionAgeMinutes =
      state === "finished"
        ? 190
        : [15, 75, 130, 175][currentOrder] ?? 15;
    const sessionStarted = new Date(
      now.getTime() - sessionAgeMinutes * 60_000
    );
    const sessionStatus = state === "finished" ? "completed" : "in_progress";
    const completedAt = state === "finished" ? new Date(now.getTime() - 4 * 60_000) : null;
    const breakStarted = state === "break" ? new Date(now.getTime() - 4 * 60_000) : null;
    const breakEnds = state === "break" ? new Date(now.getTime() + 6 * 60_000) : null;

    const sessionResult = await client.query(
      "insert into mock_test_sessions " +
        "(registration_id,form_id,status,current_section_order,current_break_after,break_started_at,break_ends_at,started_at,completed_at,updated_at) " +
        "values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
      [
        registrationId,
        formId,
        sessionStatus,
        currentOrder,
        state === "break" ? "math" : null,
        breakStarted,
        breakEnds,
        sessionStarted,
        completedAt,
        now,
      ]
    );
    const sessionId = sessionResult.rows[0].id;

    await client.query(
      "update mock_registrations set started_at=$2, finished_at=$3, updated_at=$4 where id=$1",
      [registrationId, sessionStarted, completedAt, now]
    );

    for (let order = 0; order < 4; order += 1) {
      const key = SECTION_KEYS[order];
      const isPast = state === "finished" || order < currentOrder || (state === "break" && order === 1);
      const isCurrent =
        state !== "finished" &&
        state !== "break" &&
        order === currentOrder;
      let startedAt = null;
      let deadlineAt = null;
      let runCompletedAt = null;

      if (isPast) {
        const pastMinutes = 5 + (currentOrder - order) * 4;
        deadlineAt = new Date(now.getTime() - pastMinutes * 60_000);
        startedAt = new Date(
          deadlineAt.getTime() - SECTION_LIMITS[key] * 1000
        );
        runCompletedAt =
          (index + order) % 2 === 0
            ? new Date(deadlineAt.getTime())
            : new Date(deadlineAt.getTime() - 3 * 60_000);
      } else if (isCurrent) {
        const minutesAgo = index === 6 ? 15 : 4 + (index % 6);
        startedAt = new Date(now.getTime() - minutesAgo * 60_000);
        deadlineAt = new Date(
          startedAt.getTime() + SECTION_LIMITS[key] * 1000
        );
      }

      const runResult = await client.query(
        "insert into mock_test_section_runs " +
          "(session_id,section_key,section_order,time_limit_seconds,started_at,deadline_at,completed_at,outbox_cleared_at,updated_at) " +
          "values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
        [
          sessionId,
          key,
          order,
          SECTION_LIMITS[key],
          startedAt,
          deadlineAt,
          runCompletedAt,
          runCompletedAt,
          now,
        ]
      );

      if (!startedAt) continue;
      const runId = runResult.rows[0].id;
      let answerCount = 0;
      if (isPast) answerCount = SECTION_TOTALS[key];
      if (isCurrent) answerCount = Math.min(
        SECTION_TOTALS[key],
        8 + ((index * 7 + order * 3) % Math.max(1, SECTION_TOTALS[key] - 8))
      );

      const answerTime =
        index === 6 && isCurrent
          ? new Date(now.getTime() - 12 * 60_000)
          : new Date(now.getTime() - (2 + (index % 4)) * 60_000);

      await insertAnswers({
        sessionId,
        runId,
        sectionKey: key,
        count: answerCount,
        answeredAt: answerTime,
        syncedLate: index === 24 && key === "reading",
      });
    }

    if (state === "break") {
      await client.query(
        "insert into mock_test_ops_events " +
          "(mock_test_id,registration_id,session_id,section_key,kind,details,created_at) " +
          "values ($1,$2,$3,'math','break_started',$4::jsonb,$5)",
        [
          testId,
          registrationId,
          sessionId,
          JSON.stringify({
            startedAt: breakStarted.toISOString(),
            scheduledEndsAt: breakEnds.toISOString(),
          }),
          breakStarted,
        ]
      );
    } else if (["reading", "science", "finished"].includes(state)) {
      const pastBreakStarted = new Date(now.getTime() - (55 + currentOrder * 8) * 60_000);
      const pastBreakEnded = new Date(pastBreakStarted.getTime() + 10 * 60_000);
      await client.query(
        "insert into mock_test_ops_events " +
          "(mock_test_id,registration_id,session_id,section_key,kind,details,created_at) " +
          "values ($1,$2,$3,'math','break_started',$4::jsonb,$5), " +
          "($1,$2,$3,'math','break_ended',$6::jsonb,$7)",
        [
          testId,
          registrationId,
          sessionId,
          JSON.stringify({
            startedAt: pastBreakStarted.toISOString(),
            scheduledEndsAt: pastBreakEnded.toISOString(),
          }),
          pastBreakStarted,
          JSON.stringify({
            endedAt: pastBreakEnded.toISOString(),
            startedReadingEarly: false,
          }),
          pastBreakEnded,
        ]
      );
    }
  }

  for (let index = 0; index < 12; index += 1) {
    const invited = index < 6;
    const used = index < 3;
    await client.query(
      "insert into mock_waitlist " +
        "(mock_test_id,email,created_at,invited_at,invite_token,invite_used_at) " +
        "values ($1,$2,$3,$4,$5,$6)",
      [
        testId,
        "admin-waitlist+" + String(index + 1).padStart(2, "0") + "@aced.test",
        new Date(now.getTime() - (30 - index) * 60_000),
        invited ? new Date(now.getTime() - (20 - index) * 60_000) : null,
        invited ? crypto.randomUUID() : null,
        used ? new Date(now.getTime() - (10 - index) * 60_000) : null,
      ]
    );
  }

  for (let index = 0; index < 3; index += 1) {
    const email = "admin-fixture+hold-" + (index + 1) + "@aced.test";
    const userResult = await client.query(
      "insert into users (email,name,created_at,updated_at) values ($1,$2,$3,$3) returning id",
      [email, "Admin Hold " + (index + 1), now]
    );
    await client.query(
      "insert into mock_registrations " +
        "(mock_test_id,user_id,time_zone,agreed_no_refund_at,hold_expires_at,created_at,updated_at) " +
        "values ($1,$2,'America/Los_Angeles',$3,$4,$3,$3)",
      [testId, userResult.rows[0].id, now, new Date(now.getTime() + 10 * 60_000)]
    );
  }

  const byIndex = (oneBased) => registrations[oneBased - 1];

  const rejected = byIndex(25);
  await client.query(
    "insert into mock_test_ops_events " +
      "(mock_test_id,registration_id,kind,section_key,details,created_at) " +
      "values ($1,$2,'answer_sync_rejected','reading',$3::jsonb,$4)",
    [
      testId,
      rejected.registrationId,
      JSON.stringify({ reason: "offline_sync_window_expired" }),
      new Date(now.getTime() - 3 * 60_000),
    ]
  );

  const multiple = byIndex(14);
  const multipleSession = await client.query(
    "select id from mock_test_sessions where registration_id=$1",
    [multiple.registrationId]
  );
  for (const clientId of ["fixture-tab-a", "fixture-tab-b"]) {
    await client.query(
      "insert into mock_test_client_presence " +
        "(registration_id,session_id,client_id,last_seen_at,created_at) values ($1,$2,$3,$4,$4)",
      [multiple.registrationId, multipleSession.rows[0].id, clientId, now]
    );
  }

  const cutoff = byIndex(2);
  await client.query(
    "insert into mock_test_ops_events " +
      "(mock_test_id,registration_id,kind,details,created_at) " +
      "values ($1,$2,'dev_force_start_cutoff_warning','{}'::jsonb,$3)",
    [testId, cutoff.registrationId, now]
  );

  const expiredHold = byIndex(3);
  await client.query(
    "insert into mock_test_ops_events " +
      "(mock_test_id,registration_id,kind,details,created_at) " +
      "values ($1,$2,'payment_after_hold_expired',$3::jsonb,$4)",
    [
      testId,
      expiredHold.registrationId,
      JSON.stringify({ fixture: true }),
      new Date(now.getTime() - 6 * 60_000),
    ]
  );

  const paymentError = byIndex(4);
  await client.query(
    "insert into mock_test_ops_events " +
      "(mock_test_id,registration_id,kind,details,created_at) " +
      "values ($1,$2,'checkout_error',$3::jsonb,$4)",
    [
      testId,
      paymentError.registrationId,
      JSON.stringify({ fixture: true, message: "simulated checkout error" }),
      new Date(now.getTime() - 8 * 60_000),
    ]
  );

  await client.query("commit");
  console.log("Seeded DEV-ADMIN-BUSY");
  console.log("40 paid students across live states + 3 active holds + 12 waitlist rows.");
  console.log("Includes stuck, offline/rejected, multi-client, start-cutoff, expired-hold, payment-error, and release-late alerts.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
