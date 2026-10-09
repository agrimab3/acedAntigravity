import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decideStripeCheckoutCompletion,
  hasStripeWebhookSignature,
  isExpectedMockCheckoutPayment,
  shouldProcessStripeEventClaim,
  shouldReleaseCheckoutHoldOnExpiredEvent,
} from "../lib/mockTest/stripe-policy.ts";

test("Stripe webhook signature is required", () => {
  assert.equal(hasStripeWebhookSignature(null, "whsec_test"), false);
  assert.equal(hasStripeWebhookSignature("sig", undefined), false);
  assert.equal(hasStripeWebhookSignature("sig", "whsec_test"), true);
});

test("duplicate Stripe event claim is ignored", () => {
  assert.equal(shouldProcessStripeEventClaim(1), true);
  assert.equal(shouldProcessStripeEventClaim(0), false);

  const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /eventId: text\("event_id"\)\.primaryKey\(\)/);
  assert.match(schema, /mock_registrations_test_user_idx/);
});

test("success page alone never marks a registration paid", () => {
  const page = readFileSync(
    new URL("../app/mock-test/confirmed/page.tsx", import.meta.url),
    "utf8"
  );
  const waiting = readFileSync(
    new URL("../app/mock-test/confirmed/WaitingForPayment.tsx", import.meta.url),
    "utf8"
  );

  for (const source of [page, waiting]) {
    assert.doesNotMatch(source, /markRegistrationPaid/);
    assert.doesNotMatch(source, /completeStripeRegistration/);
    assert.doesNotMatch(source, /update\(mockRegistrations\)/);
    assert.doesNotMatch(source, /\/api\/stripe\/webhook/);
  }
});

test("expired Checkout Session releases only the matching unpaid hold", () => {
  assert.equal(
    shouldReleaseCheckoutHoldOnExpiredEvent(null, "cs_current", "cs_current"),
    true
  );
  assert.equal(
    shouldReleaseCheckoutHoldOnExpiredEvent(new Date(), "cs_current", "cs_current"),
    false
  );
  assert.equal(
    shouldReleaseCheckoutHoldOnExpiredEvent(null, "cs_new", "cs_old"),
    false
  );
  assert.equal(
    shouldReleaseCheckoutHoldOnExpiredEvent(null, "cs_current", null),
    true
  );
});


test("declined card keeps the seat hold until Checkout expires", () => {
  const route = readFileSync(
    new URL("../app/api/stripe/webhook/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(route, /checkout\.session\.expired/);
  assert.doesNotMatch(route, /payment_intent\.payment_failed/);

  assert.equal(
    shouldReleaseCheckoutHoldOnExpiredEvent(null, "cs_current", "cs_current"),
    true
  );
});

test("completed Checkout must be paid and exactly $2 USD", () => {
  assert.equal(
    isExpectedMockCheckoutPayment({
      paymentStatus: "paid",
      amountTotal: 200,
      currency: "usd",
    }),
    true
  );
  assert.equal(
    isExpectedMockCheckoutPayment({
      paymentStatus: "paid",
      amountTotal: 3000,
      currency: "usd",
    }),
    false
  );
  assert.equal(
    isExpectedMockCheckoutPayment({
      paymentStatus: "unpaid",
      amountTotal: 200,
      currency: "usd",
    }),
    false
  );
});

test("expired hold plus full test requires automatic refund", () => {
  assert.equal(
    decideStripeCheckoutCompletion({
      alreadyPaid: false,
      alreadyRefunded: false,
      activeHold: false,
      occupiedWithoutRegistration: 100,
      seatCap: 100,
    }),
    "refund_required"
  );

  assert.equal(
    decideStripeCheckoutCompletion({
      alreadyPaid: false,
      alreadyRefunded: false,
      activeHold: true,
      occupiedWithoutRegistration: 100,
      seatCap: 100,
    }),
    "paid"
  );
});

test("Stripe webhook route enforces signature, idempotency, and refund processing", () => {
  const route = readFileSync(
    new URL("../app/api/stripe/webhook/route.ts", import.meta.url),
    "utf8"
  );
  const payments = readFileSync(
    new URL("../lib/mockTest/payments.ts", import.meta.url),
    "utf8"
  );

  assert.match(route, /webhooks\.constructEvent/);
  assert.match(route, /onConflictDoNothing/);
  assert.match(route, /refunds\.create/);
  assert.match(route, /recordNoSeatRefund/);
  assert.match(
    payments,
    /eq\(mockRegistrations\.stripeCheckoutSessionId, checkoutSessionId\)/
  );
});
