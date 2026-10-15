# Account Deletion Phase 2 Provider and Backup Checklist

Status: planning checklist only. Do not send any provider request, change provider configuration, rotate credentials, or inspect a student record until a specific verified request has an approved execution plan.

## Per-request control record

For each approved request, record only the execution ID, request ID, provider name, action category, approver, request/outcome timestamp, non-sensitive status, and follow-up date. Do not store secrets, full provider responses, raw email, payment identifiers, tutor prompts, answers, or conversation content in this checklist or application logs.

## Provider checklist

| Provider/system | What Aced controls | What is provider-controlled | Proposed per-request action | Required approval/verification |
| --- | --- | --- | --- | --- |
| Google OAuth | Local `users` and `user_identities` linkage | Google account, OAuth provider records, identity/account data at Google | Delete local identity linkage only when local execution is approved. Do not attempt to delete a Google account. | Confirm user identity and local scope; verify local linkage removal without retaining provider subject. |
| Stripe | Local mock registration payment/reference fields and local Stripe-event rows | Checkout, PaymentIntent, refund, dispute, tax, and Stripe account records | Do not delete or alter Stripe records as part of local execution. Request/legal review only if a provider action is required. | Qualified accounting/legal decision on retention, refunds, disputes, tax, chargebacks, and provider process. |
| Groq | Local tutor-state/history references, if approved for deletion | Inference-provider processing/log controls | Do not send a deletion request merely because a local account is deleted. Check the configured product terms and ZDR scope through the approved owner process. | Privacy lead confirms what data was sent, whether a provider action is available, and that no student content is disclosed unnecessarily. |
| Gemini | No live student-tutor routing; content generation/review is separate | Gemini API/service records and content-factory processing | No account-specific action unless a verified investigation demonstrates account data was sent. Do not assume it was. | Privacy lead reviews actual routing/configuration and provider documentation. |
| Resend | Local `mock_email_outbox` rows | Provider delivery, suppression, event, and message retention | Apply local record plan first. Provider follow-up only through an approved process and only with the minimum identifier needed. | Owner approves email/audit retention and provider request method. |
| Sentry | Application source controls scrubbing; local app data | Sentry event retention and issue data | Do not search or export events automatically. Follow an approved support/security procedure if a specific event requires action. | Security/privacy lead confirms whether data exists and the available provider action. |
| VPS/hosting/Caddy/PM2 | Aced-controlled application, server, and log configuration | Host infrastructure/provider logs and snapshots | Do not run ad hoc log deletion or server cleanup. Follow an approved log-retention and hosting-support procedure. | Owner confirms hosting log/snapshot controls and lawful retention basis. |
| Local database backups | Backup scripts and backup inventory | Backup media and any offsite storage controls | Do not alter individual backup files. Document that account data may persist until normal approved rotation. | Verify actual rotation and restore process; owner approves any exception. |
| Offsite backup storage | Upload process and bucket policy configuration | Storage-provider copies, lifecycle, replication | Do not issue object deletion for an individual account. Review lifecycle and encryption configuration separately. | Owner verifies storage lifecycle and provider obligations without publishing secrets. |

## Backup expiration design

1. Inventory the actual backup locations, encryption, access controls, replication, and rotation behavior using non-sensitive operational metadata.
2. Obtain owner and qualified legal advice before setting any retention period. Do not invent a statutory period.
3. Treat backups as disaster-recovery artifacts, not as a primary deletion mechanism.
4. Record an approved deletion request as pending normal backup rotation only after the live-system plan is complete and the requester communication is approved.
5. If a backup is restored, require a recovery procedure that prevents reintroducing a completed deletion into the live service without reassessment.

## Provider follow-up process

1. Use a provider-specific, owner-approved template that requests only the minimum information necessary.
2. Verify the requester and internal execution approval before contacting a provider.
3. Do not attach student answers, tutor conversations, payment details, identity documents, or secrets.
4. Store only a minimal outcome code and timestamp in the future execution record.
5. If a provider cannot delete or identify a record, document that limitation in the requester response using approved language. Do not make unsupported promises.

## Owner decisions required before provider action

- Confirm the actual account terms, retention controls, and available deletion mechanisms for every provider.
- Appoint who may submit provider requests and who verifies completion.
- Approve communications to students about provider retention and backup rotation.
- Approve how legal holds, disputes, fraud investigations, security incidents, and accounting obligations override or defer provider action.
- Approve a provider-by-provider evidence standard that does not retain unnecessary identifiers.

## Explicit non-actions for Phase 2 design

- Do not delete a Google account.
- Do not alter Stripe transactions, refunds, disputes, or live payment configuration.
- Do not send Groq, Gemini, Resend, Sentry, hosting, or backup-provider requests.
- Do not alter retention settings, lifecycle policies, keys, credentials, or logs.
- Do not promise immediate deletion from a provider or backup.
