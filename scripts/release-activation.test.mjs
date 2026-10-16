import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const deploy = readFileSync("scripts/deploy-vps.sh", "utf8");
const migrationVerification = readFileSync("scripts/verify-applied-drizzle-migrations.mjs", "utf8");

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
