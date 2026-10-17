import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync("lib/mockTest/staging-email-worker.ts", "utf8");
const route = readFileSync("app/api/cron/mock-test-email/route.ts", "utf8");

test("staging email worker is staging-only, token-protected, and delivery-disabled by default", () => {
  assert.match(worker, /isAcedStaging/);
  assert.match(worker, /STAGING_EMAIL_DELIVERY_ENABLED === "true"/);
  assert.match(worker, /STAGING_EMAIL_WORKER_TOKEN/);
  assert.match(worker, /timingSafeEqual/);
  assert.match(route, /Unauthorized\./);
  assert.match(route, /delivery: "disabled"/);
  assert.match(route, /reconcileMockTestEmailOutbox/);
  assert.match(route, /processMockEmailOutbox/);
});
