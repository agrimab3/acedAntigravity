#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/home/ubuntu/apps/aced"
CURRENT="${APP_ROOT}/current"
PREVIOUS="${APP_ROOT}/previous"
PM2_APP_NAME="aced-web"
HEALTHCHECK_URL="http://127.0.0.1:3005/api/health"

if [[ ! -L "${PREVIOUS}" ]]; then
  echo "No previous release is available to roll back to." >&2
  exit 1
fi
previous_target="$(readlink -f "${PREVIOUS}")"
if [[ ! -f "${previous_target}/package.json" ]]; then
  echo "Previous release is invalid." >&2
  exit 1
fi
current_target="$(readlink -f "${CURRENT}" 2>/dev/null || true)"
ln -sfn "${previous_target}" "${APP_ROOT}/current.next"
mv -Tf "${APP_ROOT}/current.next" "${CURRENT}"
if [[ -n "${current_target}" && -d "${current_target}" ]]; then
  ln -sfn "${current_target}" "${PREVIOUS}"
fi
pm2 restart "${PM2_APP_NAME}" --update-env
for attempt in {1..30}; do
  if curl --silent --fail "${HEALTHCHECK_URL}" >/dev/null; then
    pm2 save
    echo "Rollback healthy: ${previous_target}"
    exit 0
  fi
  sleep 2
done
echo "Rollback target failed health check." >&2
exit 1
