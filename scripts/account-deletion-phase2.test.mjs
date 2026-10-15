import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const schema = read("db/schema.ts");
const migration = read("drizzle/0034_account_deletion_execution_control_plane.sql");
const planRoute = read("app/api/admin/deletion-requests/[requestId]/execution-plan/route.ts");
const authorizationRoute = read("app/api/admin/deletion-requests/[requestId]/execution-plan/final-authorize/route.ts");
const controlPlane = read("lib/account-deletion-execution.ts");

test("Phase 2 control plane is additive, request-bound, and has append-only lifecycle events", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "account_deletion_executions"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "account_deletion_execution_events"/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS "account_deletion_executions_request_idx"/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(schema, /accountDeletionExecutions/);
});

test("plan preparation is admin-only and derives the target only from a verified deletion request", () => {
  assert.match(planRoute, /await getAdminSession\(\)/);
  assert.match(planRoute, /identityVerificationStatus !== "verified"/);
  assert.match(planRoute, /targetUserId: deletionRequest\.userId/);
  assert.match(planRoute, /getDeletionDryRunInventory\(db, deletionRequest\.userId\)/);
  assert.doesNotMatch(planRoute, /searchParams\.get\(["'](?:userId|email)/);
});

test("duplicate plan requests are idempotent and retain a frozen aggregate-only plan", () => {
  assert.match(migration, /account_deletion_executions_request_idx/);
  assert.match(planRoute, /onConflictDoNothing\(\)/);
  assert.match(planRoute, /frozenPlan: plan/);
  assert.match(controlPlane, /verificationChecklist/);
  assert.match(controlPlane, /blockingKeys/);
});

test("final authorization enforces a distinct preparer, stale-plan checks, holds, and permanent execution disablement", () => {
  assert.match(authorizationRoute, /preparedByAdminEmail: record\.preparedByAdminEmail/);
  assert.match(authorizationRoute, /planDigestMatches/);
  assert.match(authorizationRoute, /BLOCKERS_PRESENT/);
  assert.match(authorizationRoute, /EXECUTION_DISABLED/);
  assert.match(authorizationRoute, /status: 409/);
  assert.doesNotMatch(authorizationRoute, /\.delete\(/);
});

test("Terms protections and destructive operations remain unavailable", () => {
  assert.match(controlPlane, /terms-history/);
  assert.doesNotMatch(planRoute, /\.delete\(|DELETE FROM|TRUNCATE|DROP /);
  assert.doesNotMatch(authorizationRoute, /\.delete\(|DELETE FROM|TRUNCATE|DROP /);
  assert.doesNotMatch(migration, /DELETE\s+FROM|TRUNCATE|DROP\s+TABLE/i);
});
