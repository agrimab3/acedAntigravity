import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getMockReminderAt,
  resolveEmailDeliveryTarget,
  shouldRetryMockEmail,
} from "../lib/mockTest/email-policy.ts";
import { renderEveryMockEmailForTest } from "../lib/mockTest/email-templates.ts";

test("development email safety never targets the real recipient", () => {
  const result = resolveEmailDeliveryTarget({
    realRecipient: "student@example.com",
    subject: "You're in ✦",
    nodeEnv: "development",
    testRecipient: "owner@example.com",
  });
  assert.equal(result.to, "owner@example.com");
  assert.equal(result.subject, "[to: student@example.com] You're in ✦");
  assert.notEqual(result.to, "student@example.com");
});

test("production email targets the intended recipient", () => {
  const result = resolveEmailDeliveryTarget({
    realRecipient: "student@example.com",
    subject: "Your scores are out ✦",
    nodeEnv: "production",
    testRecipient: "owner@example.com",
  });
  assert.equal(result.to, "student@example.com");
  assert.equal(result.subject, "Your scores are out ✦");
});

test("same email cannot be sent twice and retries stop after five failures", () => {
  const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
  const outbox = readFileSync(
    new URL("../lib/mockTest/email-outbox.ts", import.meta.url),
    "utf8"
  );
  assert.match(schema, /mock_email_outbox_unique_key_idx/);
  assert.match(outbox, /onConflictDoNothing/);
  assert.match(outbox, /idempotencyKey: String\(row\.unique_key\)/);
  assert.match(outbox, /attempts < \${MOCK_EMAIL_MAX_ATTEMPTS}/);
  assert.match(outbox, /attempts=o\.attempts\+1/);
  assert.equal(shouldRetryMockEmail(1, null), true);
  assert.equal(shouldRetryMockEmail(4, null), true);
  assert.equal(shouldRetryMockEmail(5, null), false);
  assert.equal(shouldRetryMockEmail(1, new Date()), false);
});

test("Friday 5 PM reminder is correct in Pacific, Eastern, and Hawaii", () => {
  assert.equal(
    getMockReminderAt("America/Los_Angeles").toISOString(),
    "2026-12-05T01:00:00.000Z"
  );
  assert.equal(
    getMockReminderAt("America/New_York").toISOString(),
    "2026-12-04T22:00:00.000Z"
  );
  assert.equal(
    getMockReminderAt("Pacific/Honolulu").toISOString(),
    "2026-12-05T03:00:00.000Z"
  );
});

test("every mock-test email type renders HTML and plain text without errors", () => {
  const messages = renderEveryMockEmailForTest({
    timeZone: "America/Los_Angeles",
    baseUrl: "http://localhost:3000",
  });
  assert.equal(messages.length, 6);
  assert.deepEqual(
    messages.map((message) => message.type).sort(),
    [
      "payment_refunded",
      "registration_confirmed",
      "scores_released",
      "tomorrow_reminder",
      "waitlist_invite",
      "waitlist_joined",
    ].sort()
  );
  for (const message of messages) {
    assert.ok(message.subject.length > 0);
    assert.match(message.html, /background:#070B14/);
    assert.match(message.html, /#5DCAA5/);
    assert.ok(message.text.length > 40);
    assert.doesNotMatch(message.html, /100 seats|of 100|seat cap/i);
    assert.doesNotMatch(message.text, /100 seats|of 100|seat cap/i);
  }
  const confirmation = messages.find((message) => message.type === "registration_confirmed");
  assert.equal(confirmation?.attachments.length, 1);
  assert.match(confirmation?.attachments[0]?.content ?? "", /BEGIN:VCALENDAR/);
  assert.match(confirmation?.attachments[0]?.content ?? "", /TZID=America\/Los_Angeles/);
});
