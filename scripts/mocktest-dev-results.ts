import pg from "pg";
import { getMockTestServerNow } from "../lib/mockTest/devClock.ts";
import { releaseMockTest } from "../lib/mockTest/release.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (process.env.NODE_ENV === "production") {
  throw new Error("mocktest:dev-results is forbidden in production.");
}

const { Pool } = pg;
const args = Object.fromEntries(
  process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=") || "true"];
  })
);
const slug = String(args.slug || "2026-12-05");
const resetOnly = args.reset === "1" || args.reset === "true";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query("begin");
  const test = (await client.query(
    "select id,status from mock_tests where slug=$1 for update",
    [slug]
  )).rows[0];
  if (!test) throw new Error(`Mock test ${slug} not found.`);

  await client.query(
    "update mock_tests set status='open', composite_distribution=null where id=$1",
    [test.id]
  );
  await client.query(
    `update mock_registrations
     set english_score=null, math_score=null, reading_score=null, science_score=null,
         composite=null, percentile=null, updated_at=now()
     where mock_test_id=$1`,
    [test.id]
  );
  await client.query(
    `delete from mock_test_topic_results
     where registration_id in (
       select id from mock_registrations where mock_test_id=$1
     )`,
    [test.id]
  );
  await client.query("commit");
} catch (error) {
  try { await client.query("rollback"); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}

if (resetOnly) {
  console.log(JSON.stringify({ reset: true, slug }, null, 2));
  process.exit(0);
}

const result = await releaseMockTest({
  connectionString: process.env.DATABASE_URL,
  slug,
  now: getMockTestServerNow(),
  includeDev: true,
});
console.log(JSON.stringify(result, null, 2));
