# Account Deletion Phase 2: Retention Decisions and Execution Design

Status: design only, owner approval and qualified legal/accounting review required before implementation.

This document designs a future fulfillment process for verified account-deletion requests. It does not authorize a database migration, application change, purge, provider request, or account deletion. Phase 1, deployed at the admin deletion-request workflow, is an aggregate, read-only inventory only.

## Phase 2 control-plane implementation status

The non-destructive control plane records a request-bound, aggregate-only frozen plan, lifecycle status, safe blocker keys, and append-only lifecycle events. It deliberately has no execution endpoint, worker, provider call, delete/anonymize operation, or Terms-history bypass. Final authorization returns a non-destructive blocked result until separate owner authorization and all applicable retention requirements are resolved.

## Non-negotiable execution boundaries

- Execute only for one existing `account_deletion_requests` row that is open, identity-verified, and separately approved for execution.
- Derive the target account exclusively from that request. Never accept a user ID, email address, Stripe ID, or provider ID supplied by an administrator as a deletion target.
- Query and mutate only records connected to that target through documented foreign keys or a separately approved, verified ownership process.
- Do not match `waitlist_signups` or `join_requests` by email. They are email-only records and require independently verified ownership before any action.
- Do not use a cascade delete of `users` as the execution mechanism. It would remove records before retention decisions are applied and is blocked by Terms-history `ON DELETE RESTRICT`.
- Never write raw student content, payment identifiers, messages, answers, provider identifiers, or full inventory output to application logs, Sentry, or an admin audit note.
- No destructive action may run while any Phase 2 blocker is open.

## Required approvals and identity verification

### Minimum verification

1. An authenticated in-product request is tied to the requesting account and remains open.
2. A designated administrator marks the request identity status `verified` after confirming the requester controls the account using an owner-approved method.
3. The verification record stores only status, timestamp, and the minimum non-sensitive review note. Do not store identity documents, passwords, codes, or full verification evidence in the application.
4. A second authorized administrator, distinct from the verifier where practicable, approves the proposed scope after reviewing Phase 1 holds and the retention matrix.
5. The owner or delegated privacy lead approves any exception involving consent, payment, refund, tax, security, fraud, backup, provider, or legal-hold data.

No automatic approval follows from identity verification. Verification proves who requested the action; it does not resolve retention obligations.

### Required execution record

Before implementation, introduce a minimal, append-only execution record separate from public URLs. It should contain a random execution ID, deletion-request ID, target user ID or a one-way internal reference, approving administrator references, status, timestamps, approved scope version, blocker results, and a non-sensitive failure code. It must not contain student answers, messages, payment IDs, full provider responses, or identity-verification material.

### Minimum retained evidence, if retention is approved

These are field-minimization proposals, not a conclusion that Aced may or must retain them. Store a field only when the approved reason requires it.

| Category | Minimum proposed fields | Exclude unless separately approved |
| --- | --- | --- |
| Payment, refund, chargeback, or tax evidence | Internal retention reference, transaction type/status, relevant event time, amount/currency only if required, approved provider reference only if required, and retention decision | Name, email, card data, billing address, raw webhook payload, checkout URL, and unrelated registration or answer data |
| Security or fraud evidence | Internal case/reference, event category, time, system/source category, hold status, and disposition | Raw IP address, cookies, full logs, student content, device fingerprint, or broad event export unless the approved incident procedure requires it |
| Terms acceptance evidence | Terms version, acceptance time if known, evidence source, minimum lawful non-reversible account reference, retention decision and disposal-review status | Name, email, OAuth provider subject, answers, progress, payment IDs, free-text notes, or a fabricated affirmative-acceptance timestamp |
| Deletion-audit evidence | Execution ID, request reference, approver references, action-category status, timestamps, blocker/failure code, provider follow-up status, and verification result | Full inventory output, raw target identifiers in exported logs, student content, verification documents, provider payloads, or secrets |

The proposed retention reference must be reviewed for linkability. A simple unsalted hash of an email or user ID is not necessarily anonymous and must not be treated as such without a documented threat-model review.

## Preconditions and hard blockers

Phase 2 must re-run the Phase 1 inventory immediately before execution, inside the same authorization flow. Stop without changes when any of these are true:

| Blocker | Detection | Required outcome |
| --- | --- | --- |
| Identity not verified, request missing, closed, or already executed | Request state | Stop; no target lookup beyond the request. |
| Active mock-test session or unfinished active mock participation | `mock_test_sessions`, registrations, current release state | Stop until participation, scoring, and support obligations are resolved. |
| Active practice-test session | `practice_test_sessions.status = in_progress` | Stop or obtain an owner-approved safe-close plan. |
| Active unpaid payment hold | `mock_registrations.hold_expires_at` is active | Stop until it expires or a separately approved payment process resolves it. |
| Pending refund | Refund reference without recorded resolution | Stop until resolved and retained fields are approved. |
| Chargeback, dispute, fraud, security, legal hold, or support escalation | No complete database-backed ledger exists today | Stop for manual investigation and recorded owner decision. |
| Terms evidence decision unresolved | `legal_terms_acceptance_history` exists or current Terms evidence is required | Stop. The `ON DELETE RESTRICT` constraint must not be bypassed. |
| Payment/refund/tax retention decision unresolved | Any payment-related registration/event exists | Stop for qualified accounting/legal approval. |
| Backup or provider follow-up plan missing | Backup/provider checklist incomplete | Stop or retain the account until plan is approved. |

