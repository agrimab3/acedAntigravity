import pg from "pg";

const { Client } = pg;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query(
    `select status,results_release_at
     from mock_tests
     where slug='2026-12-05'
     limit 1`
  );
  const test = result.rows[0];
  if (!test) throw new Error("Dec 5 mock test is missing after migrations.");

  const releaseAt = new Date(test.results_release_at);
  if (Date.now() < releaseAt.getTime() && test.status === "released") {
    throw new Error(
      "Dec 5 mock test is marked released before its scheduled release. Refusing deploy."
    );
  }

  console.log(
    `Mock release state check passed: status=${test.status}, releaseAt=${releaseAt.toISOString()}`
  );
} finally {
  await client.end();
}
