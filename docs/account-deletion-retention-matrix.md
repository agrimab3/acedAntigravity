# Account Deletion Phase 2 Retention Matrix

Status: proposed technical matrix. None of these actions are implemented or authorized. “Retain temporarily” has no duration until qualified legal/accounting advice and owner approval establish one.

## Rules for reading this matrix

- “Delete” means only after the request is verified, blockers are cleared, and the owner-approved execution plan includes the category.
- “Anonymize” means irreversible removal of direct account linkage while retaining only approved non-identifying content. A reversible hash, raw email, provider ID, payment ID, or answer snapshot is not anonymous.
- “Manual review” means no automated operation may touch the category.
- Rows with `cascade` or `set null` describe current database behavior if a parent were deleted. They are not instructions to delete the parent.

| Table or system | Student linkage and relationship | Proposed treatment | Minimum retained fields if retention is approved | Execution/approval notes |
| --- | --- | --- | --- | --- |
| `users` | Root account record | Manual review, then delete only after all child and retention plans complete | None unless a separate consent/audit retention model is approved | Do not delete as a shortcut. It is blocked by Terms history and would invoke cascades. |
| `user_identities` | `user_id`, cascade | Delete | None | Remove Google account linkage only after all required local actions are complete. Google-side handling is separate. |
| `legal_terms_acceptance_history` | `user_id`, restrict; append-only trigger | Retain temporarily or manual review | Terms version, acceptance timestamp if known, evidence source, minimum lawful non-reversible reference, retention decision | Hard blocker until counsel approves a retention design. Never update/delete or disable the trigger. |
| User Terms/age fields on `users` | Direct account fields | Delete with account, subject to consent decision | None in `users` | Preserve no duplicate claim of acceptance. |
| `practice_sessions` | `user_id`, cascade | Delete | None | Includes aggregate session performance. |
| `practice_answers` | `user_id` and session, cascade | Delete | None | Student choices and timing are sensitive learning data. |
| `practice_tutor_states` | `user_id` and session, cascade | Delete | None | Includes hint history; provider-held data remains separate. |
| `topic_mastery`, `topic_skill_state`, `question_exposures` | `user_id`, cascade | Delete or irreversibly anonymize only if approved for aggregate use | Approved aggregate-only statistics with no account key | No aggregate retention without owner decision and reidentification review. |
| `practice_test_sessions`, `practice_test_sections`, `practice_test_answers` | User/session, cascade | Delete | None | Block while a session is in progress. Question snapshots must not be retained as an account-linked record. |
| `mock_registrations` | `user_id`, cascade | Manual review; often retain temporarily | Minimum approved accounting/reference status and non-identifying execution reference only | Paid, refunded, disputed, active, or score-related registrations block execution until approved. |
| `mock_test_sessions`, section runs, answers, topic results, client presence | Through registration, cascade | Manual review, then delete or anonymize according to score/payment decision | Only approved aggregate score/operations data, if legally allowed | Active session blocks execution. Do not disrupt released-score disputes. |
| `mock_email_outbox` | `registration_id`, cascade | Manual review; delete or irreversibly redact only after retention decision | Minimum delivery/audit state without recipient/body, if approved | Body, recipient, attachments, provider IDs, and errors are unnecessary unless a specific approved reason requires them. |
| `mock_test_ops_events` | Registration/session, set null | Retain temporarily or anonymize | Event kind, time, non-identifying operational reference | `details` may contain sensitive material and requires schema/content review before any retention. |
| `mock_stripe_events` | Registration, set null | Retain temporarily | Event type, processed time, minimum approved non-identifying accounting reference | Stripe event ID is a provider/payment identifier; retain only if approved. |
| `mock_waitlist` | Optional `user_id`, set null; also email | Manual review | No email unless an approved waitlist/business reason requires it | Do not assume a user-linked row authorizes deletion of its email value. |
| `feedback` | Optional `user_id`, set null | Anonymize linkage or delete after review | Aggregate rating/tag only if approved | Free-text feedback may identify a student and needs content-aware review. |
| `account_deletion_requests` | `user_id`, cascade | Retain temporarily or manual review | Request/execution status, minimal timestamps, non-sensitive reason code, approved retention decision | Current cascade conflicts with potential audit retention; future design needs a separate minimal execution audit record. |
| `questions.reviewed_by_user_id`, `mock_test_forms.locked_by_user_id` | Optional user link, set null | Manual review, then set null if the person was truly acting as staff | None beyond existing operational record | Student accounts should not normally be staff references. Confirm role/context before changing. |
| `admin_audit_log` | No structured student FK | Manual review only | Minimum lawful action/time/reason, no student content | Do not search broad audit targets or log text automatically. |
| `waitlist_signups`, `join_requests` | Email-only, no account FK | Manual review only | None without independently verified ownership | Never correlate by email during automated account deletion. |
| Application/server/security logs | May contain indirect identifiers | Manual review/provider procedure | Minimum approved security event metadata | No retention period is verified. Do not run ad hoc log purges. |
| Local/offsite database backups | Snapshot copies | Retain until normal approved rotation | Backup inventory and rotation evidence, not student content | Do not edit backups or use restore as a deletion tool. |

## Current foreign-key implications

### Cascade paths that must not be triggered blindly

- `users` cascades to account identities, practice data, question exposures, skill/mastery state, practice-test sessions/answers, mock registrations, and deletion requests.
- Mock registrations cascade to mock sessions, section runs, answers, topic results, client presence, and email outbox records.
- Practice sessions cascade to practice answers and tutor states; practice-test sessions cascade to their sections and answers.

### Set-null paths that preserve a record but remove a relation

- `feedback.user_id`
- `mock_waitlist.user_id`
- `mock_test_ops_events.registration_id` and `.session_id`
- `mock_stripe_events.registration_id`
- Question reviewer and mock-form locker references

### Restrict path

- `legal_terms_acceptance_history.user_id` is `ON DELETE RESTRICT`; its table also rejects updates/deletes. It is intentionally a hard stop, not an error to work around.

## Records outside the application database

The matrix does not claim control over Google, Stripe, Groq, Gemini, Resend, Sentry, hosting, or backup-provider records. Use `docs/account-deletion-provider-checklist.md` for provider-controlled data and follow-up.

## Decisions still required

- Whether, why, and how long consent evidence, payment/refund evidence, security records, and deletion-request audit evidence are retained.
- Whether any aggregate learning metrics remain after an account request, and the irreversible-anonymization standard.
- Whether mock-test score data is deleted, anonymized, or retained after support/dispute obligations end.
- The approved minimum retained fields for transactional email and operational events.
- The verified ownership process for email-only records.
