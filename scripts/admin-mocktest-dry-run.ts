import pg from "pg";
import {
  calculateEnhancedComposite,
  estimateActScaleScore,
  type MockSectionKey,
} from "../lib/mockTest/scoring.ts";

const { Pool } = pg;
const args = new Set(process.argv.slice(2));
const valueAfter = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const action = ["--setup", "--score", "--cleanup"].find((flag) => args.has(flag));
const email = valueAfter("--email")?.trim().toLowerCase() ?? "";
const slug = valueAfter("--slug") ?? "2026-12-05";

if (!action || !args.has("--confirm") || !email) {
  throw new Error("Usage: node --experimental-strip-types --env-file=.env scripts/admin-mocktest-dry-run.ts --setup|--score|--cleanup --email <admin-email> --confirm");
}
if (process.env.NODE_ENV !== "production" || process.env.ACED_DEPLOYMENT_ENV !== "production") {
  throw new Error("This owner rehearsal tool runs only in the production deployment environment.");
}
if (!process.env.DATABASE_URL) throw new Error("Database configuration is unavailable.");
const admins = new Set((process.env.ADMIN_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
if (!admins.has(email)) throw new Error("Refusing: the requested account is not an authorized mock-test admin.");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const sections: MockSectionKey[] = ["english", "math", "reading", "science"];

try {
  await client.query("begin");
  const owner = await client.query("select id from users where lower(email)=lower($1) limit 1 for update", [email]);
  if (owner.rowCount !== 1) throw new Error("Authorized admin account was not found.");
  const test = await client.query("select id from mock_tests where slug=$1 limit 1 for update", [slug]);
  if (test.rowCount !== 1) throw new Error("Mock test was not found.");
  const userId = String(owner.rows[0].id);
  const mockTestId = String(test.rows[0].id);

  const registration = await client.query(
    `select id from mock_registrations
      where mock_test_id=$1 and user_id=$2
      limit 1 for update`,
    [mockTestId, userId],
  );

  if (action === "--setup") {
    if (registration.rowCount) throw new Error("This account already has a mock-test registration; refusing to alter it.");
    const until = new Date(Date.now() + 4 * 60 * 60 * 1000);
    await client.query(
      `insert into mock_registrations
       (mock_test_id,user_id,time_zone,agreed_no_refund_at,start_override_until,is_admin_dry_run,marketing_opt_in,created_at,updated_at)
       values($1,$2,'America/Los_Angeles',now(),$3,true,false,now(),now())`,
      [mockTestId, userId, until],
    );
    await client.query("commit");
    console.log(JSON.stringify({ ready: true, startOverrideUntil: until.toISOString(), seatsAffected: false, emailsQueued: 0 }));
  } else {
    if (registration.rowCount !== 1) throw new Error("No owner dry-run registration exists.");
    const registrationId = String(registration.rows[0].id);
    const verified = await client.query("select is_admin_dry_run from mock_registrations where id=$1", [registrationId]);
    if (verified.rows[0]?.is_admin_dry_run !== true) throw new Error("Refusing to touch a non-dry-run registration.");

    if (action === "--score") {
      const session = await client.query("select id,status from mock_test_sessions where registration_id=$1 limit 1 for update", [registrationId]);
      if (session.rows[0]?.status !== "completed") throw new Error("The dry-run test must be completed before it can be scored.");
      const answers = await client.query(
        `select mfq.section_key,mfq.correct_answer_snapshot,mta.selected_answer,mfq.topic_id_snapshot,mfq.topic_name_snapshot
           from mock_test_answers mta
           join mock_test_form_questions mfq on mfq.question_id=mta.question_id
           join mock_test_sessions mts on mts.id=mta.session_id and mts.form_id=mfq.form_id
          where mta.session_id=$1`,
        [session.rows[0].id],
      );
      if (answers.rowCount !== 171) throw new Error("Dry-run answer snapshot is incomplete.");
      const stats = Object.fromEntries(sections.map((key) => [key, { correct: 0, total: 0 }])) as Record<MockSectionKey, { correct: number; total: number }>;
      const topics = new Map<string, { key: MockSectionKey; id: string; name: string; correct: number; total: number }>();
      for (const row of answers.rows) {
        const key = row.section_key as MockSectionKey;
        if (!stats[key]) throw new Error("Unexpected section in answer snapshot.");
        const correct = row.selected_answer !== null && row.selected_answer === row.correct_answer_snapshot;
        stats[key].total += 1;
        if (correct) stats[key].correct += 1;
        const id = String(row.topic_id_snapshot);
        const topic = topics.get(id) ?? { key, id, name: String(row.topic_name_snapshot), correct: 0, total: 0 };
        topic.total += 1;
        if (correct) topic.correct += 1;
        topics.set(id, topic);
      }
      const scores = Object.fromEntries(sections.map((key) => [key, estimateActScaleScore(stats[key].correct, stats[key].total)])) as Record<MockSectionKey, number>;
      const composite = calculateEnhancedComposite({ english: scores.english, math: scores.math, reading: scores.reading });
      await client.query("delete from mock_test_topic_results where registration_id=$1", [registrationId]);
      for (const topic of topics.values()) {
        await client.query("insert into mock_test_topic_results(registration_id,section_key,topic_id,topic_name,correct_count,total_count,updated_at) values($1,$2,$3,$4,$5,$6,now())", [registrationId, topic.key, topic.id, topic.name, topic.correct, topic.total]);
      }
      await client.query("update mock_registrations set english_score=$2,math_score=$3,reading_score=$4,science_score=$5,composite=$6,percentile=null,updated_at=now() where id=$1", [registrationId, scores.english, scores.math, scores.reading, scores.science, composite]);
      await client.query("commit");
      console.log(JSON.stringify({ scored: true, sectionScores: scores, composite, percentileIncluded: false }));
    } else {
      await client.query("delete from mock_email_outbox where registration_id=$1", [registrationId]);
      await client.query("delete from mock_stripe_events where registration_id=$1", [registrationId]);
      await client.query("delete from mock_test_ops_events where registration_id=$1", [registrationId]);
      await client.query("delete from mock_registrations where id=$1 and is_admin_dry_run=true", [registrationId]);
      const remains = await client.query(
        `select (select count(*) from mock_registrations where id=$1) +
                (select count(*) from mock_test_sessions where registration_id=$1) +
                (select count(*) from mock_test_topic_results where registration_id=$1) +
                (select count(*) from mock_email_outbox where registration_id=$1) as count`,
        [registrationId],
      );
      if (Number(remains.rows[0]?.count ?? 1) !== 0) throw new Error("Cleanup did not remove every dry-run linked row.");
      await client.query("commit");
      console.log(JSON.stringify({ deleted: true, linkedRowsRemaining: 0 }));
    }
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
