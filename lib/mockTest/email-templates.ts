import {
  formatMockEmailTime,
  formatScoreReleaseForZone,
  makeMockTestCalendarIcs,
  MOCK_EMAIL_SUPPORT,
} from "./email-policy.ts";

export type MockEmailType =
  | "registration_confirmed"
  | "tomorrow_reminder"
  | "waitlist_invite"
  | "waitlist_joined"
  | "payment_refunded"
  | "scores_released";

export type RenderedMockEmail = {
  type: MockEmailType;
  subject: string;
  html: string;
  text: string;
  attachments: Array<{ filename: string; content: string; contentType?: string }>;
};

const BG = "#070B14";
const CARD = "#0F1726";
const TEXT = "#F4F7FB";
const MUTED = "#AAB5C6";
const TEAL = "#5DCAA5";

function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[char] ?? char);
}

function layout(input: { title: string; bodyHtml: string; buttonLabel?: string; buttonUrl?: string }) {
  const button = input.buttonLabel && input.buttonUrl
    ? `<p style="margin:28px 0"><a href="${escapeHtml(input.buttonUrl)}" style="display:inline-block;background:${TEAL};color:#07110D;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">${escapeHtml(input.buttonLabel)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:${TEXT}"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG};width:100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:${CARD};border:1px solid #243046;border-radius:16px"><tr><td style="padding:28px"><div style="font-family:Georgia,serif;font-size:28px;color:${TEAL};margin-bottom:22px">Aced ✦</div><h1 style="font-family:Georgia,serif;font-size:27px;line-height:1.2;margin:0 0 18px;color:${TEXT}">${escapeHtml(input.title)}</h1><div style="font-size:16px;line-height:1.65;color:${TEXT}">${input.bodyHtml}</div>${button}<div style="border-top:1px solid #283348;margin-top:30px;padding-top:18px;font-size:12px;line-height:1.6;color:${MUTED}">You're getting this because you signed up for the ACED Mock Test on Aced.<br>Questions? Contact ${escapeHtml(MOCK_EMAIL_SUPPORT)}.</div></td></tr></table></td></tr></table></body></html>`;
}

function baseText(body: string) {
  return `${body}\n\nYou're getting this because you signed up for the ACED Mock Test on Aced.\nQuestions? Contact ${MOCK_EMAIL_SUPPORT}.`;
}

function keyDetails(timeZone: string) {
  const scoreTime = formatScoreReleaseForZone(timeZone);
  return {
    html: `<p><strong>Saturday, December 5</strong><br>Open 12:00 AM–11:59 PM in your time zone. You must start by 9:00 PM.</p><p>Plan for about <strong>2 hours 45 minutes</strong> plus one 10-minute break. All four sections are completed in one sitting.</p><p><strong>Quick tips:</strong> use a laptop if you can, find a quiet spot, and remember the calculator is built in.</p><p>Your $2 registration is non-refundable. Scores come out Sunday, December 6 at 2 PM PT — <strong>${escapeHtml(scoreTime)}</strong> for you.</p>`,
    text: `Saturday, December 5\nOpen 12:00 AM–11:59 PM in your time zone. You must start by 9:00 PM.\n\nPlan for about 2 hours 45 minutes plus one 10-minute break. Complete all four sections in one sitting.\n\nTips: laptop recommended, find a quiet spot, and the calculator is built in.\n\nYour $2 registration is non-refundable. Scores come out Sunday, December 6 at 2 PM PT — ${scoreTime} for you.`,
  };
}

export function renderRegistrationConfirmed(input: { timeZone: string; mockTestUrl: string }): RenderedMockEmail {
  const details = keyDetails(input.timeZone);
  return {
    type: "registration_confirmed",
    subject: "You're in ✦",
    html: layout({ title: "You're in ✦", bodyHtml: `<p>Your spot for the ACED Mock Test is confirmed.</p>${details.html}`, buttonLabel: "Open mock test", buttonUrl: input.mockTestUrl }),
    text: baseText(`You're in ✦\n\nYour spot for the ACED Mock Test is confirmed.\n\n${details.text}\n\nOpen mock test: ${input.mockTestUrl}`),
    attachments: [{ filename: "aced-mock-test-dec-5.ics", content: makeMockTestCalendarIcs(input.timeZone), contentType: "text/calendar; charset=utf-8" }],
  };
}

