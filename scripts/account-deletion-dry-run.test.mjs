import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const route = read("app/api/admin/deletion-requests/[requestId]/dry-run/route.ts");
const inventory = read("lib/account-deletion-dry-run.ts");

test("dry-run inventory is admin-only and does not reveal request existence to non-admins", () => {
  assert.match(route, /await getAdminSession\(\)/);
  assert.match(route, /new NextResponse\("Not Found", \{ status: 404 \}\)/);
});

test("dry run derives its target from a deletion request instead of arbitrary account input", () => {
  assert.match(route, /requestIdPattern/);
  assert.match(route, /where\(eq\(accountDeletionRequests\.id, requestId\)\)/);
  assert.match(route, /getDeletionDryRunInventory\(db, deletionRequest\.userId\)/);
  assert.doesNotMatch(route, /searchParams\.get\(["']userId|searchParams\.get\(["']email/);
});

test("dry run requires an open, identity-verified request", () => {
  assert.match(route, /identityVerificationStatus !== "verified"/);
  assert.match(route, /status === "completed"/);
  assert.match(route, /status: 409/);
});

test("inventory covers direct learning, mock-test, payment, email, support, consent, and request relationships", () => {
  for (const table of [
    "practice_sessions", "practice_answers", "practice_tutor_states", "topic_mastery",
    "topic_skill_state", "question_exposures", "practice_test_sessions", "practice_test_answers",
    "mock_registrations", "mock_test_sessions", "mock_test_answers", "mock_email_outbox",
    "mock_stripe_events", "feedback", "legal_terms_acceptance_history", "account_deletion_requests",
  ]) assert.match(inventory, new RegExp(table));
  assert.match(inventory, /Support, admin-audit, security, and application-log records/);
  assert.match(inventory, /Provider-held data and backups/);
  assert.match(inventory, /Public waitlist and join requests/);
});

test("inventory identifies active-work and payment/refund holds without inspecting record contents", () => {
  assert.match(inventory, /active_mock_sessions/);
  assert.match(inventory, /active_payment_holds/);
  assert.match(inventory, /pending_refunds/);
  assert.match(inventory, /manual-security-dispute-review/);
  assert.match(inventory, /aggregate counts only/);
});

test("consent history is explicitly a no-delete constraint and Phase 1 has no execution operation", () => {
  assert.match(inventory, /ON DELETE RESTRICT/);
  assert.match(inventory, /append-only Terms acceptance history blocks user deletion/i);
  assert.doesNotMatch(route, /\.delete\(|\.update\(|\.insert\(/);
  assert.match(route, /dryRunOnly: true/);
});
