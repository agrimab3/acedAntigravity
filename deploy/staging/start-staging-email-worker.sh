#!/usr/bin/env bash
set -euo pipefail

STAGING_ENV="/home/ubuntu/apps/aced-staging/shared/.env"
test -f "${STAGING_ENV}"
set -a
source "${STAGING_ENV}"
set +a
test "${ACED_DEPLOYMENT_ENV:-}" = "staging"
test -n "${STAGING_EMAIL_WORKER_TOKEN:-}"

while true; do
  if [[ "${STAGING_EMAIL_DELIVERY_ENABLED:-false}" = "true" ]]; then
    curl --silent --show-error --fail --max-time 30 \
      -H "Authorization: Bearer ${STAGING_EMAIL_WORKER_TOKEN}" \
      "http://127.0.0.1:3006/api/cron/mock-test-email" >/dev/null \
      || echo "staging email worker: delivery attempt failed"
  fi
  sleep 60
done
