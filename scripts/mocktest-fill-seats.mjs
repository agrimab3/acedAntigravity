import pg from "pg";

const { Pool } = pg;

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to create fake mock-test registrations in production.");
  process.exit(1);
}

function readNumberFlag(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = Number(process.argv[index + 1]);
  return Number.isInteger(value) && value >= 0 ? value : NaN;
}

const countFlag = readNumberFlag("--count");
const targetTakenFlag = readNumberFlag("--target-taken");
if (Number.isNaN(countFlag) || Number.isNaN(targetTakenFlag) || (countFlag === null && targetTakenFlag === null)) {
  console.error("Usage: npm run mocktest:fill-seats -- --target-taken 99");
  console.error("   or: npm run mocktest:fill-seats -- --count 99");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const slug = process.env.MOCK_TEST_SLUG ?? "2026-12-05";
const prefix = "mocktest-seat-fill-";
const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const testResult = await client.query(
    `SELECT id, seat_limit FROM mock_tests WHERE slug = $1 FOR UPDATE`,
    [slug]
  );
  if (testResult.rowCount !== 1) throw new Error(`Mock test ${slug} not found.`);

  const mockTestId = testResult.rows[0].id;
  const seatLimit = Number(testResult.rows[0].seat_limit);

  await client.query(
    `DELETE FROM mock_registrations
     WHERE mock_test_id = $1
       AND user_id IN (SELECT id FROM users WHERE email LIKE $2)`,
    [mockTestId, `${prefix}%@example.test`]
  );
  await client.query(`DELETE FROM users WHERE email LIKE $1`, [`${prefix}%@example.test`]);

  const existingResult = await client.query(
    `SELECT COUNT(*)::int AS taken
     FROM mock_registrations
     WHERE mock_test_id = $1
       AND (paid_at IS NOT NULL OR (hold_expires_at IS NOT NULL AND hold_expires_at > NOW()))`,
    [mockTestId]
  );
  const existingTaken = Number(existingResult.rows[0].taken);
  const fakeCount = targetTakenFlag !== null
    ? Math.max(0, targetTakenFlag - existingTaken)
    : countFlag;

  if (targetTakenFlag !== null && targetTakenFlag < existingTaken) {
    throw new Error(`Cannot target ${targetTakenFlag} taken seats because ${existingTaken} non-fake seats are already taken.`);
  }

  for (let index = 1; index <= fakeCount; index += 1) {
    const email = `${prefix}${String(index).padStart(3, "0")}@example.test`;
    const userResult = await client.query(
      `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
      [email, `Seat Fill ${index}`]
    );
    await client.query(
      `INSERT INTO mock_registrations (
         mock_test_id, user_id, time_zone, agreed_no_refund_at, marketing_opt_in, paid_at, hold_expires_at
       ) VALUES ($1, $2, $3, NOW(), false, NOW(), NULL)`,
      [mockTestId, userResult.rows[0].id, "America/Los_Angeles"]
    );
  }

  const statusResult = await client.query(
    `SELECT
       mt.seat_limit AS limit,
       COUNT(mr.id) FILTER (
         WHERE mr.paid_at IS NOT NULL
            OR (mr.hold_expires_at IS NOT NULL AND mr.hold_expires_at > NOW())
       )::int AS taken
     FROM mock_tests mt
     LEFT JOIN mock_registrations mr ON mr.mock_test_id = mt.id
     WHERE mt.id = $1
     GROUP BY mt.id, mt.seat_limit`,
    [mockTestId]
  );

  await client.query("COMMIT");
  const taken = Number(statusResult.rows[0].taken);
  const remaining = Math.max(0, seatLimit - taken);
  console.log(`Created ${fakeCount} fake paid registrations for ${slug}.`);
  console.log(`Real DB seat status: ${taken}/${seatLimit} taken, ${remaining} remaining.`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
