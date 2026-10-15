import "server-only";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

type Database = NodePgDatabase<typeof schema>;

type RawCounts = Record<string, number | string | null | undefined>;

export type DeletionImpactCategory =
  | "eligible_for_approval"
  | "retention_review"
  | "third_party_action"
  | "blocked_pending_review";

export type DeletionImpactItem = {
  key: string;
  label: string;
  count: number | null;
  category: DeletionImpactCategory;
  relationship: "cascade" | "set_null" | "restrict" | "external" | "unlinked";
  note: string;
};

export type DeletionHold = {
  key: string;
  severity: "pause" | "review";
  message: string;
};

export type DeletionDryRunInventory = {
  dryRunOnly: true;
  items: DeletionImpactItem[];
  holds: DeletionHold[];
  unresolvedRules: string[];
};

function count(row: RawCounts, key: string) {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * Returns aggregate counts only. This function never selects student answers,
 * messages, payment identifiers, or other record contents.
 */
async function loadCounts(db: Database, userId: string) {
  const result = await db.execute(sql`
    WITH registrations AS (
      SELECT id FROM mock_registrations WHERE user_id = ${userId}
    ), mock_sessions AS (
      SELECT id FROM mock_test_sessions WHERE registration_id IN (SELECT id FROM registrations)
    ), practice_test_sessions_for_user AS (
      SELECT id FROM practice_test_sessions WHERE user_id = ${userId}
    )
    SELECT
      (SELECT count(*)::int FROM user_identities WHERE user_id = ${userId}) AS user_identities,
      (SELECT count(*)::int FROM practice_sessions WHERE user_id = ${userId}) AS practice_sessions,
      (SELECT count(*)::int FROM practice_answers WHERE user_id = ${userId}) AS practice_answers,
      (SELECT count(*)::int FROM practice_tutor_states WHERE user_id = ${userId}) AS practice_tutor_states,
      (SELECT count(*)::int FROM topic_mastery WHERE user_id = ${userId}) AS topic_mastery,
      (SELECT count(*)::int FROM topic_skill_state WHERE user_id = ${userId}) AS topic_skill_state,
      (SELECT count(*)::int FROM question_exposures WHERE user_id = ${userId}) AS question_exposures,
      (SELECT count(*)::int FROM practice_test_sessions WHERE user_id = ${userId}) AS practice_test_sessions,
      (SELECT count(*)::int FROM practice_test_sections WHERE session_id IN (SELECT id FROM practice_test_sessions_for_user)) AS practice_test_sections,
      (SELECT count(*)::int FROM practice_test_answers WHERE user_id = ${userId}) AS practice_test_answers,
      (SELECT count(*)::int FROM mock_registrations WHERE user_id = ${userId}) AS mock_registrations,
      (SELECT count(*)::int FROM mock_test_sessions WHERE registration_id IN (SELECT id FROM registrations)) AS mock_test_sessions,
      (SELECT count(*)::int FROM mock_test_section_runs WHERE session_id IN (SELECT id FROM mock_sessions)) AS mock_test_section_runs,
      (SELECT count(*)::int FROM mock_test_answers WHERE session_id IN (SELECT id FROM mock_sessions)) AS mock_test_answers,
      (SELECT count(*)::int FROM mock_test_topic_results WHERE registration_id IN (SELECT id FROM registrations)) AS mock_test_topic_results,
      (SELECT count(*)::int FROM mock_test_client_presence WHERE registration_id IN (SELECT id FROM registrations)) AS mock_test_client_presence,
      (SELECT count(*)::int FROM mock_email_outbox WHERE registration_id IN (SELECT id FROM registrations)) AS mock_email_outbox,
      (SELECT count(*)::int FROM mock_test_ops_events WHERE registration_id IN (SELECT id FROM registrations)) AS mock_test_ops_events,
      (SELECT count(*)::int FROM mock_stripe_events WHERE registration_id IN (SELECT id FROM registrations)) AS mock_stripe_events,
      (SELECT count(*)::int FROM mock_waitlist WHERE user_id = ${userId}) AS mock_waitlist,
      (SELECT count(*)::int FROM feedback WHERE user_id = ${userId}) AS feedback,
      (SELECT count(*)::int FROM legal_terms_acceptance_history WHERE user_id = ${userId}) AS consent_history,
      (SELECT count(*)::int FROM account_deletion_requests WHERE user_id = ${userId}) AS deletion_requests,
      (SELECT count(*)::int FROM mock_test_sessions WHERE registration_id IN (SELECT id FROM registrations) AND status = 'in_progress') AS active_mock_sessions,
      (SELECT count(*)::int FROM practice_test_sessions WHERE user_id = ${userId} AND status = 'in_progress') AS active_practice_test_sessions,
      (SELECT count(*)::int FROM mock_registrations WHERE user_id = ${userId} AND paid_at IS NULL AND hold_expires_at > now()) AS active_payment_holds,
      (SELECT count(*)::int FROM mock_registrations WHERE user_id = ${userId} AND stripe_refund_id IS NOT NULL AND refunded_at IS NULL) AS pending_refunds,
      (SELECT count(*)::int FROM mock_registrations WHERE user_id = ${userId} AND (paid_at IS NOT NULL OR stripe_checkout_session_id IS NOT NULL OR stripe_payment_intent_id IS NOT NULL OR stripe_refund_id IS NOT NULL)) AS payment_related_registrations,
      (SELECT count(*)::int FROM questions WHERE reviewed_by_user_id = ${userId}) AS reviewed_questions,
      (SELECT count(*)::int FROM mock_test_forms WHERE locked_by_user_id = ${userId}) AS locked_forms
  `);
  return (result.rows[0] ?? {}) as RawCounts;
}

export function buildDeletionDryRunInventory(counts: RawCounts): DeletionDryRunInventory {
  const items: DeletionImpactItem[] = [
    { key: "user-identities", label: "Google/account identities", count: count(counts, "user_identities"), category: "eligible_for_approval", relationship: "cascade", note: "Would cascade only under a future approved execution process." },
    { key: "practice", label: "Practice sessions, answers, tutor state, mastery, skill state, and exposures", count: count(counts, "practice_sessions") + count(counts, "practice_answers") + count(counts, "practice_tutor_states") + count(counts, "topic_mastery") + count(counts, "topic_skill_state") + count(counts, "question_exposures"), category: "eligible_for_approval", relationship: "cascade", note: "Learning records are directly user-linked. Eligibility for deletion or anonymization still requires an approved execution plan." },
    { key: "practice-tests", label: "Practice-test sessions, sections, and answers", count: count(counts, "practice_test_sessions") + count(counts, "practice_test_sections") + count(counts, "practice_test_answers"), category: "eligible_for_approval", relationship: "cascade", note: "Candidate learning data only; do not execute while a practice test is in progress." },
    { key: "mock-learning", label: "Mock-test registration, session, answer, result, and client-presence records", count: count(counts, "mock_registrations") + count(counts, "mock_test_sessions") + count(counts, "mock_test_section_runs") + count(counts, "mock_test_answers") + count(counts, "mock_test_topic_results") + count(counts, "mock_test_client_presence"), category: "retention_review", relationship: "cascade", note: "Cascade-linked but potentially subject to score, payment, refund, support, and legal retention review." },
    { key: "payments", label: "Payment and refund-linked mock-test records", count: count(counts, "payment_related_registrations") + count(counts, "mock_stripe_events"), category: "retention_review", relationship: "set_null", note: "No retention period is assumed. Stripe references and local event evidence need accounting and legal approval before any execution." },
    { key: "email-outbox", label: "Transactional mock-test email outbox", count: count(counts, "mock_email_outbox"), category: "retention_review", relationship: "cascade", note: "May contain delivery/support evidence and must be reviewed before a future execution; provider-held copies require separate handling." },
    { key: "operations", label: "Mock-test operations events", count: count(counts, "mock_test_ops_events"), category: "retention_review", relationship: "set_null", note: "Operational/audit records are retained as a separate review decision; a registration deletion would set its link to null." },
    { key: "feedback", label: "Feedback", count: count(counts, "feedback"), category: "eligible_for_approval", relationship: "set_null", note: "A future execution can consider unlinking account association without automatically deleting feedback content." },
    { key: "mock-waitlist", label: "Mock-test waitlist rows", count: count(counts, "mock_waitlist"), category: "retention_review", relationship: "set_null", note: "User linkage can be removed by a future execution, but waitlist email data needs a separately approved scope." },
    { key: "consent", label: "Append-only Terms acceptance history", count: count(counts, "consent_history"), category: "blocked_pending_review", relationship: "restrict", note: "The legal_terms_acceptance_history foreign key is ON DELETE RESTRICT and the table blocks UPDATE/DELETE. A future process must not delete the user until counsel/owner approves a retention approach." },
    { key: "deletion-requests", label: "Deletion-request review history", count: count(counts, "deletion_requests"), category: "retention_review", relationship: "cascade", note: "The current relationship would cascade, but the retention policy requires a deliberate decision about a minimal request/audit record." },
    { key: "staff-links", label: "Question-review and form-lock references", count: count(counts, "reviewed_questions") + count(counts, "locked_forms"), category: "retention_review", relationship: "set_null", note: "These are staff-style references. A future execution would set the linkage to null and should verify role/context first." },
    { key: "support-security", label: "Support, admin-audit, security, and application-log records", count: null, category: "blocked_pending_review", relationship: "unlinked", note: "No safe, direct student foreign-key inventory exists for these records. This dry run does not search message text, audit targets, IP data, or logs; a future approved process must use a minimal, separately reviewed plan." },
    { key: "providers", label: "Provider-held data and backups", count: null, category: "third_party_action", relationship: "external", note: "Google, Stripe, Resend, Groq, hosting, Sentry, and backup copies require separate provider or approved operational processes. This dry run does not query them." },
    { key: "email-only-records", label: "Public waitlist and join requests", count: null, category: "blocked_pending_review", relationship: "unlinked", note: "These tables have no user foreign key. This dry run intentionally does not match by email, avoiding cross-account disclosure or accidental targeting." },
  ];

  const holds: DeletionHold[] = [];
  if (count(counts, "active_mock_sessions") > 0) holds.push({ key: "active-mock-test", severity: "pause", message: "An active mock-test session exists. Do not plan execution until participation and results obligations are resolved." });
  if (count(counts, "active_practice_test_sessions") > 0) holds.push({ key: "active-practice-test", severity: "pause", message: "A practice test is in progress. Do not plan execution until the active work is safely resolved." });
  if (count(counts, "active_payment_holds") > 0) holds.push({ key: "active-payment-hold", severity: "pause", message: "An active unpaid mock-test payment hold exists." });
  if (count(counts, "pending_refunds") > 0) holds.push({ key: "pending-refund", severity: "pause", message: "A refund reference exists without a recorded completion time." });
  holds.push({ key: "manual-security-dispute-review", severity: "review", message: "No database-backed security-hold or dispute ledger was found. Owner/admin must separately check security, dispute, provider, and support holds before Phase 2." });
  holds.push({ key: "consent-history-restriction", severity: "review", message: "Append-only Terms acceptance history blocks user deletion until a lawful retention decision and approved execution design exist." });

  return {
    dryRunOnly: true,
    items,
    holds,
    unresolvedRules: [
      "No legal, accounting, payment, refund, consent, security, or backup retention period is assumed by this inventory.",
      "No provider-held data is inspected or changed. Provider deletion requests and retention settings require separate approval.",
      "This inventory is aggregate-only and is not an authorization to delete, anonymize, purge, or close an account.",
    ],
  };
}

export async function getDeletionDryRunInventory(db: Database, userId: string) {
  return buildDeletionDryRunInventory(await loadCounts(db, userId));
}
