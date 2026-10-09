import pg from "pg";

const { Client } = pg;
const setIds = [
  "e9d0f2b0-2d82-47fd-8872-68003bceb300",
  "d26d086b-ebbb-4c10-920d-8b4003f8c6f1",
  "bd0d6c51-0aa8-44a0-8132-11554dcc2dfe",
];

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("BEGIN");

  const before = await client.query(
    "SELECT id, status FROM questions WHERE question_set_id = ANY($1::uuid[])",
    [setIds]
  );

  const drafts = before.rows.filter((row) => row.status === "draft");
  if (before.rowCount !== 15 || drafts.length !== 15) {
    throw new Error(`Expected exactly 15 draft questions; found ${drafts.length} drafts across ${before.rowCount} rows.`);
  }

  const published = await client.query(
    `UPDATE questions
       SET status = 'published',
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE question_set_id = ANY($1::uuid[])
         AND status = 'draft'
       RETURNING id`,
    [setIds]
  );

  if (published.rowCount !== 15) {
    throw new Error(`Expected 15 published rows; updated ${published.rowCount}.`);
  }

  await client.query("COMMIT");

  const totals = await client.query(
    `SELECT t.slug AS topic, COUNT(*)::int AS count
       FROM questions q
       JOIN act_topics t ON t.id = q.topic_id
       WHERE q.section_key = 'science'
         AND q.status = 'published'
       GROUP BY t.slug
       ORDER BY t.slug`
  );

  console.log(JSON.stringify({ published: 15, topics: totals.rows }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
