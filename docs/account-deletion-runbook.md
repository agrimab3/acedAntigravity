# Account deletion request runbook — DRAFT / OWNER APPROVAL REQUIRED

This is a review-and-planning runbook only. Submitting a request does not delete
an account. Aced currently has no automated or admin one-click deletion action.

## 1. Receive and record the request

1. The student submits the request in **Account & privacy**, or writes from the
   account email address to `support@aceditprep.com`.
2. The authenticated in-product request creates or reuses an open
   `account_deletion_requests` record. It does not modify account, learning,
   mock-test, payment, or email data.
3. For email requests, an authorized administrator records the request only
   after identifying the matching account through an approved internal process.
4. Ask the student not to submit duplicates while an open request is being
   reviewed.

## 2. Verify the requester

1. Mark the request **under review**.
2. Record identity verification as **pending** while evidence is collected.
3. Verify that the requester controls the account using an approved method; do
   not place passwords, documents, or sensitive verification details in the
   internal note.
4. Mark identity as **verified** only after the administrator has completed
   that check. If verification cannot be completed, use **awaiting
   clarification** or **blocked** and contact the requester.

## 3. Review related data before planning any deletion

Review only the categories necessary to plan the request:

- Account and Google identity data.
- Practice answers, sessions, topic mastery, tutor hint history, and progress.
- Practice-test records.
- Mock-test registration, active session, results, and waitlist state.
- Stripe Checkout/PaymentIntent/refund references and any active dispute.
- Transactional email outbox records, feedback, join requests, and waitlists.
- Security/audit logs and backup copies.

Do not execute a deletion while a mock test is active, a payment/refund is
pending, a score dispute is open, or a legal/security preservation reason is
unresolved. Explain the limited reason to the requester where appropriate.

## 4. Prepare a deletion/anonymization plan

The authorized administrator records the planned scope outside public URLs and
does not put sensitive information in application logs. The plan must state:

- which account-linked records will be removed or irreversibly anonymized;
- which minimum payment, fraud, security, legal, or backup records must remain;
- how active mock-test access will be safely closed or deferred;
- which third-party providers require a separate request or dashboard action;
- how completion will be verified without accessing unrelated student data.

Stripe, Google, Groq, Resend, Sentry, hosting, and backup providers have their
own retention controls. Aced’s database action alone does not delete provider
copies. Do not promise immediate removal from backups; allow normal backup
rotation unless a separately approved recovery-safe process says otherwise.

## 5. Execute only through a separately authorized process

There is currently **no authorized execution procedure in the product**. A
future deletion process must be separately designed, reviewed, tested against
non-production data, approved by the owner, and authorized for each request.
It must not bulk-delete accounts and must preserve any approved exception.

## 6. Verify and close

1. Verify that the approved scope, and only that scope, was completed.
2. Record the completion date and a minimal completion audit record through the
   future execution process.
3. Only then may the request be marked completed.
4. Send a confirmation explaining what was completed and any lawful retained
   categories or backup-rotation limitation.

The current review workflow intentionally cannot mark requests completed.

## Special situations

- **Active mock-test registration:** defer execution until participation,
  results, payment, refunds, and support obligations are safely resolved.
- **Pending payment/refund:** retain the minimum payment references and wait for
  resolution; do not delete information needed for reconciliation or a dispute.
- **Financial records:** follow owner-approved accounting/legal advice. Aced
  stores references, not card numbers.
- **Transactional email:** retain only what is necessary for delivery/support;
  provider copies need separate handling.
- **Backups:** do not edit backups ad hoc. Record that normal rotation may
  retain deleted data temporarily.
- **Incomplete/disputed request:** keep it in awaiting-clarification or blocked
  state, document only a minimal non-sensitive reason, and respond through
  support.
- **Repeated request:** use the existing open request; avoid duplicate work.

## Admin workflow status meanings

- **Requested:** received, not yet reviewed.
- **Under review:** administrator is assessing scope and exceptions.
- **Awaiting clarification:** requester or administrator needs more information.
- **Blocked:** a legitimate verification, security, payment, legal, or active
  service issue prevents progress for now.
- **Completed:** reserved for a future, independently verified execution process;
  this interface cannot set it.
