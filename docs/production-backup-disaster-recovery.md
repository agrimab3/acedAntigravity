# Production database backups and recovery

## Status

The backup scripts are intentionally inert for off-server upload until the owner configures a private S3 bucket, least-privilege credentials, and a recovery key. A local custom-format PostgreSQL dump alone is not disaster recovery.

## Daily workflow

The production release scheduler runs `scripts/run-production-backup.sh` daily at 09:23 server time. It:

1. Creates a PostgreSQL custom-format dump with `pg_dump`.
2. Checks that the dump is restorable with `pg_restore --list`.
3. Retains 30 days of new `aced-daily-*.dump` files only. It never deletes older preexisting backups.
4. When `ACED_BACKUP_OFFSITE_ENABLED=true`, encrypts the verified dump locally with GnuPG AES-256 before uploading it to S3.
5. Verifies the encrypted object exists remotely and writes a mode-600, credential-free local status file.

The backup process is independent of PM2 and Caddy. A backup failure records a failure status and exits nonzero for cron logging; it does not restart or block the application.

## Required owner setup before enabling off-server uploads

1. Create one private S3 bucket in the selected AWS region. Enable Block Public Access, bucket versioning, default encryption, and a lifecycle rule that expires **only** `database/daily/` objects after 30 days. Do not add a deletion rule for existing objects.
2. Create a dedicated IAM identity or workload credential restricted to that bucket and prefix. It needs `s3:PutObject` and `s3:GetObject` on `database/daily/*`, and `s3:ListBucket` for the bucket with that prefix. Do not grant delete, bucket administration, or access to unrelated buckets.
3. Install AWS CLI v2 on the VPS through the approved system-administration process and store the credential using the protected production configuration process. Never put it in Git or chat.
4. Create a high-entropy recovery passphrase file at a protected path outside releases, owned by the application account with mode `0600`. Configure `ACED_BACKUP_ENCRYPTION_KEY_FILE` to that path. Store an independent copy of this recovery secret in the owner's password manager or other approved secure recovery location. Without it, encrypted backups cannot be recovered after VPS loss.
5. In `/home/ubuntu/apps/aced/shared/.env`, configure the bucket name, region, optional `database/daily` prefix, recovery-key path, and `ACED_BACKUP_OFFSITE_ENABLED=true`. Do not print the file or its values.
6. Run one controlled backup and inspect only `scripts/backup-status.sh`. Then use a disposable non-production PostgreSQL database for a restore rehearsal.

## Owner status check

Run:

```bash
cd /home/ubuntu/apps/aced/current
bash scripts/backup-status.sh
```

It prints only the last timestamp, result, phase, whether off-server upload happened, and a backup filename.

## Restore rehearsal

Never restore to production. Create an empty, isolated PostgreSQL database whose name includes `restore`, `test`, `throwaway`, `rehearsal`, or `ci`, then set its connection URL only in the terminal environment. Use:

```bash
TARGET_DATABASE_URL='postgresql://…/aced_restore' \
bash scripts/restore-offsite-backup.sh database/daily/aced-daily-YYYYMMDDTHHMMSSZ.dump.gpg
```

The command refuses a target database name that does not look non-production. It decrypts to a mode-private temporary directory, checks the custom dump, then calls the existing guarded restore script and verifies the application's migration ledger. Afterward, verify only approved aggregate row-count checks for the rehearsal. Do not inspect student rows.

## Recovery limitations

- This is a daily logical backup, not point-in-time recovery. Changes after the latest successful backup can be lost.
- Restoring requires the S3 object, AWS recovery access, the separate GnuPG passphrase, PostgreSQL, and sufficient empty-database capacity.
- Provider systems such as Google, Stripe, Resend, Sentry, and AI providers are outside the PostgreSQL backup and have separate recovery/retention processes.
