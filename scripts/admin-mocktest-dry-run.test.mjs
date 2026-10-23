import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const migration = read("drizzle/0036_admin_mock_test_dry_run.sql");
const runner = read("lib/mockTest/runner.ts");
const release = read("lib/mockTest/release.ts");
const tool = read("scripts/admin-mocktest-dry-run.ts");

test("admin mock-test dry runs are explicit and additive", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "is_admin_dry_run" boolean DEFAULT false NOT NULL/);
  assert.match(migration, /WHERE "is_admin_dry_run" = true/);
});

test("only an explicitly flagged registration can start free", () => {
  assert.match(runner, /paidAt: mockRegistrations\.paidAt,/);
  assert.match(runner, /isAdminDryRun: mockRegistrations\.isAdminDryRun/);
  assert.match(runner, /paidAt} is not null or \$\{mockRegistrations\.isAdminDryRun\} = true/);
});

test("rehearsals do not enter the release or percentile cohort", () => {
  assert.match(release, /mr\.is_admin_dry_run=false/);
});

test("owner tool never charges, queues mail, or cleans a non-dry registration", () => {
  assert.match(tool, /is_admin_dry_run,marketing_opt_in/);
  assert.match(tool, /true,false,now\(\),now\(\)/);
  assert.match(tool, /is_admin_dry_run !== true/);
  assert.match(tool, /delete from mock_registrations where id=\$1 and is_admin_dry_run=true/);
  assert.doesNotMatch(tool, /stripe\.checkout|createCheckout|queue.*Email/i);
});
