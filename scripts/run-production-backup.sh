#!/usr/bin/env bash
# Daily production backup orchestrator. It never touches the running app and
# only attempts an off-server upload when explicitly enabled in the protected
# production environment.
set -euo pipefail

APP_ROOT="${ACED_APP_ROOT:-/home/ubuntu/apps/aced}"
SHARED_ENV="${ACED_ENV_FILE:-${APP_ROOT}/shared/.env}"
umask 077

set -a
# shellcheck disable=SC1090
source "${SHARED_ENV}"
set +a

BACKUP_DIR="${ACED_BACKUP_DIR:-${APP_ROOT}/backups}"
STATUS_FILE="${ACED_BACKUP_STATUS_FILE:-${BACKUP_DIR}/last-backup-status.env}"
BACKUP_PREFIX="${ACED_BACKUP_PREFIX:-aced-daily-}"
mkdir -p "${BACKUP_DIR}"

write_status() {
  local result="$1"
  local phase="$2"
  local offsite="$3"
  local latest="${4:-}"
  local tmp
  tmp="$(mktemp "${BACKUP_DIR}/.last-backup-status.XXXXXX")"
  {
    printf 'completed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'result=%s\n' "$result"
    printf 'phase=%s\n' "$phase"
    printf 'offsite=%s\n' "$offsite"
    printf 'backup_file=%s\n' "$(basename "$latest")"
  } > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$STATUS_FILE"
}

phase="local_dump"
latest=""
trap 'write_status failed "$phase" not_uploaded "$latest"' ERR

"${APP_ROOT}/current/scripts/backup-db.sh"
latest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${BACKUP_PREFIX}*.dump" -print | sort | tail -n 1)"
[[ -n "$latest" && -s "$latest" ]] || { echo 'Verified local backup was not found' >&2; exit 1; }

if [[ "${ACED_BACKUP_OFFSITE_ENABLED:-false}" = "true" ]]; then
  phase="offsite_upload"
  "${APP_ROOT}/current/scripts/backup-offsite-s3.sh" "$latest"
  write_status success complete uploaded "$latest"
else
  write_status success complete disabled "$latest"
  echo 'Local backup completed; offsite upload is disabled.'
fi
