import assert from "node:assert/strict";
import { createRequire } from "node:module";
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

const require = createRequire(import.meta.url);
const { GifReader } = require("omggif") as { GifReader: new (data: Buffer) => { numFrames(): number; frameInfo(index: number): { delay: number } } };

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

test("all six follow-up email templates use the requested copy", () => {
  const messages = renderEveryMockEmailForTest({
    timeZone: "America/Los_Angeles",
    baseUrl: "http://localhost:3000",
  });
  assert.equal(messages.length, 6);
  const byType = Object.fromEntries(messages.map((message) => [message.type, message]));

  const confirmed = byType.registration_confirmed;
  assert.equal(confirmed.subject, "You're in ✦");
  assert.match(confirmed.html, /Your seat for the ACED Mock Test is saved\. Here's everything you need for test day\./);
  assert.match(confirmed.html, /Open all day in your time zone \(Pacific\)/);
  assert.match(confirmed.html, /Start any time, as long as it's by 9 PM/);
  assert.match(confirmed.html, /HOW IT WORKS/);
  assert.match(confirmed.html, /All 4 sections in one sitting: English, Math, Reading, Science\. About 3 hours\./);
  assert.match(confirmed.html, /One 10-minute break, right after Math\./);
  assert.match(confirmed.html, /A graphing calculator is built in for Math\./);
  assert.match(confirmed.html, /If your wifi drops, keep going\. Your answers save and sync\./);
  assert.match(confirmed.html, />Add to calendar</);
  assert.match(confirmed.html, /Scores out Sun, Dec 6 at 2 PM PT/);
  assert.match(confirmed.html, /\$2 · non-refundable/);

  const tomorrow = byType.tomorrow_reminder;
  assert.equal(tomorrow.subject, "Tomorrow's the day");
  assert.match(tomorrow.html, /Your ACED Mock Test opens at midnight tonight, your time\. Start whenever you're ready on Saturday, as long as it's by 9 PM\./);
  assert.match(tomorrow.html, /WHAT TO HAVE READY/);
  assert.match(tomorrow.html, /A laptop or computer, charged/);
  assert.match(tomorrow.html, /A quiet spot for about 3 hours/);
  assert.match(tomorrow.html, /Scratch paper and a pencil/);
  assert.match(tomorrow.html, /Water and a snack for your break/);
  assert.match(tomorrow.html, /Once you start, the timer runs just like the real ACT\. You can't pause, except for the break after Math\./);
  assert.match(tomorrow.html, />Open mock test</);
  assert.match(tomorrow.html, /Good luck\. You've got this ✦/);

  const invite = byType.waitlist_invite;
  assert.equal(invite.subject, "A seat opened up for you");
  assert.match(invite.html, /Someone gave up their seat for the ACED Mock Test, and you're next on the waitlist\. It's yours if you grab it in time\./);
  assert.match(invite.html, /HOLDING IT UNTIL/);
  assert.match(invite.html, /Sun, Nov 22 · 4:15 PM/);
  assert.match(invite.html, /your time \(Pacific\)/);
  assert.match(invite.html, /Claiming takes about a minute: sign in with Google, pick your time zone, and pay \$2\./);
  assert.match(invite.html, />Claim my seat</);
  assert.match(invite.html, /After that, the seat goes to the next person on the waitlist\./);

  const waitlist = byType.waitlist_joined;
  assert.equal(waitlist.subject, "You're on the waitlist");
  assert.match(waitlist.html, /The ACED Mock Test is full right now, but seats do open up\. You're saved on the waitlist\./);
  assert.match(waitlist.html, /HOW THE WAITLIST WORKS/);
  assert.match(waitlist.html, /If a seat opens, we'll email you right away\./);
  assert.match(waitlist.html, /You'll have 48 hours to claim it\./);
  assert.match(waitlist.html, /Nothing to do until then\./);
  assert.match(waitlist.html, />Practice while you wait</);
  assert.match(waitlist.html, /Every question you practice brightens your star map\./);

  const refund = byType.payment_refunded;
  assert.equal(refund.subject, "Your $2 is on its way back");
  assert.match(refund.html, /The test filled up before your payment went through, so we refunded your \$2\. Sorry about that!/);
  assert.match(refund.html, /YOU'RE FIRST IN LINE/);
  assert.match(refund.html, /We moved you to the top of the waitlist\. If a seat opens, it goes to you before anyone else, and we'll email you right away\./);
  assert.match(refund.html, /Refunds take 5 to 10 days to show up on your card or bank statement\./);
  assert.match(refund.html, />Practice while you wait</);

  const scores = byType.scores_released;
  assert.equal(scores.subject, "Your scores are in ✦");
  assert.match(scores.html, /Your ACED Mock Test results are ready\. Here's what's waiting for you:/);
  assert.match(scores.html, /English/);
  assert.match(scores.html, /Math/);
  assert.match(scores.html, /Reading/);
  assert.match(scores.html, /Science/);
  assert.match(scores.html, /Your score for each section/);
  assert.match(scores.html, /Your composite score, out of 36/);
  assert.match(scores.html, /How you did compared to everyone who took it/);
  assert.match(scores.html, /The topics to work on before the real ACT/);
  assert.match(scores.html, />See my scores</);
  assert.match(scores.html, /The real ACT is Saturday, Dec 12\. One week to go ✦/);
  assert.doesNotMatch(scores.html, /composite score[^<]*:\s*\d|percentile[^<]*:\s*\d/i);

  for (const message of messages) {
    assert.match(message.html, new RegExp(MOCK_EMAIL_HEADER_TOKEN));
    assert.match(message.html, /width="600" height="200" alt="Aced"/);
    assert.match(message.html, /max-width:600px/);
    assert.match(message.html, /meta name="color-scheme" content="light dark"/);
    assert.match(message.html, /prefers-color-scheme: dark/);
    assert.match(message.html, /font-family:-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif/);
    assert.ok(message.previewText.length > 0);
    assert.ok(message.text.length > 40);
    assert.doesNotMatch(message.html, /100 seats|of 100|seat cap/i);
    assert.doesNotMatch(message.text, /100 seats|of 100|seat cap/i);
  }

  for (const type of ["registration_confirmed", "tomorrow_reminder", "waitlist_joined", "scores_released"]) {
    assert.match(byType[type].html, /<td width="20"[^>]*>●/);
  }

  assert.equal(confirmed.attachments.length, 1);
  assert.match(confirmed.attachments[0]?.content ?? "", /BEGIN:VCALENDAR/);
  assert.match(confirmed.attachments[0]?.content ?? "", /TZID=America\/Los_Angeles/);
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

test("GIF generator uses the real DM Serif logo treatment and requested animation", () => {
  const generator = readFileSync(
    new URL("./generate-email-headers.mjs", import.meta.url),
    "utf8"
  );
  assert.match(generator, /DMSerifDisplay-Regular\.ttf/);
  assert.match(generator, /fontSize \* \(0\.5 \/ 28\)/);
  assert.match(generator, /#F4F6FA/);
  assert.match(generator, /#5DCAA5/);
  assert.match(generator, /ctx\.arc\(dotX, dotY, dotRadius/);
  assert.match(generator, /const FRAME_COUNT = 40/);
  assert.match(generator, /const FPS = 10/);
  assert.match(generator, /durationFrames = 6/);
  assert.match(generator, /drawFourPoint/);
  assert.match(generator, /bayer4/);
});

test("all six GIF headers are 1200x400, 40 frames at 10 fps, and under 400 KB", () => {
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
    assert.ok(statSync(url).size < 400 * 1024, `${file} must stay under 400 KB`);
    const reader = new GifReader(data);
    assert.equal(reader.numFrames(), 40, `${file} must contain 40 frames`);
    assert.equal(reader.frameInfo(0).delay, 10, `${file} must run at 10 fps`);
  }
});
