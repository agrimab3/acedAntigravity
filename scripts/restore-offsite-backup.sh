#!/usr/bin/env bash
# Download, decrypt, verify, and restore a backup into an explicitly named
# non-production database. The target guard prevents accidental production use.
set -euo pipefail

object_key="${1:-}"
if [[ -z "$object_key" ]]; then
  echo 'Usage: TARGET_DATABASE_URL=... bash scripts/restore-offsite-backup.sh database/daily/backup.dump.gpg' >&2
  exit 2
fi
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
: "${ACED_BACKUP_S3_BUCKET:?ACED_BACKUP_S3_BUCKET is required}"
: "${ACED_BACKUP_S3_REGION:?ACED_BACKUP_S3_REGION is required}"
: "${ACED_BACKUP_ENCRYPTION_KEY_FILE:?ACED_BACKUP_ENCRYPTION_KEY_FILE is required}"

target_name="$(node -e 'try{console.log(new URL(process.env.TARGET_DATABASE_URL).pathname.slice(1))}catch{process.exit(2)}')"
if [[ ! "$target_name" =~ (restore|test|throwaway|rehearsal|ci) ]]; then
  echo 'Refusing offsite restore to a non-test-looking database.' >&2
  exit 2
fi
command -v aws >/dev/null || { echo 'Install AWS CLI v2 first' >&2; exit 1; }
command -v gpg >/dev/null || { echo 'GnuPG is required for encrypted offsite restore' >&2; exit 1; }
[[ -f "$ACED_BACKUP_ENCRYPTION_KEY_FILE" && ! -L "$ACED_BACKUP_ENCRYPTION_KEY_FILE" ]] || exit 1
[[ "$(stat -c '%a' "$ACED_BACKUP_ENCRYPTION_KEY_FILE")" = "600" ]] || exit 1

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
encrypted="$tmp_dir/backup.dump.gpg"
checksum="$tmp_dir/backup.dump.gpg.sha256"
dump="$tmp_dir/backup.dump"
aws s3 cp "s3://${ACED_BACKUP_S3_BUCKET}/${object_key}" "$encrypted" \
  --region "$ACED_BACKUP_S3_REGION" --only-show-errors --no-cli-pager
aws s3 cp "s3://${ACED_BACKUP_S3_BUCKET}/${object_key}.sha256" "$checksum" \
  --region "$ACED_BACKUP_S3_REGION" --only-show-errors --no-cli-pager
expected_checksum="$(tr -d '[:space:]' < "$checksum")"
actual_checksum="$(sha256sum "$encrypted" | awk '{print $1}')"
[[ "$expected_checksum" =~ ^[0-9a-f]{64}$ && "$expected_checksum" = "$actual_checksum" ]] || {
  echo 'Encrypted backup checksum verification failed' >&2
  exit 1
}
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$ACED_BACKUP_ENCRYPTION_KEY_FILE" \
  --decrypt --output "$dump" "$encrypted"
pg_restore --list "$dump" >/dev/null
TARGET_DATABASE_URL="$TARGET_DATABASE_URL" bash "$(dirname "$0")/restore-backup.sh" "$dump"
DATABASE_URL="$TARGET_DATABASE_URL" node "$(dirname "$0")/verify-applied-drizzle-migrations.mjs"
