#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="/root/apps/aced"
SHARED_DIR="${APP_ROOT}/shared"
ENV_FILE="${SHARED_DIR}/.env"

mkdir -p "${SHARED_DIR}"

if [[ -f "${ENV_FILE}" ]]; then
  echo "${ENV_FILE} already exists. Edit it manually if you need to update values."
  exit 0
fi

cat > "${ENV_FILE}" <<'EOF'
# Replace the placeholder values before exposing the app publicly.
NEXTAUTH_URL=https://your-subdomain-here
AUTH_SECRET=replace_me
AUTH_GOOGLE_ID=replace_me
AUTH_GOOGLE_SECRET=replace_me
DATABASE_URL=postgresql://aced_app:replace_me@127.0.0.1:54322/aced?sslmode=disable
OPENAI_API_KEY=replace_me
OPENAI_MODEL=gpt-5-mini
EOF

chmod 600 "${ENV_FILE}"
echo "Created ${ENV_FILE}"