## Future execution sequence

This is a proposed design, not a command sequence.

1. Lock the approved execution record and the deletion request in a short transaction. Recheck identity verification, request status, approvals, and idempotency state.
2. Load a fresh aggregate inventory using the request-derived user ID. Do not log the inventory.
3. Evaluate blockers. If any blocker is present, set the execution record to a non-destructive blocked state and leave all student data unchanged.
4. Create a versioned, approved retention plan that names exactly which categories are deleted, anonymized, retained, or sent to provider follow-up.
5. Execute only the categories that have explicit approval. Use small, ordered database transactions rather than a single `DELETE FROM users` statement.
6. Record only category-level completion and counts in the minimal execution record. Do not store underlying records or content.
7. Run post-execution aggregate verification for the same request-derived target. Confirm each approved category reached the expected outcome and each retained category remains intact.
8. Mark the deletion request completed only after all approved work and required provider follow-up are verified. Otherwise leave it in a non-completed blocked or failed-review state.

## Transaction boundaries, recovery, and idempotency

### Boundaries

- The authorization recheck, execution-record claim, and status transition must occur atomically.
- Group only related records in each destructive transaction. For example, direct practice data can be one transaction after approval; payment/consent/audit actions should be separate because their retention rules differ.
- Do not include external provider calls in a database transaction. Record a pending provider action, commit it, complete the provider action through an approved process, then record only its outcome category.
- Use row-level locking or an equivalent conditional state update on the deletion request/execution record so two administrators cannot execute the same request concurrently.

### Idempotency and failure recovery

- Give each approved deletion request exactly one stable execution ID and unique claim.
- Every category action must be conditional on that execution ID and an expected prior state. A retry must be a no-op for categories already verified.
- Never retry a partial failure by deleting the user record. Re-run the aggregate inventory and compare it with the approved plan.
- Preserve the failure code and the category that stopped. Do not persist raw database errors if they can include sensitive fields.
- Design rollback only for non-destructive state transitions. Deletion/anonymization is intentionally irreversible; recover by stopping remaining categories, not restoring from backup unless an independent disaster-recovery decision authorizes it.

## Terms acceptance evidence and `ON DELETE RESTRICT`

`legal_terms_acceptance_history` is append-only: its trigger rejects updates and deletes, and its foreign key prevents deletion of the linked user. Phase 2 must not disable the trigger, change the foreign key, use `CASCADE`, or delete Terms rows.

Before any execution, qualified counsel must decide whether Aced needs to retain Terms evidence, for which purpose, and for how long. If evidence retention is approved, the future design should use a new, separately reviewed retention representation that contains only the minimum lawful proof fields, such as:

- Terms version
- Acceptance timestamp when known
- Evidence source (`affirmative` or migrated historical evidence)
- A non-reversible account reference or a separately controlled pseudonymous retention reference
- Retention decision/version and disposal-review status

The design must not copy name, email, provider subject, answers, learning history, payment identifiers, or free-text notes into consent evidence. The original append-only history must remain unchanged. Any future transformation must be legally approved, tested against non-production data, and designed so it does not falsely state that migrated historical evidence was a newly affirmative acceptance.

Until that design is approved and implemented, the restriction is a hard execution blocker.

## Provider and backup boundaries

Aced can plan changes to its own database only. Google, Stripe, Groq, Gemini, Resend, Sentry, hosting, and backup systems each have their own account, deletion, retention, and audit controls. The provider checklist is required for every request. Do not promise immediate deletion from backups or providers, and do not send a live provider request until an approved execution plan authorizes it.

## Owner decisions required before destructive implementation

1. Approve who may verify identity, approve scope, and execute requests, including separation-of-duties requirements.
2. Approve the legal basis, minimum fields, retention purpose, and disposition procedure for Terms acceptance evidence.
3. Obtain qualified advice on payment, refund, chargeback, tax, fraud, security, and audit retention requirements.
4. Decide whether learning data may be irreversibly anonymized for aggregate product work, and define a non-reidentification standard.
5. Approve treatment of mock-test scores, disputes, active sessions, and released results.
6. Approve what, if anything, is retained from transactional email outbox records and support records.
7. Approve a verified ownership process for email-only waitlist and join records, or leave them outside account deletion.
8. Approve provider-specific requests, contacts, proof requirements, and follow-up verification.
9. Verify actual local/offsite backup rotation and approve how deleted data is handled on restore.
10. Approve the execution-record schema, idempotency design, monitoring, post-execution verification, and staff training.

## Source basis

- `docs/account-deletion-runbook.md`
- `docs/privacy-retention-policy.md`
- `lib/account-deletion-dry-run.ts`
- `db/schema.ts`
- `drizzle/0033_legal_terms_acceptance_history.sql`
