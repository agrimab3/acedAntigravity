#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/apps/aced/current
set -a
source /home/ubuntu/apps/aced/shared/.env
set +a
# UTC hours 08/09 cover PDT/PST; local-time guard chooses exactly one.
if [[ "$(TZ=America/Los_Angeles date +%H:%M)" != "01:30" ]]; then
  exit 0
fi
exec node scripts/content-nightly.mjs --limit=20
