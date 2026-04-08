#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="/root/apps/aced"
CURRENT_DIR="${APP_ROOT}/current"
SHARED_DIR="${APP_ROOT}/shared"
RUN_ENV_FILE="${SHARED_DIR}/.env"
PM2_APP_NAME="aced-web"
APP_PORT="3005"
HEALTHCHECK_URL="http://127.0.0.1:${APP_PORT}/api/health"

mkdir -p "${CURRENT_DIR}" "${SHARED_DIR}"

if [[ ! -f "${RUN_ENV_FILE}" ]]; then
  echo "Missing production env file at ${RUN_ENV_FILE}" >&2
  exit 1
fi

if [[ ! -f "package.json" ]]; then
  echo "deploy-vps.sh must run from the checked out repository root" >&2
  exit 1
fi

rsync -a --delete \
  --exclude ".git" \
  --exclude ".github" \
  --exclude "node_modules" \
  --exclude ".next" \
  --exclude ".env" \
  --exclude ".env.local" \
  --exclude ".claude" \
  --exclude "google Oauth" \
  ./ "${CURRENT_DIR}/"

cd "${CURRENT_DIR}"

npm ci
npm run build

set -a
source "${RUN_ENV_FILE}"
set +a

npm run db:migrate

pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1 || pm2 start ecosystem.config.cjs --only "${PM2_APP_NAME}"
pm2 restart "${PM2_APP_NAME}" --update-env

for attempt in {1..30}; do
  if curl --silent --fail "${HEALTHCHECK_URL}" >/dev/null; then
    echo "Health check passed on attempt ${attempt}: ${HEALTHCHECK_URL}"
    pm2 save
    exit 0
  fi

  sleep 2
done

echo "Health check failed for ${HEALTHCHECK_URL}" >&2
pm2 logs "${PM2_APP_NAME}" --lines 100 --nostream || true
exit 1

pm2 save
