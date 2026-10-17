import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { matchingStagingOwnerEmail } from "./check-staging-config.mjs";

const checkout = readFileSync("lib/mockTest/stripe-policy.ts", "utf8");
const emailPolicy = readFileSync("lib/mockTest/email-policy.ts", "utf8");
const reset = readFileSync("scripts/reset-staging-mock-test-fixture.mjs", "utf8");
const stagingCheck = readFileSync("scripts/check-staging-config.mjs", "utf8");
const caddy = readFileSync("deploy/staging/Caddyfile.template", "utf8");
const worker = readFileSync("deploy/staging/start-staging-email-worker.sh", "utf8");
const workerRoute = readFileSync("app/api/cron/mock-test-email/route.ts", "utf8");

test("staging is explicit while production retains its sole canonical checkout origin", () => {
  assert.match(checkout, /ACED_PRODUCTION_ORIGIN/);
  assert.match(checkout, /ACED_STAGING_ORIGIN/);
  assert.match(checkout, /deploymentEnvironment/);
  assert.match(checkout, /environment === "staging"/);
});

test("staging mail is forcibly limited to one configured test recipient", () => {
  assert.match(emailPolicy, /isAcedStaging/);
  assert.match(emailPolicy, /EMAIL_TEST_TO must be exactly one valid email address/);
  assert.match(emailPolicy, /\[staging to:/);
});

test("staging reset rejects every non-staging target and scopes destructive work to owner fixtures", () => {
  assert.match(reset, /ACED_DEPLOYMENT_ENV=staging/);
  assert.match(reset, /aced_staging/);
  assert.match(reset, /STAGING_TEST_EMAIL.*EMAIL_TEST_TO/);
  assert.match(reset, /--confirm/);
  assert.match(reset, /mt\.slug=\$1 and lower\(u\.email\)=lower\(\$2\)/);
  assert.doesNotMatch(reset, /production.*DATABASE_URL/i);
});

test("staging config and Caddy templates require isolated private operation", () => {
  assert.match(stagingCheck, /isolated staging database name and user/);
  assert.match(stagingCheck, /sk_test_/);
  assert.match(stagingCheck, /single owner email recipient/);
  assert.match(caddy, /staging\.aceditprep\.com/);
  assert.match(caddy, /basicauth/);
  assert.match(caddy, /@emailAssets path \/email\/\* \/api\/mock-test\/calendar\*/);
  assert.match(caddy, /X-Robots-Tag "noindex, nofollow, noarchive"/);
  assert.match(caddy, /api\/stripe\/webhook/);
});

test("staging email delivery has a private worker and remains disabled unless explicitly enabled", () => {
  assert.match(worker, /STAGING_EMAIL_DELIVERY_ENABLED:-false/);
  assert.match(worker, /127\.0\.0\.1:3006\/api\/cron\/mock-test-email/);
  assert.match(worker, /STAGING_EMAIL_WORKER_TOKEN/);
  assert.match(workerRoute, /isAuthorizedStagingEmailWorker/);
  assert.match(workerRoute, /isStagingEmailDeliveryEnabled/);
  assert.match(workerRoute, /processMockEmailOutbox/);
});

test("staging gate requires present, valid, matching owner email values", () => {
  assert.equal(matchingStagingOwnerEmail(undefined, undefined), false);
  assert.equal(matchingStagingOwnerEmail("", ""), false);
  assert.equal(matchingStagingOwnerEmail("owner@example.com", "other@example.com"), false);
  assert.equal(matchingStagingOwnerEmail("owner@example.com", "owner@example.com"), true);
  assert.equal(matchingStagingOwnerEmail("owner@example.com, second@example.com", "owner@example.com, second@example.com"), false);
});
