#!/usr/bin/env bash
# Owner-facing status summary. It deliberately reveals no credentials,
# connection strings, database records, or bucket name.
set -euo pipefail

APP_ROOT="${ACED_APP_ROOT:-/home/ubuntu/apps/aced}"
BACKUP_DIR="${ACED_BACKUP_DIR:-${APP_ROOT}/backups}"
STATUS_FILE="${ACED_BACKUP_STATUS_FILE:-${BACKUP_DIR}/last-backup-status.env}"

if [[ ! -f "$STATUS_FILE" ]]; then
  echo 'No managed backup status has been recorded yet.'
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$STATUS_FILE"
set +a
printf 'last_backup_at=%s\n' "${completed_at:-unknown}"
printf 'result=%s\n' "${result:-unknown}"
printf 'phase=%s\n' "${phase:-unknown}"
printf 'offsite=%s\n' "${offsite:-unknown}"
printf 'backup_file=%s\n' "${backup_file:-unknown}"
