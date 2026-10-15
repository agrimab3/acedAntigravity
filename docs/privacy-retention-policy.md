# Aced data-retention policy — DRAFT / OWNER APPROVAL REQUIRED

Status: internal operational draft for Public Alpha. This document is not a public
legal notice, does not change published legal documents, and does not create an
automated deletion or purge process. The periods below are proposed operating
triggers, not statements that software currently enforces them.

## Operating principles

- Keep only information needed to operate Aced, protect accounts, meet payment
  and security obligations, or respond to a valid request.
- A deletion request starts review; it does not immediately erase an account.
- Do not run a purge against existing records until the owner has approved a
  separate, tested deletion plan and legal/accounting advice where identified.
- Keep marketing separate from transactional account and mock-test messages.
- Reassess this draft before any change to payments, providers, public policy, or
  automated retention tooling.

## Proposed schedule

| Category | Purpose and storage | Proposed retention trigger | After account deletion | Enforcement today / exceptions |
|---|---|---|---|---|
| Account identity and Google OAuth identity | `users`, `user_identities`; account access | Until account deletion is approved and executed | Remove or anonymize only through a separately approved execution process | Not automated. Security, fraud, and legal exceptions may apply. |
| Age confirmation and Terms acceptance | `users.age_confirmed_at`, Terms fields | Account lifetime plus any period needed to prove consent | Retain only if counsel says proof is needed; otherwise delete/anonymize with account | Not automated. Legal advice required. |
| Practice answers, sessions, scores, progress | Practice/session/answer/mastery tables | Until approved deletion, unless legitimately anonymized for aggregate product metrics | Delete or irreversibly anonymize in approved execution plan | Not automated. Avoid deleting active work or altering aggregate data without a plan. |
| Topic mastery and personalization | `topic_mastery`, onboarding/profile fields | Until approved deletion or the account holder changes it | Delete/anonymize with account | Not automated. Operational exception only for short-lived recovery/backup copies. |
| AI tutor hint history | `practice_tutor_states.hint_history` | Until approved deletion | Delete/anonymize with linked practice data | Not automated. Provider-held data follows provider terms and settings. |
| Mock-test registrations and results | `mock_registrations`, sessions, runs, answers, results | Keep through test completion, score release, support window, and then until approved deletion subject to payment exception | Remove/anonymize learning content; preserve minimum accounting/payment references if required | Not automated. Do not disrupt an active registration or released-score dispute. |
| Stripe payment and refund references | Aced Stripe IDs; Stripe’s own records | Retain only as long as necessary for accounting, dispute, fraud, and legal needs | Keep the minimum permitted reference data; Stripe records follow Stripe retention controls | Not automated. Owner needs accounting/legal advice; Aced never stores card numbers. |
| Transactional email outbox | `mock_email_outbox` | Keep delivery/audit records through support and dispute needs; review periodically | Remove/anonymize recipient/body data where permitted after approved deletion | Not automated. Resend copies follow Resend controls. |
| Marketing preference | `users.email_opt_in`, mock registration opt-in | Until changed by user or account deletion | Delete with account unless proof of opt-out is needed | Preference is stored and editable. No promotional campaign runs during Public Alpha. |
| Waitlist entries | Mock-test waitlist and public waitlist signups | Until the related test/date is complete or the person opts out/requests deletion | Remove/anonymize when the approved process permits | Not automated. Future marketing must honor preference and unsubscribe requirements. |
| Join requests | `join_requests` | Until the request is answered or no longer operationally useful | Delete/anonymize after approved review | Not automated. Manual review required. |
| Feedback | `feedback` | Until feedback is resolved or safely aggregated | Remove direct link to the account where practical, then delete/anonymize | Not automated. Preserve only aggregate lessons if identity is removed. |
| Account deletion requests | `account_deletion_requests` | Keep through request resolution and a defensible audit/support period | Retain minimum status/audit record only if legal/security needs justify it | Not automated. Never mark completed without verified execution. |
| Application and security logs | VPS/PM2/Caddy/Sentry and provider logs | Short operational window sufficient for reliability and security review | Logs age out under provider/server procedures; redact before sharing | Retention is not fully verified in code. Security exception may apply. |
| Local and offsite backups | VPS database backup process and backup destination | Rotate under documented backup procedure; do not use backup expiry as a primary deletion mechanism | Deleted data may remain until normal backup rotation; do not restore it except for a legitimate recovery | Manual procedure required. Confirm actual backup retention before publishing any promise. |

## Decisions requiring owner, legal, or accounting advice

1. The minimum payment, refund, tax, and chargeback record-retention period.
2. Whether consent evidence must be retained after account deletion and for how long.
3. Whether de-identified learning data may be retained for aggregate quality work.
4. A defensible response-time target for verified deletion requests.
5. Provider-specific retention and deletion instructions for Google, Stripe, Groq,
   Resend, Sentry, hosting, and backups.

## Current technical position

No retention period in this document is automatically enforced. There are no
automatic deletion jobs or retention cron jobs. Any execution against stored
data requires separate owner approval, a tested plan, and a production change
review.
