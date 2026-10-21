import pg from "pg";

const runId = process.argv.find((arg) => arg.startsWith("--run-id="))?.slice("--run-id=".length);
if (!/^[0-9a-f-]{36}$/i.test(runId || "")) {
  throw new Error("Usage: node scripts/content-factory-run-report.mjs --run-id=<uuid>");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const result = await client.query(
    `SELECT section_key, final_disposition, failed_check, final_reason,
            correct_answer, verifier_result->>'chosen_answer' AS blind_answer
       FROM question_generation_audits
      WHERE run_id = $1
      ORDER BY section_key, created_at`,
    [runId]
  );

  const sections = {};
  for (const row of result.rows) {
    const section = sections[row.section_key] ?? {
      saved: 0,
      rejected: 0,
      skipped: 0,
      skipReasons: {},
      blindVerifier: [],
    };
    if (row.final_disposition === "stored_draft") section.saved += 1;
    else if (String(row.final_disposition).startsWith("skipped") || row.final_disposition === "provider_schema_failure") section.skipped += 1;
    else section.rejected += 1;

    if (row.final_disposition !== "stored_draft") {
      const reason = row.failed_check || row.final_reason || "No reason recorded.";
      section.skipReasons[reason] = (section.skipReasons[reason] ?? 0) + 1;
    }
    if (row.blind_answer) {
      section.blindVerifier.push({ key: row.correct_answer, answer: row.blind_answer });
    }
    sections[row.section_key] = section;
  }

  console.log(JSON.stringify({ runId, sections }, null, 2));
} finally {
  await client.end();
}
