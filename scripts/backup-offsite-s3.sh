#!/usr/bin/env bash
# Upload an existing local database dump to a private, versioned S3 bucket.
# Intentionally not scheduled or enabled by default.
set -euo pipefail
umask 077
: "${ACED_BACKUP_S3_BUCKET:?Set ACED_BACKUP_S3_BUCKET to the private bucket name}"
: "${ACED_BACKUP_S3_REGION:?Set ACED_BACKUP_S3_REGION to the bucket region}"
BACKUP_DIR="${ACED_BACKUP_DIR:-/home/ubuntu/apps/aced/backups}"
command -v aws >/dev/null || { echo 'Install AWS CLI v2 first' >&2; exit 1; }
latest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'aced-*.dump' -print | sort | tail -n 1)"
[[ -n "$latest" && -s "$latest" ]] || { echo 'No nonempty database dump found' >&2; exit 1; }
aws s3api put-object --region "$ACED_BACKUP_S3_REGION" --bucket "$ACED_BACKUP_S3_BUCKET" --key "database/$(basename "$latest")" --body "$latest" --server-side-encryption AES256 --no-cli-pager >/dev/null
echo "Offsite backup uploaded: $(basename "$latest")"
