#!/usr/bin/env bash
set -euo pipefail

STAGING_ENV="/home/ubuntu/apps/aced-staging/shared/.env"
test -f "${STAGING_ENV}"
set -a
source "${STAGING_ENV}"
set +a
test "${ACED_DEPLOYMENT_ENV:-}" = "staging"
test "${NEXT_PUBLIC_SITE_URL:-}" = "https://staging.aceditprep.com"
exec npm start -- --hostname 127.0.0.1 --port 3006
