#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${ACED_APP_ROOT:-/home/ubuntu/apps/aced}"
SHARED_ENV="${ACED_ENV_FILE:-${APP_ROOT}/shared/.env}"
BACKUP_DIR="${ACED_BACKUP_DIR:-${APP_ROOT}/backups}"
RETENTION_DAYS="${ACED_BACKUP_RETENTION_DAYS:-14}"

umask 077
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

if [[ -f "${SHARED_ENV}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${SHARED_ENV}"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for database backup." >&2
  exit 1
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp="${BACKUP_DIR}/.aced-${stamp}.dump.tmp"
out="${BACKUP_DIR}/aced-${stamp}.dump"

pg_dump "${DATABASE_URL}" --format=custom --compress=9 --no-owner --no-privileges --file="${tmp}"
chmod 600 "${tmp}"
mv "${tmp}" "${out}"
find "${BACKUP_DIR}" -type f -name 'aced-*.dump' -mtime "+$((RETENTION_DAYS - 1))" -delete

echo "Database backup completed: $(basename "${out}")"
