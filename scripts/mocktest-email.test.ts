import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import {
  getMockReminderAt,
  resolveEmailDeliveryTarget,
  shouldRetryMockEmail,
} from "../lib/mockTest/email-policy.ts";
import {
  MOCK_EMAIL_HEADER_TOKEN,
  renderEveryMockEmailForTest,
} from "../lib/mockTest/email-templates.ts";

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
    subject: "Your scores are in ✦",
    nodeEnv: "production",
    testRecipient: "owner@example.com",
  });
  assert.equal(result.to, "student@example.com");
  assert.equal(result.subject, "Your scores are in ✦");
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

test("all six redesigned emails use the exact short copy and shared layout", () => {
  const messages = renderEveryMockEmailForTest({
    timeZone: "America/Los_Angeles",
    baseUrl: "http://localhost:3000",
  });
  assert.equal(messages.length, 6);
  const byType = Object.fromEntries(messages.map((message) => [message.type, message]));

  assert.match(byType.registration_confirmed.html, /#5DCAA5/);
  assert.match(byType.tomorrow_reminder.html, /#EF9F27/);
  assert.match(byType.waitlist_invite.html, /#8C84DE/);
  assert.match(byType.waitlist_joined.html, /#8C84DE/);
  assert.match(byType.payment_refunded.html, /#E2785A/);
  assert.match(byType.scores_released.html, /#5DCAA5/);
  assert.match(byType.scores_released.html, /#8C84DE/);
  assert.match(byType.scores_released.html, /#EF9F27/);
  assert.match(byType.scores_released.html, /#F0997B/);

  assert.equal(byType.registration_confirmed.subject, "You're in ✦");
  assert.match(byType.registration_confirmed.html, /Your seat for the ACED Mock Test is saved\./);
  assert.match(byType.registration_confirmed.html, /SATURDAY/);
  assert.match(byType.registration_confirmed.html, /December 5/);
  assert.match(byType.registration_confirmed.html, /Open all day, your time · start by 9 PM/);
  assert.match(byType.registration_confirmed.html, /About 3 hours with one break/);
  assert.match(byType.registration_confirmed.html, />Add to calendar</);
  assert.match(byType.registration_confirmed.html, /Scores out Sun, Dec 6 at 2 PM PT/);
  assert.match(byType.registration_confirmed.html, /\$2 · non-refundable/);

  assert.equal(byType.tomorrow_reminder.subject, "Tomorrow's the day");
  assert.match(byType.tomorrow_reminder.html, /Your mock test opens at midnight, your time\./);
  assert.match(byType.tomorrow_reminder.html, /Laptop charged/);
  assert.match(byType.tomorrow_reminder.html, /A quiet spot/);
  assert.match(byType.tomorrow_reminder.html, /About 3 hours free/);
  assert.match(byType.tomorrow_reminder.html, />Open mock test</);

  assert.equal(byType.waitlist_invite.subject, "A seat opened up for you");
  assert.match(byType.waitlist_invite.html, /It's yours if you grab it in time\./);
  assert.match(byType.waitlist_invite.html, /HOLDING IT UNTIL/);
  assert.match(byType.waitlist_invite.html, /Sun, Nov 22 · 4:15 PM/);
  assert.match(byType.waitlist_invite.html, />Claim my seat</);

  assert.equal(byType.waitlist_joined.subject, "You're on the waitlist");
  assert.match(byType.waitlist_joined.html, /If a seat opens, we'll email you right away\. Nothing else to do\./);
  assert.match(byType.waitlist_joined.html, /You'll have 48 hours to claim it\./);
  assert.match(byType.waitlist_joined.html, />Practice while you wait</);
  assert.doesNotMatch(byType.waitlist_joined.html, /aced-card" style="margin-top:22px/);

  assert.equal(byType.payment_refunded.subject, "Your $2 is on its way back");
  assert.match(byType.payment_refunded.html, /The test filled up before your payment went through, so we refunded you\./);
  assert.match(byType.payment_refunded.html, /YOU'RE FIRST IN LINE/);
  assert.match(byType.payment_refunded.html, /Refunds take 5 to 10 days to show up\./);

  assert.equal(byType.scores_released.subject, "Your scores are in ✦");
  assert.match(byType.scores_released.html, /Your ACED Mock Test results are ready\./);
  assert.match(byType.scores_released.html, /English/);
  assert.match(byType.scores_released.html, /Math/);
  assert.match(byType.scores_released.html, /Reading/);
  assert.match(byType.scores_released.html, /Science/);
  assert.match(byType.scores_released.html, />See my scores</);
  assert.doesNotMatch(byType.scores_released.html, /composite|percentile|score:\s*\d/i);

  for (const message of messages) {
    assert.match(message.html, new RegExp(MOCK_EMAIL_HEADER_TOKEN));
    assert.match(message.html, /width="600" height="200" alt="Aced"/);
    assert.match(message.html, /max-width:600px/);
    assert.match(message.html, /background:#FFFFFF/);
    assert.match(message.html, /meta name="color-scheme" content="light dark"/);
    assert.match(message.html, /prefers-color-scheme: dark/);
    assert.ok(message.previewText.length > 0);
    assert.ok(message.text.length > 30);
    assert.doesNotMatch(message.html, /100 seats|of 100|seat cap/i);
    assert.doesNotMatch(message.text, /100 seats|of 100|seat cap/i);
  }

  assert.equal(byType.registration_confirmed.attachments.length, 1);
  assert.match(byType.registration_confirmed.attachments[0]?.content ?? "", /BEGIN:VCALENDAR/);
  assert.match(byType.registration_confirmed.attachments[0]?.content ?? "", /TZID=America\/Los_Angeles/);
});

test("header delivery uses CID locally and absolute site URLs in production", () => {
  const outbox = readFileSync(
    new URL("../lib/mockTest/email-outbox.ts", import.meta.url),
    "utf8"
  );
  assert.match(outbox, /nodeEnv === "production"/);
  assert.match(outbox, /`\$\{getMockEmailSiteBaseUrl\(\)\}\/email\/\$\{filename\}`/);
  assert.match(outbox, /"cid:aced-header"/);
  assert.match(outbox, /contentId: "aced-header"/);
  assert.match(outbox, /from: `Aced <\$\{MOCK_EMAIL_FROM\}>`/);
  assert.match(outbox, /replyTo: MOCK_EMAIL_SUPPORT/);
});

test("all six GIF headers are 1200x400 and under 250 KB", () => {
  const files = [
    "header-in.gif",
    "header-tomorrow.gif",
    "header-seat-open.gif",
    "header-waitlist.gif",
    "header-refund.gif",
    "header-scores.gif",
  ];
  for (const file of files) {
    const url = new URL(`../public/email/${file}`, import.meta.url);
    const data = readFileSync(url);
    assert.equal(data.subarray(0, 3).toString("ascii"), "GIF");
    assert.equal(data.readUInt16LE(6), 1200);
    assert.equal(data.readUInt16LE(8), 400);
    assert.ok(statSync(url).size < 250 * 1024, `${file} must stay under 250 KB`);
  }
});
