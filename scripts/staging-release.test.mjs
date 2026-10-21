import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deploy = readFileSync("scripts/deploy-staging-vps.sh", "utf8");
const start = readFileSync("deploy/staging/start-staging.sh", "utf8");
const ecosystem = readFileSync("deploy/staging/ecosystem.config.cjs", "utf8");

test("staging release verifies isolation, test-only Stripe, activation, and health before success", () => {
  assert.match(deploy, /aced_staging/);
  assert.match(deploy, /sk_test_/);
  assert.match(deploy, /pk_test_/);
  assert.match(deploy, /whsec_/);
  assert.match(deploy, /STAGING_EMAIL_WORKER_TOKEN/);
  assert.match(deploy, /aced-staging-email-worker/);
  assert.match(deploy, /current\.next/);
  assert.match(deploy, /rollback\(\)/);
  assert.match(deploy, /trap on_activation_failure ERR/);
  assert.match(deploy, /127\.0\.0\.1:\$\{PORT\}\/api\/health/);
  assert.match(start, /shared\/\.env/);
  assert.match(start, /ACED_DEPLOYMENT_ENV.*staging/);
});

test("staging Next server binds only to loopback for Caddy", () => {
  assert.match(start, /--hostname 127\.0\.0\.1 --port 3006/);
  assert.match(ecosystem, /HOSTNAME:\s*"127\.0\.0\.1"/);
});
