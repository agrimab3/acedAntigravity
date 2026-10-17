#!/usr/bin/env bash
# Encrypt and upload one verified custom-format dump to a private S3 bucket.
# This script is intentionally disabled until the owner supplies the bucket,
# least-privilege AWS credentials, and a separately retained recovery key.
set -euo pipefail
umask 077
: "${ACED_BACKUP_S3_BUCKET:?Set ACED_BACKUP_S3_BUCKET to the private bucket name}"
: "${ACED_BACKUP_S3_REGION:?Set ACED_BACKUP_S3_REGION to the bucket region}"
BACKUP_DIR="${ACED_BACKUP_DIR:-/home/ubuntu/apps/aced/backups}"
BACKUP_PREFIX="${ACED_BACKUP_PREFIX:-aced-daily-}"
S3_PREFIX="${ACED_BACKUP_S3_PREFIX:-database/daily}"
KEY_FILE="${ACED_BACKUP_ENCRYPTION_KEY_FILE:?Set ACED_BACKUP_ENCRYPTION_KEY_FILE to the protected recovery key file}"
command -v aws >/dev/null || { echo 'Install AWS CLI v2 first' >&2; exit 1; }
command -v gpg >/dev/null || { echo 'GnuPG is required for encrypted offsite backups' >&2; exit 1; }
[[ -f "$KEY_FILE" && ! -L "$KEY_FILE" ]] || { echo 'Recovery key file is missing or unsafe' >&2; exit 1; }
[[ "$(stat -c '%a' "$KEY_FILE")" = "600" ]] || { echo 'Recovery key file must have mode 600' >&2; exit 1; }

backup="${1:-}"
if [[ -z "$backup" ]]; then
  backup="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${BACKUP_PREFIX}*.dump" -print | sort | tail -n 1)"
fi
[[ -n "$backup" && -f "$backup" && -s "$backup" ]] || { echo 'No nonempty verified database dump found' >&2; exit 1; }
pg_restore --list "$backup" >/dev/null

name="$(basename "$backup")"
encrypted="$(mktemp "${BACKUP_DIR}/.${name}.XXXXXX.gpg")"
checksum="${encrypted}.sha256"
cleanup() { rm -f "$encrypted" "$checksum"; }
trap cleanup EXIT

gpg --batch --yes --pinentry-mode loopback --passphrase-file "$KEY_FILE" \
  --symmetric --cipher-algo AES256 --compress-algo none --output "$encrypted" "$backup"
chmod 600 "$encrypted"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$KEY_FILE" \
  --decrypt --output /dev/null "$encrypted"
sha256sum "$encrypted" | awk '{print $1}' > "$checksum"

object_key="${S3_PREFIX%/}/${name}.gpg"
aws s3 cp "$encrypted" "s3://${ACED_BACKUP_S3_BUCKET}/${object_key}" \
  --region "$ACED_BACKUP_S3_REGION" --only-show-errors --no-cli-pager
aws s3 cp "$checksum" "s3://${ACED_BACKUP_S3_BUCKET}/${object_key}.sha256" \
  --region "$ACED_BACKUP_S3_REGION" --only-show-errors --no-cli-pager
aws s3api head-object --region "$ACED_BACKUP_S3_REGION" --bucket "$ACED_BACKUP_S3_BUCKET" \
  --key "$object_key" --no-cli-pager >/dev/null
echo "Encrypted offsite backup uploaded and verified: ${name}.gpg"
