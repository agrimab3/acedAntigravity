import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const deploy = readFileSync("scripts/deploy-vps.sh", "utf8");
const migrationVerification = readFileSync("scripts/verify-applied-drizzle-migrations.mjs", "utf8");
const ecosystem = readFileSync("ecosystem.config.cjs", "utf8");

test("release requires a verified expected source commit before activation", () => {
  assert.match(deploy, /GITHUB_SHA must be the expected Git commit/);
  assert.match(deploy, /ACED_SOURCE_COMMIT/);
  assert.match(deploy, /Release source does not match the expected Git commit/);
  assert.match(deploy, /\.aced-release-commit/);
});

test("release verifies migrations before switching the active symlink", () => {
  const migrationCheck = deploy.indexOf("node scripts/verify-applied-drizzle-migrations.mjs");
  const activation = deploy.indexOf('mv -Tf "${APP_ROOT}/current.next" "${CURRENT_DIR}"');
  assert.ok(migrationCheck >= 0 && activation >= 0 && migrationCheck < activation);
  assert.match(migrationVerification, /drizzle\.__drizzle_migrations/);
  assert.match(migrationVerification, /Migration verification failed/);
});

test("release fails and rolls back if activation, commit, or health verification fails", () => {
  assert.match(deploy, /Release activation verification failed; rolling back automatically/);
  assert.match(deploy, /Active release changed before completion; rolling back automatically/);
  assert.match(deploy, /New release failed health check; rolling back automatically/);
  assert.match(deploy, /exit 1/);
});

test("release writes private, sanitized build-only diagnostics and never treats a failed build as success", () => {
  assert.match(deploy, /BUILD_LOG_DIR="\$\{LOG_DIR\}\/release-builds"/);
  assert.match(deploy, /chmod 700 "\$\{BUILD_LOG_DIR\}"/);
  assert.match(deploy, /chmod 600 "\$\{BUILD_LOG\}"/);
  assert.match(deploy, /redact_build_output/);
  assert.match(deploy, /event=build_step_started/);
  assert.match(deploy, /event=build_step_failed/);
  assert.match(deploy, /failure_category=/);
  assert.match(deploy, /abort_build_on_signal/);
  assert.match(deploy, /run_logged_build_step dependencies npm ci --include=dev/);
  assert.match(deploy, /run_logged_build_step next_build npm run build/);
  assert.doesNotMatch(deploy, /npm run build\nnode scripts\/verify-applied/);
});

test("production Next server is reachable only through the local reverse proxy", () => {
  assert.match(ecosystem, /HOSTNAME:\s*"127\.0\.0\.1"/);
  assert.match(ecosystem, /--hostname 127\.0\.0\.1 --port 3005/);
  assert.match(deploy, /pm2 reload ecosystem\.config\.cjs --only/);
  assert.doesNotMatch(deploy, /pm2 restart "\$\{PM2_APP_NAME\}" --update-env/);
});
