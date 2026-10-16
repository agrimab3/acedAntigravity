import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const root = process.cwd();
const journal = JSON.parse(await readFile(path.join(root, "drizzle/meta/_journal.json"), "utf8"));
const expectedHashes = await Promise.all(journal.entries.map(async ({ tag }) => {
  const contents = await readFile(path.join(root, "drizzle", `${tag}.sql`));
  return createHash("sha256").update(contents).digest("hex");
}));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to verify applied migrations.");
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const result = await client.query(
    "select hash from drizzle.__drizzle_migrations where hash = any($1::text[])",
    [expectedHashes],
  );
  const applied = new Set(result.rows.map((row) => row.hash));
  const missing = expectedHashes.filter((hash) => !applied.has(hash));
  if (missing.length > 0) {
    throw new Error(`Migration verification failed: ${missing.length} required migration(s) are absent from the ledger.`);
  }
  console.log(`Verified ${expectedHashes.length} required Drizzle migrations in the ledger.`);
} finally {
  await client.end().catch(() => undefined);
}
