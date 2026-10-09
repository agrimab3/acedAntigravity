#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/root/apps/aced"
RUN_ENV_FILE="${APP_ROOT}/shared/.env"

if [[ ! -f "${RUN_ENV_FILE}" ]]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] mock release: missing env file" >&2
  exit 1
fi

set -a
source "${RUN_ENV_FILE}"
set +a

RELEASE_URL="${MOCK_TEST_RELEASE_URL:-http://127.0.0.1:3005/api/cron/mock-test-release}"

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] mock release: CRON_SECRET is missing" >&2
  exit 1
fi

auth_config="$(mktemp)"
trap 'rm -f "${auth_config}"' EXIT
chmod 600 "${auth_config}"
printf 'header = "Authorization: Bearer %s"\n' "${CRON_SECRET}" > "${auth_config}"

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if response=$(curl --silent --show-error --fail \
  --max-time 60 \
  --config "${auth_config}" \
  "${RELEASE_URL}"); then
  echo "[${started_at}] mock release: ${response}"
else
  status=$?
  echo "[${started_at}] mock release: request failed with curl status ${status}" >&2
  exit "${status}"
fi
