import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

function readNumberFlag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isInteger(value) && value >= 0 ? value : NaN;
}

const count = readNumberFlag("--count");
const raiseLimit = readNumberFlag("--raise-limit", count);
if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(raiseLimit) || raiseLimit < 0) {
  console.error("Usage: npm run mocktest:invite -- --count 50 [--raise-limit 50]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const slug = process.env.MOCK_TEST_SLUG ?? "2026-12-05";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const testResult = await client.query(
    `SELECT id, seat_limit FROM mock_tests WHERE slug = $1 FOR UPDATE`,
    [slug]
  );
  if (testResult.rowCount !== 1) throw new Error(`Mock test ${slug} not found.`);

  const mockTestId = testResult.rows[0].id;
  const oldLimit = Number(testResult.rows[0].seat_limit);
  const newLimit = oldLimit + raiseLimit;
  await client.query(`UPDATE mock_tests SET seat_limit = $1 WHERE id = $2`, [newLimit, mockTestId]);

  const waitlistResult = await client.query(
    `SELECT id, email
     FROM mock_waitlist
     WHERE mock_test_id = $1
       AND invited_at IS NULL
     ORDER BY created_at ASC, id ASC
     LIMIT $2
     FOR UPDATE SKIP LOCKED`,
    [mockTestId, count]
  );

  const invitations = [];
  for (const row of waitlistResult.rows) {
    const token = crypto.randomBytes(24).toString("hex");
    await client.query(
      `UPDATE mock_waitlist
       SET invited_at = NOW(), invite_token = $1
       WHERE id = $2`,
      [token, row.id]
    );
    invitations.push({
      email: row.email,
      link: `/mock-test/signup?invite=${token}`,
    });
  }

  await client.query("COMMIT");

  console.log(`Seat limit raised from ${oldLimit} to ${newLimit}.`);
  console.log(`Invited ${invitations.length} waitlist ${invitations.length === 1 ? "student" : "students"}.`);
  if (invitations.length < count) {
    console.log(`Only ${invitations.length} un-invited waitlist rows were available.`);
  }
  console.log("");
  for (const invitation of invitations) {
    console.log(`${invitation.email}  ${invitation.link}`);
  }
  // TODO(mock-test-emails): send each invite email here when email delivery is built.
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
