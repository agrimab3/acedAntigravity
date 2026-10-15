import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("deletion-review migration is additive and does not delete records", () => {
  const migration = read("drizzle/0032_account_deletion_review_workflow.sql");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS/);
  assert.doesNotMatch(migration, /\bDELETE\b|\bTRUNCATE\b|\bDROP\b/i);
});

test("admin review endpoint requires server-side admin authorization", () => {
  const source = read("app/api/admin/deletion-requests/[requestId]/route.ts");
  assert.match(source, /await getAdminSession\(\)/);
  assert.match(source, /new NextResponse\("Not Found", \{ status: 404 \}\)/);
  assert.match(source, /z\.enum\(deletionRequestStatuses\)/);
  assert.match(source, /max\(2000\)/);
});

test("review workflow cannot falsely mark a request completed", () => {
  const workflow = read("lib/account-deletion-workflow.ts");
  const route = read("app/api/admin/deletion-requests/[requestId]/route.ts");
  assert.match(workflow, /to !== "completed"/);
  assert.match(workflow, /from !== "completed"/);
  assert.doesNotMatch(route, /status:\s*"completed"/);
  assert.match(route, /cannot be marked completed by the review workflow/);
});

test("request review records status, verification, note, and update time without deletion", () => {
  const source = read("app/api/admin/deletion-requests/[requestId]/route.ts");
  assert.match(source, /identityVerificationStatus/);
  assert.match(source, /internalNote/);
  assert.match(source, /lastStatusUpdatedAt: now/);
  assert.doesNotMatch(source, /\.delete\(/);
});

test("student-facing account copy explains review and retention limits", () => {
  const source = read("app/account/page.tsx");
  assert.match(source, /does not delete your account or data immediately/);
  assert.match(source, /payment, legal, fraud-prevention, or security reasons/);
  assert.match(source, /duplicate requests/);
});
