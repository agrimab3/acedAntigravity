#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/home/ubuntu/apps/aced"
RELEASES_DIR="${APP_ROOT}/releases"
CURRENT_DIR="${APP_ROOT}/current"
PREVIOUS_LINK="${APP_ROOT}/previous"
SHARED_DIR="${APP_ROOT}/shared"
RUN_ENV_FILE="${SHARED_DIR}/.env"
BACKUP_DIR="${APP_ROOT}/backups"
LOG_DIR="${APP_ROOT}/logs"
PM2_APP_NAME="aced-web"
APP_PORT="3005"
HEALTHCHECK_URL="http://127.0.0.1:${APP_PORT}/api/health"
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-${GITHUB_SHA:-manual}"
RELEASE_ID="${RELEASE_ID:0:40}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"

install_cron_line() {
  local marker="$1"
  local cron_line="$2"
  local existing
  existing="$(crontab -l 2>/dev/null || true)"
  {
    printf '%s\n' "${existing}" | grep -vF "${marker}" || true
    printf '%s\n' "${cron_line} ${marker}"
  } | sed '/^$/d' | crontab -
}

install_schedulers() {
  install_cron_line "# ACED_MOCK_TEST_RELEASE_CRON" \
    "*/5 * * * * /usr/bin/flock -n /tmp/aced-mocktest-release.lock ${CURRENT_DIR}/scripts/run-mocktest-release-cron.sh >> ${LOG_DIR}/mocktest-release.log 2>&1"
  install_cron_line "# ACED_DATABASE_BACKUP_CRON" \
    "23 9 * * * /usr/bin/flock -n /tmp/aced-db-backup.lock ${CURRENT_DIR}/scripts/backup-db.sh >> ${LOG_DIR}/db-backup.log 2>&1"
  echo "Installed idempotent release and nightly database-backup crons."
}

mkdir -p "${RELEASES_DIR}" "${SHARED_DIR}" "${BACKUP_DIR}" "${LOG_DIR}"
chmod 700 "${SHARED_DIR}" "${BACKUP_DIR}"
chmod 750 "${LOG_DIR}"
if [[ ! -f "${RUN_ENV_FILE}" ]]; then
  echo "Missing production env file at ${RUN_ENV_FILE}" >&2
  exit 1
fi
if [[ ! -f "package.json" ]]; then
  echo "deploy-vps.sh must run from the checked out repository root" >&2
  exit 1
fi

mkdir -p "${RELEASE_DIR}"
rsync -a --delete \
  --exclude ".git" --exclude ".github" --exclude "node_modules" --exclude ".next" \
  --exclude ".env" --exclude ".env.local" --exclude ".claude" --exclude "google Oauth" \
  ./ "${RELEASE_DIR}/"

cd "${RELEASE_DIR}"
set -a
# shellcheck disable=SC1090
source "${RUN_ENV_FILE}"
set +a
# Build tooling is in devDependencies; NODE_ENV=production must not omit it.
npm ci --include=dev
npm run build
npm run db:migrate
node scripts/check-mocktest-production-release-state.mjs
chmod +x scripts/run-mocktest-release-cron.sh scripts/backup-db.sh scripts/restore-backup.sh scripts/rollback-vps.sh

prior_target=""
if [[ -L "${CURRENT_DIR}" ]]; then
  prior_target="$(readlink -f "${CURRENT_DIR}")"
elif [[ -d "${CURRENT_DIR}" ]]; then
  legacy="${RELEASES_DIR}/legacy-$(date -u +%Y%m%dT%H%M%SZ)"
  mv "${CURRENT_DIR}" "${legacy}"
  prior_target="${legacy}"
fi
if [[ -n "${prior_target}" && -d "${prior_target}" ]]; then
  ln -sfn "${prior_target}" "${PREVIOUS_LINK}"
fi
ln -sfn "${RELEASE_DIR}" "${APP_ROOT}/current.next"
mv -Tf "${APP_ROOT}/current.next" "${CURRENT_DIR}"

pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1 || pm2 start ecosystem.config.cjs --only "${PM2_APP_NAME}"
pm2 restart "${PM2_APP_NAME}" --update-env

healthy=false
for attempt in {1..30}; do
  if curl --silent --fail "${HEALTHCHECK_URL}" >/dev/null; then
    echo "Health check passed on attempt ${attempt}: ${HEALTHCHECK_URL}"
    healthy=true
    break
  fi
  sleep 2
done

if [[ "${healthy}" != "true" ]]; then
  echo "New release failed health check; rolling back automatically." >&2
  if [[ -L "${PREVIOUS_LINK}" ]]; then
    bash "${RELEASE_DIR}/scripts/rollback-vps.sh" || true
  fi
  pm2 logs "${PM2_APP_NAME}" --lines 100 --nostream || true
  exit 1
fi

install_schedulers
pm2 save

# Keep current, previous, plus one extra recent release. Never remove symlink targets.
current_real="$(readlink -f "${CURRENT_DIR}")"
previous_real="$(readlink -f "${PREVIOUS_LINK}" 2>/dev/null || true)"
mapfile -t old_releases < <(find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | awk '{print $2}')
kept=0
for release in "${old_releases[@]}"; do
  if [[ "${release}" == "${current_real}" || "${release}" == "${previous_real}" ]]; then
    continue
  fi
  kept=$((kept + 1))
  if (( kept > 1 )); then rm -rf -- "${release}"; fi
done
