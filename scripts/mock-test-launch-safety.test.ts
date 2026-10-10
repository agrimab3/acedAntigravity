import assert from "node:assert/strict";
import test from "node:test";
import {
  getStudentSeatDisplay,
  toPublicSeatStatus,
} from "../lib/mockTest/seat-policy.ts";
import {
  isWaitlistInviteExpired,
  selectWaitlistHandoffCandidates,
} from "../lib/mockTest/waitlist-policy.ts";
import {
  getMockTestAuthMode,
  getMockTestPaymentMode,
  isMockTestSignupEnabled,
  MOCK_TEST_SIGNUPS_SOON_MESSAGE,
} from "../lib/mockTest/mode.ts";
import { sanitizeInternalCallbackUrl } from "../lib/safe-callback.ts";

test("student seat labels follow the exact launch thresholds", () => {
  const cases = [
    [0, "Limited seats"],
    [69, "Limited seats"],
    [70, "Limited seats"],
    [71, "Only 29 seats left"],
    [90, "Only 10 seats left"],
    [91, "Almost full: 9 seats left"],
    [99, "Almost full: 1 seat left"],
    [100, "Seats are full"],
  ] as const;

  for (const [taken, expected] of cases) {
    assert.equal(getStudentSeatDisplay(taken).text, expected);
  }
});

test("public seat status never exposes cap/taken and hides counts before threshold", () => {
  const early = toPublicSeatStatus(0);
  const seventy = toPublicSeatStatus(70);
  const threshold = toPublicSeatStatus(71);

  assert.equal(early.remaining, null);
  assert.equal(seventy.remaining, null);
  assert.equal(threshold.remaining, 29);
  assert.equal("taken" in early, false);
  assert.equal("limit" in early, false);
  assert.deepEqual(Object.keys(early).sort(), ["isFull", "label", "remaining", "text"]);
});

test("waitlist invite expires at 48 hours", () => {
  const invitedAt = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(
    isWaitlistInviteExpired(invitedAt, new Date("2026-10-03T11:59:59.999Z")),
    false
  );
  assert.equal(
    isWaitlistInviteExpired(invitedAt, new Date("2026-10-03T12:00:00.000Z")),
    true
  );
});

test("expired invite hands the freed spot to the next waitlist entry", () => {
  const candidates = [
    { id: "expired-person", email: "first@example.com" },
    { id: "next-person", email: "second@example.com" },
    { id: "third-person", email: "third@example.com" },
  ];

  const selected = selectWaitlistHandoffCandidates(
    candidates,
    ["expired-person"],
    1
  );

  assert.deepEqual(selected, [
    { id: "next-person", email: "second@example.com" },
  ]);
});

test("production with missing mock-test modes is disabled and shows open-soon copy", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = mutableEnv.NODE_ENV;
  const previousAuth = process.env.MOCK_TEST_AUTH_MODE;
  const previousPayment = process.env.MOCK_TEST_PAYMENT_MODE;

  try {
    mutableEnv.NODE_ENV = "production";
    delete process.env.MOCK_TEST_AUTH_MODE;
    delete process.env.MOCK_TEST_PAYMENT_MODE;

    assert.equal(getMockTestAuthMode(), "disabled");
    assert.equal(getMockTestPaymentMode(), "disabled");
    assert.equal(isMockTestSignupEnabled(), false);
    assert.equal(MOCK_TEST_SIGNUPS_SOON_MESSAGE, "Signups open soon ✦");

    process.env.MOCK_TEST_AUTH_MODE = "test";
    process.env.MOCK_TEST_PAYMENT_MODE = "test";
    assert.equal(getMockTestAuthMode(), "disabled");
    assert.equal(getMockTestPaymentMode(), "disabled");
    assert.equal(isMockTestSignupEnabled(), false);
  } finally {
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
    if (previousAuth === undefined) delete process.env.MOCK_TEST_AUTH_MODE;
    else process.env.MOCK_TEST_AUTH_MODE = previousAuth;
    if (previousPayment === undefined) delete process.env.MOCK_TEST_PAYMENT_MODE;
    else process.env.MOCK_TEST_PAYMENT_MODE = previousPayment;
  }
});

test("safe callbackUrl accepts local paths and rejects outside links", () => {
  assert.equal(
    sanitizeInternalCallbackUrl("/mock-test/signup?invite=abc", "/onboarding"),
    "/mock-test/signup?invite=abc"
  );
  assert.equal(
    sanitizeInternalCallbackUrl("https://evil.example/phish", "/onboarding"),
    "/onboarding"
  );
  assert.equal(
    sanitizeInternalCallbackUrl("//evil.example/phish", "/onboarding"),
    "/onboarding"
  );
  assert.equal(
    sanitizeInternalCallbackUrl("\\evil.example\phish", "/onboarding"),
    "/onboarding"
  );
});