export function renderTomorrowReminder(input: { timeZone: string; mockTestUrl: string }): RenderedMockEmail {
  const details = keyDetails(input.timeZone);
  return {
    type: "tomorrow_reminder",
    subject: "Tomorrow's the day",
    html: layout({ title: "Tomorrow's the day", bodyHtml: `<p>Your ACED Mock Test is tomorrow. Here’s the quick version:</p>${details.html}`, buttonLabel: "Open mock test", buttonUrl: input.mockTestUrl }),
    text: baseText(`Tomorrow's the day\n\nYour ACED Mock Test is tomorrow.\n\n${details.text}\n\nOpen mock test: ${input.mockTestUrl}`),
    attachments: [],
  };
}

export function renderWaitlistInvite(input: { inviteUrl: string; expiresAt: Date; timeZone: string }): RenderedMockEmail {
  const expiry = formatMockEmailTime(input.expiresAt, input.timeZone);
  return {
    type: "waitlist_invite",
    subject: "A spot opened for you",
    html: layout({ title: "A spot opened for you", bodyHtml: `<p>A spot opened for the ACED Mock Test. Your invite is saved for 48 hours, until <strong>${escapeHtml(expiry)}</strong>.</p><p>Use the link below before it expires.</p>`, buttonLabel: "Claim your spot", buttonUrl: input.inviteUrl }),
    text: baseText(`A spot opened for you\n\nA spot opened for the ACED Mock Test. Your invite is saved for 48 hours, until ${expiry}.\n\nClaim your spot: ${input.inviteUrl}`),
    attachments: [],
  };
}

export function renderWaitlistJoined(): RenderedMockEmail {
  return {
    type: "waitlist_joined",
    subject: "You're on the waitlist",
    html: layout({ title: "You're on the waitlist", bodyHtml: `<p>You’re on the ACED Mock Test waitlist. If a spot opens, we’ll email you with a link that stays active for 48 hours.</p><p>No need to keep refreshing the page.</p>` }),
    text: baseText(`You're on the waitlist\n\nYou're on the ACED Mock Test waitlist. If a spot opens, we'll email you with a link that stays active for 48 hours. No need to keep refreshing the page.`),
    attachments: [],
  };
}

export function renderPaymentRefunded(): RenderedMockEmail {
  return {
    type: "payment_refunded",
    subject: "Your payment was refunded",
    html: layout({ title: "Your payment was refunded", bodyHtml: `<p>Your seat hold expired just before your payment finished, and the test had filled up. We automatically refunded your $2 payment.</p><p>You’re now at the <strong>front of the waitlist</strong>. If another spot opens, we’ll email you.</p>` }),
    text: baseText(`Your payment was refunded\n\nYour seat hold expired just before your payment finished, and the test had filled up. We automatically refunded your $2 payment.\n\nYou're now at the front of the waitlist. If another spot opens, we'll email you.`),
    attachments: [],
  };
}

export function renderScoresReleased(input: { resultsUrl: string }): RenderedMockEmail {
  return {
    type: "scores_released",
    subject: "Your scores are out ✦",
    html: layout({ title: "Your scores are out ✦", bodyHtml: `<p>Your ACED Mock Test results are ready.</p><p>We kept the score out of this email so you can see the full reveal on Aced.</p>`, buttonLabel: "See my results", buttonUrl: input.resultsUrl }),
    text: baseText(`Your scores are out ✦\n\nYour ACED Mock Test results are ready. We kept the score out of this email so you can see the full reveal on Aced.\n\nSee my results: ${input.resultsUrl}`),
    attachments: [],
  };
}

export function renderEveryMockEmailForTest(input: { timeZone: string; baseUrl: string }) {
  return [
    renderRegistrationConfirmed({ timeZone: input.timeZone, mockTestUrl: `${input.baseUrl}/mock-test` }),
    renderTomorrowReminder({ timeZone: input.timeZone, mockTestUrl: `${input.baseUrl}/mock-test` }),
    renderWaitlistInvite({ inviteUrl: `${input.baseUrl}/mock-test/signup?invite=test-token`, expiresAt: new Date("2026-12-03T20:00:00Z"), timeZone: input.timeZone }),
    renderWaitlistJoined(),
    renderPaymentRefunded(),
    renderScoresReleased({ resultsUrl: `${input.baseUrl}/mock-test/results` }),
  ];
}
