#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${ACED_APP_ROOT:-/home/ubuntu/apps/aced}"
SHARED_ENV="${ACED_ENV_FILE:-${APP_ROOT}/shared/.env}"
umask 077

if [[ -f "${SHARED_ENV}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${SHARED_ENV}"
  set +a
fi

# Load backup-specific settings after the protected environment, allowing the
# shared production configuration to override these safe defaults.
BACKUP_DIR="${ACED_BACKUP_DIR:-${APP_ROOT}/backups}"
RETENTION_DAYS="${ACED_BACKUP_RETENTION_DAYS:-30}"
BACKUP_PREFIX="${ACED_BACKUP_PREFIX:-aced-daily-}"
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for database backup." >&2
  exit 1
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp="${BACKUP_DIR}/.${BACKUP_PREFIX}${stamp}.dump.tmp"
out="${BACKUP_DIR}/${BACKUP_PREFIX}${stamp}.dump"

pg_dump "${DATABASE_URL}" --format=custom --compress=9 --no-owner --no-privileges --file="${tmp}"
pg_restore --list "${tmp}" >/dev/null
chmod 600 "${tmp}"
mv "${tmp}" "${out}"
# Only rotate backups created by this 30-day workflow. Older preexisting
# backups remain untouched and must be reviewed separately by the owner.
find "${BACKUP_DIR}" -type f -name "${BACKUP_PREFIX}*.dump" -mtime "+$((RETENTION_DAYS - 1))" -delete

echo "Database backup completed and verified: $(basename "${out}")"
