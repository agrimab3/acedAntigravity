import pg from "pg";
import { releaseMockTest } from "../lib/mockTest/release.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (process.env.NODE_ENV === "production") {
  throw new Error("mocktest:seed-results is forbidden in production.");
}

const url = new URL(process.env.DATABASE_URL);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (!localHosts.has(url.hostname)) {
  throw new Error("Refusing to seed mock results outside a local development database.");
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const raw = arg.slice(2);
    if (raw.includes("=")) {
      const [key, ...rest] = raw.split("=");
      result[key] = rest.join("=");
    } else {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        result[raw] = next;
        index += 1;
      } else {
        result[raw] = "true";
      }
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const slug = String(args.slug || "2026-12-05");
const count = Math.max(1, Math.min(50, Number(args.count || 15)));
const resetOnly = args.reset === "true" || args.reset === "1";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sectionOrder = ["english", "math", "reading", "science"];
const timeLimits = { english: 35 * 60, math: 50 * 60, reading: 40 * 60, science: 40 * 60 };
const baseTargets = [14, 17, 19, 20, 21, 22, 22, 23, 23, 24, 24, 25, 26, 28, 32];

function targetFor(index) {
  if (count === 1) return 24;
  const sourceIndex = Math.round((index / (count - 1)) * (baseTargets.length - 1));
  return baseTargets[sourceIndex];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function correctNeeded(score, total) {
  return clamp(Math.round(((score - 1) * total) / 35), 0, total);
}

function seededShuffle(length, seed) {
  const values = Array.from({ length }, (_, index) => index);
  let state = seed >>> 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function wrongAnswer(correct, salt) {
  const letters = ["A", "B", "C", "D"];
  const current = letters.indexOf(correct);
  return letters[(current + 1 + (salt % 3)) % 4];
}

async function clearReleaseArtifacts(client, mockTestId) {
  await client.query(
    "update mock_tests set status='open', composite_distribution=null where id=$1",
    [mockTestId]
  );
  await client.query(
    "delete from mock_test_topic_results where registration_id in (select id from mock_registrations where mock_test_id=$1)",
    [mockTestId]
  );
  await client.query(
    "update mock_registrations set english_score=null, math_score=null, reading_score=null, science_score=null, composite=null, percentile=null, updated_at=now() where mock_test_id=$1",
    [mockTestId]
  );
}

async function deleteSeedStudents(client, mockTestId) {
  const seeded = await client.query(
    "select id from users where email ~ '^student[0-9]+@aced\\.test$'"
  );
  const ids = seeded.rows.map((row) => row.id);
  if (ids.length) {
    await client.query("delete from users where id = any($1::uuid[])", [ids]);
  }
  await clearReleaseArtifacts(client, mockTestId);
  return ids.length;
}

async function buildAttempt(client, {
  mockTestId,
  formId,
  userId,
  email,
  assignments,
  sectionTargets,
  seed,
}) {
  const registration = (
    await client.query(
      "insert into mock_registrations " +
        "(mock_test_id,user_id,time_zone,agreed_no_refund_at,paid_at,started_at,finished_at,updated_at) " +
        "values($1,$2,'America/Los_Angeles',now(),now(),now()-interval '3 hours',now(),now()) " +
        "on conflict (mock_test_id,user_id) do update set " +
        "paid_at=now(), hold_expires_at=null, started_at=now()-interval '3 hours', finished_at=now(), " +
        "english_score=null, math_score=null, reading_score=null, science_score=null, composite=null, percentile=null, updated_at=now() " +
        "returning id",
      [mockTestId, userId]
    )
  ).rows[0];

  await client.query("delete from mock_test_sessions where registration_id=$1", [registration.id]);

  const session = (
    await client.query(
      "insert into mock_test_sessions " +
        "(registration_id,form_id,status,current_section_order,started_at,completed_at,updated_at) " +
        "values($1,$2,'completed',3,now()-interval '3 hours',now(),now()) returning id",
      [registration.id, formId]
    )
  ).rows[0];

  const sectionRuns = new Map();
  for (let order = 0; order < sectionOrder.length; order += 1) {
    const key = sectionOrder[order];
    const run = (
      await client.query(
        "insert into mock_test_section_runs " +
          "(session_id,section_key,section_order,time_limit_seconds,started_at,deadline_at,completed_at,updated_at) " +
          "values($1,$2,$3,$4,now()-interval '2 hours',now()-interval '1 hour',now(),now()) returning id",
        [session.id, key, order, timeLimits[key]]
      )
    ).rows[0];
    sectionRuns.set(key, run.id);
  }

  for (const key of sectionOrder) {
    const rows = assignments.filter((row) => row.section_key === key);
    const desiredCorrect = correctNeeded(sectionTargets[key], rows.length);
    const chosen = new Set(seededShuffle(rows.length, seed + sectionOrder.indexOf(key) * 997).slice(0, desiredCorrect));

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const selected = chosen.has(index)
        ? row.correct_answer_snapshot
        : wrongAnswer(row.correct_answer_snapshot, index + seed);
      await client.query(
        "insert into mock_test_answers " +
          "(session_id,section_run_id,question_id,question_order,selected_answer,flagged,answered_at,updated_at) " +
          "values($1,$2,$3,$4,$5,false,now(),now())",
        [session.id, sectionRuns.get(key), row.question_id, row.position, selected]
      );
    }
  }

  return { email, sectionTargets };
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const mock = (
      await client.query(
        "select id,results_release_at from mock_tests where slug=$1 for update",
        [slug]
      )
    ).rows[0];
    if (!mock) throw new Error("Mock test " + slug + " not found.");

    const deleted = await deleteSeedStudents(client, mock.id);

    if (resetOnly) {
      await client.query("commit");
      console.log(JSON.stringify({ reset: true, slug, deletedSeedStudents: deleted }, null, 2));
      return;
    }

    const form = (
      await client.query(
        "select id from mock_test_forms where mock_test_id=$1 and version='DEV' and status='locked' limit 1",
        [mock.id]
      )
    ).rows[0];
    if (!form) throw new Error("Locked DEV form not found. Run npm run mocktest:dev-rehearsal first.");

    const assignments = (
      await client.query(
        "select question_id,section_key,position,correct_answer_snapshot " +
          "from mock_test_form_questions where form_id=$1 order by section_key,position",
        [form.id]
      )
    ).rows;
    if (assignments.length !== 171) {
      throw new Error("DEV form must contain 171 frozen questions; found " + assignments.length + ".");
    }

    const localUser = (
      await client.query(
        "select id,email from users where lower(email)='local-test-user@aced.local' limit 1"
      )
    ).rows[0];
    if (!localUser) throw new Error("local-test-user@aced.local not found.");

    const created = [];
    created.push(
      await buildAttempt(client, {
        mockTestId: mock.id,
        formId: form.id,
        userId: localUser.id,
        email: localUser.email,
        assignments,
        sectionTargets: { english: 27, math: 25, reading: 29, science: 24 },
        seed: 7001,
      })
    );

    for (let index = 0; index < count; index += 1) {
      const number = String(index + 1).padStart(2, "0");
      const email = "student" + number + "@aced.test";
      const user = (
        await client.query(
          "insert into users(email,name,created_at,updated_at) values($1,$2,now(),now()) " +
            "on conflict (email) do update set updated_at=now() returning id,email",
          [email, "Mock Student " + number]
        )
      ).rows[0];

      const base = targetFor(index);
      const targets = {
        english: clamp(base + ((index % 3) - 1), 14, 33),
        math: clamp(base + (((index + 1) % 3) - 1), 14, 33),
        reading: clamp(base + (((index + 2) % 3) - 1), 14, 33),
        science: clamp(base + ((index % 5) - 2), 14, 33),
      };

      created.push(
        await buildAttempt(client, {
          mockTestId: mock.id,
          formId: form.id,
          userId: user.id,
          email,
          assignments,
          sectionTargets: targets,
          seed: 11000 + index * 313,
        })
      );
    }

    await client.query("commit");

    const releaseAt = new Date(mock.results_release_at);
    const release = await releaseMockTest({
      connectionString: process.env.DATABASE_URL,
      slug,
      now: new Date(releaseAt.getTime() + 1000),
      includeDev: true,
    });

    console.log(
      JSON.stringify(
        {
          seeded: true,
          slug,
          testStudents: count,
          totalFinishedIncludingLocal: count + 1,
          localTargets: created[0].sectionTargets,
          release,
        },
        null,
        2
      )
    );
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
