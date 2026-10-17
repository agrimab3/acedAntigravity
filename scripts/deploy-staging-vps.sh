#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/apps/aced-staging"
RELEASES="${ROOT}/releases"
CURRENT="${ROOT}/current"
PREVIOUS="${ROOT}/previous"
ENV_FILE="${ROOT}/shared/.env"
APP="aced-staging"
WORKER_APP="aced-staging-email-worker"
PORT=3006
EXPECTED="${GITHUB_SHA:-}"
SOURCE="${ACED_SOURCE_COMMIT:-}"

[[ "${EXPECTED}" =~ ^[0-9a-fA-F]{7,40}$ ]] || { echo "Expected commit is required." >&2; exit 1; }
[[ "${SOURCE}" =~ ^[0-9a-fA-F]{7,40}$ ]] || { echo "Source commit is required." >&2; exit 1; }
[[ "${SOURCE:0:${#EXPECTED}}" = "${EXPECTED}" ]] || { echo "Source commit does not match expected commit." >&2; exit 1; }
test -f "${ENV_FILE}"
test -f package.json

set -a
source "${ENV_FILE}"
set +a
node - <<'NODE'
const required = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "RESEND_API_KEY", "EMAIL_TEST_TO", "STAGING_TEST_EMAIL", "STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET", "STAGING_EMAIL_WORKER_TOKEN"];
if (process.env.ACED_DEPLOYMENT_ENV !== "staging" || process.env.NEXTAUTH_URL !== "https://staging.aceditprep.com" || process.env.NEXT_PUBLIC_SITE_URL !== "https://staging.aceditprep.com" || required.some((key) => !process.env[key])) process.exit(1);
const url = new URL(process.env.DATABASE_URL || "");
if (url.pathname !== "/aced_staging" || url.username !== "aced_staging" || !process.env.STRIPE_SECRET_KEY.startsWith("sk_test_") || !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith("pk_test_") || !process.env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) process.exit(1);
NODE

ID="$(date -u +%Y%m%dT%H%M%SZ)-${EXPECTED:0:12}"
RELEASE="${RELEASES}/${ID}"
mkdir -p "${RELEASES}"
test ! -e "${RELEASE}"
mkdir "${RELEASE}"
rsync -a --delete --exclude .git --exclude .next --exclude node_modules --exclude .env --exclude .env.local ./ "${RELEASE}/"
printf '%s\n' "${EXPECTED}" > "${RELEASE}/.aced-release-commit"
cd "${RELEASE}"
npm ci --include=dev
npm run build
npm run db:migrate
node scripts/verify-applied-drizzle-migrations.mjs
chmod +x deploy/staging/start-staging.sh
chmod +x deploy/staging/start-staging-email-worker.sh

prior=""
if [[ -L "${CURRENT}" ]]; then prior="$(readlink -f "${CURRENT}")"; fi
if [[ -n "${prior}" ]]; then ln -sfn "${prior}" "${PREVIOUS}"; fi
rollback() {
  if [[ -n "${prior}" && -d "${prior}" ]]; then
    ln -sfn "${prior}" "${ROOT}/current.rollback"
    mv -Tf "${ROOT}/current.rollback" "${CURRENT}"
    pm2 restart "${APP}" --update-env >/dev/null
    pm2 restart "${WORKER_APP}" --update-env >/dev/null || true
  fi
}
activating=0
on_activation_failure() {
  local status=$?
  if [[ "${activating}" = "1" ]]; then
    rollback
  fi
  exit "${status}"
}
trap on_activation_failure ERR
ln -sfn "${RELEASE}" "${ROOT}/current.next"
mv -Tf "${ROOT}/current.next" "${CURRENT}"
activating=1
test "$(readlink -f "${CURRENT}")" = "${RELEASE}"
test "$(cat "${RELEASE}/.aced-release-commit")" = "${EXPECTED}"
pm2 describe "${APP}" >/dev/null 2>&1 || pm2 start deploy/staging/ecosystem.config.cjs --only "${APP}"
pm2 restart "${APP}" --update-env
for _ in {1..30}; do curl --silent --fail "http://127.0.0.1:${PORT}/api/health" >/dev/null && break; sleep 2; done
curl --silent --fail "http://127.0.0.1:${PORT}/api/health" >/dev/null || { rollback; exit 1; }
test "$(readlink -f "${CURRENT}")" = "${RELEASE}" || { rollback; exit 1; }
pm2 describe "${WORKER_APP}" >/dev/null 2>&1 || pm2 start deploy/staging/ecosystem.config.cjs --only "${WORKER_APP}"
pm2 restart "${WORKER_APP}" --update-env
pm2 describe "${WORKER_APP}" >/dev/null
pm2 save >/dev/null
activating=0
echo "Staging release ${ID} activated."
