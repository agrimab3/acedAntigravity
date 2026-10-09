#!/usr/bin/env bash
set -euo pipefail

backup="${1:-}"
if [[ -z "${backup}" || ! -f "${backup}" ]]; then
  echo "Usage: TARGET_DATABASE_URL=postgresql://... bash scripts/restore-backup.sh /path/to/aced-backup.dump" >&2
  exit 2
fi
if [[ -z "${TARGET_DATABASE_URL:-}" ]]; then
  echo "TARGET_DATABASE_URL is required; DATABASE_URL is never used implicitly for restore." >&2
  exit 2
fi
if [[ "${ALLOW_PRODUCTION_RESTORE:-false}" != "true" ]]; then
  target_name="$(node -e 'try{console.log(new URL(process.env.TARGET_DATABASE_URL).pathname.slice(1))}catch{process.exit(2)}')"
  if [[ ! "${target_name}" =~ (restore|test|throwaway|rehearsal|ci) ]]; then
    echo "Refusing restore to a non-test-looking database without ALLOW_PRODUCTION_RESTORE=true." >&2
    exit 2
  fi
fi

pg_restore --dbname="${TARGET_DATABASE_URL}" --clean --if-exists --no-owner --no-privileges "${backup}"
echo "Database restore completed successfully."
