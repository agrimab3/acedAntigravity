import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getCheckoutBlocker,
  hasRequiredNoRefundAcknowledgement,
} from "../lib/mockTest/signup-policy.ts";

const signup = readFileSync("app/mock-test/signup/SignupForm.tsx", "utf8");
const signupPage = readFileSync("app/mock-test/signup/page.tsx", "utf8");
const signIn = readFileSync("app/mock-test/auth/signin/page.tsx", "utf8");
const checkout = readFileSync("app/api/mock-test/checkout/route.ts", "utf8");

test("signup shows only a server-eligible Google account as signed in", () => {
  assert.match(signup, /Signed in with Google/);
  assert.match(signup, /accountSuccess/);
  assert.match(signup, /\{user\.email\}/);
  assert.match(signupPage, /getAccountConsentStatus/);
  assert.match(signupPage, /accountConsent\.complete/);
  assert.match(signupPage, /Google sign-in worked, but your account confirmations/);
  assert.match(signIn, /signin\/complete\?next=/);
});

test("required and optional signup choices start unchecked and are not restored", () => {
  assert.match(signup, /useState\(false\)/);
  assert.match(signup, /Legal and marketing choices deliberately begin unchecked/);
  assert.doesNotMatch(signup, /Boolean\(saved\?\.agreedNoRefund\)/);
  assert.doesNotMatch(signup, /Boolean\(saved\?\.marketingOptIn\)/);
  assert.match(signup, /required/);
});

test("checkout readiness explains every disabled state and enables only valid input", () => {
  assert.equal(getCheckoutBlocker({ signedIn: false, agreedToRefundPolicy: false, hasValidTimeZone: true, signupsClosed: false, seatsFull: false, checkoutBusy: false }), "Sign in with Google to save your seat.");
  assert.match(getCheckoutBlocker({ signedIn: true, agreedToRefundPolicy: false, hasValidTimeZone: true, signupsClosed: false, seatsFull: false, checkoutBusy: false }) ?? "", /required Refund/);
  assert.match(getCheckoutBlocker({ signedIn: true, agreedToRefundPolicy: true, hasValidTimeZone: false, signupsClosed: false, seatsFull: false, checkoutBusy: false }) ?? "", /time zone/);
  assert.match(getCheckoutBlocker({ signedIn: true, agreedToRefundPolicy: true, hasValidTimeZone: true, signupsClosed: false, seatsFull: true, checkoutBusy: false }) ?? "", /Seats are currently full/);
  assert.equal(getCheckoutBlocker({ signedIn: true, agreedToRefundPolicy: true, hasValidTimeZone: true, signupsClosed: false, seatsFull: false, checkoutBusy: false }), null);
  assert.match(signup, /Ready to open secure \$2 test checkout/);
});

test("checkout API requires a literal agreement and accepts optional marketing only as a boolean", () => {
  assert.equal(hasRequiredNoRefundAcknowledgement(true), true);
  assert.equal(hasRequiredNoRefundAcknowledgement(false), false);
  assert.equal(hasRequiredNoRefundAcknowledgement("true"), false);
  assert.equal(hasRequiredNoRefundAcknowledgement(1), false);
  assert.match(checkout, /agreedNoRefund: z\.literal\(true\)/);
  assert.match(checkout, /marketingOptIn: z\.boolean\(\)\.optional\(\)\.default\(false\)/);
  assert.match(checkout, /hasRequiredNoRefundAcknowledgement/);
});

test("signup preserves the legal links and staging remains test-only", () => {
  assert.match(signup, /legal\?tab=refunds/);
  assert.match(signup, /legal\?tab=mock-test-rules/);
  assert.match(signup, /subject to applicable law and the exceptions/);
  const staging = readFileSync("scripts/staging-isolation.test.mjs", "utf8");
  assert.match(staging, /ACED_STAGING_ORIGIN/);
  assert.match(staging, /test recipient/);
});
