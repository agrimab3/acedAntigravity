import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  consumeRateLimit,
  createRateLimitTestStore,
  RATE_LIMITS,
} from "../lib/rate-limit.ts";

test("tutor allows 30 messages per hour and blocks the 31st", () => {
  const store = createRateLimitTestStore();
  for (let i = 0; i < 30; i += 1) {
    assert.equal(consumeRateLimit("tutor:user", RATE_LIMITS.tutor, 1000, store).allowed, true);
  }
  const blocked = consumeRateLimit("tutor:user", RATE_LIMITS.tutor, 1000, store);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("checkout allows only a few tries per minute then resets", () => {
  const store = createRateLimitTestStore();
  for (let i = 0; i < 5; i += 1) {
    assert.equal(consumeRateLimit("checkout:user", RATE_LIMITS.checkout, 0, store).allowed, true);
  }
  assert.equal(consumeRateLimit("checkout:user", RATE_LIMITS.checkout, 0, store).allowed, false);
  assert.equal(consumeRateLimit("checkout:user", RATE_LIMITS.checkout, 60_001, store).allowed, true);
});

test("60 different students can sign in from one school IP within a minute", () => {
  const store = createRateLimitTestStore();
  const now = 1_000;
  for (let index = 0; index < 60; index += 1) {
    assert.equal(
      consumeRateLimit("login-ip:school", RATE_LIMITS.loginIp, now, store).allowed,
      true
    );
    assert.equal(
      consumeRateLimit(
        `login-account:student-${index}`,
        RATE_LIMITS.loginAccount,
        now,
        store
      ).allowed,
      true
    );
  }
});

test("one account is still limited before the school-wide IP limit", () => {
  const store = createRateLimitTestStore();
  for (let index = 0; index < RATE_LIMITS.loginAccount.limit; index += 1) {
    assert.equal(
      consumeRateLimit("login-account:same-student", RATE_LIMITS.loginAccount, 1_000, store)
        .allowed,
      true
    );
  }
  assert.equal(
    consumeRateLimit("login-account:same-student", RATE_LIMITS.loginAccount, 1_000, store)
      .allowed,
    false
  );
});

test("answer saving route is not rate limited", () => {
  const source = readFileSync("app/api/mock-test/session/answer/route.ts", "utf8");
  assert.doesNotMatch(source, /consumeRateLimit|RATE_LIMITS/);
});
