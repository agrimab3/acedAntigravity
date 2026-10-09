import {
  getFriendlyMockTimeZoneName,
  makeMockTestCalendarIcs,
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
  previewText: string;
  html: string;
  text: string;
  attachments: Array<{ filename: string; content: string; contentType?: string }>;
};

export const MOCK_EMAIL_HEADER_TOKEN = "__ACED_EMAIL_HEADER__";

const TEAL = "#5DCAA5";
const VIOLET = "#8C84DE";
const AMBER = "#EF9F27";
const CORAL = "#E2785A";
const SCIENCE = "#F0997B";

function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[char] ?? char);
}

function previewHtml(text: string) {
  return `<div style="display:none!important;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:transparent;line-height:1px;font-size:1px">${escapeHtml(text)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>`;
}

function bulletproofButton(input: {
  label: string;
  url: string;
  outlined?: boolean;
}) {
  const bg = input.outlined ? "#FFFFFF" : TEAL;
  const border = input.outlined ? "#CDD3DD" : TEAL;
  const color = input.outlined ? "#121826" : "#0A1F18";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:24px 0 0"><tr><td align="center" bgcolor="${bg}" style="border:1px solid ${border};border-radius:999px;background:${bg}"><a href="${escapeHtml(input.url)}" style="display:block;width:100%;box-sizing:border-box;padding:15px 20px;border-radius:999px;color:${color};font-family:-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:20px;text-align:center;text-decoration:none">${escapeHtml(input.label)}</a></td></tr></table>`;
}

function capsLabel(label: string, color: string) {
  return `<div style="margin-top:22px;color:${color};font-size:12px;line-height:16px;font-weight:800;letter-spacing:1.2px">${escapeHtml(label)}</div>`;
}

function bulletList(items: Array<{ color: string; text: string }>, insideCard = false) {
  const rows = items
    .map(
      (item) =>
        `<tr><td width="20" valign="top" style="padding:${insideCard ? "5px" : "6px"} 0;color:${item.color};font-size:12px;line-height:22px">●</td><td class="aced-card-copy" style="padding:${insideCard ? "3px" : "4px"} 0;color:#4A5466;font-size:${insideCard ? "15px" : "15px"};line-height:22px">${escapeHtml(item.text)}</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:${insideCard ? "8px" : "8px"}">${rows}</table>`;
}

function smallParagraph(text: string) {
  return `<p class="aced-extra" style="margin:18px 0 0;color:#4A5466;font-size:15px;line-height:22px">${escapeHtml(text)}</p>`;
}

function layout(input: {
  headline: string;
  accent: string;
  sentence: string;
  previewText: string;
  beforeCardHtml?: string;
  cardHtml?: string;
  afterCardHtml?: string;
  button?: { label: string; url: string; outlined?: boolean };
  smallLine?: string;
  footerFirst: string;
}) {
  const button = input.button ? bulletproofButton(input.button) : "";
  const smallLine = input.smallLine
    ? `<div class="aced-small" style="margin-top:14px;color:#8A93A3;font-size:13px;line-height:19px;text-align:center">${input.smallLine}</div>`
    : "";
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
@media (prefers-color-scheme: dark) {
  .aced-shell { background:#1E1F23 !important; }
  .aced-body { background:#1E1F23 !important; }
  .aced-headline { color:#F2F4F8 !important; }
  .aced-copy, .aced-extra { color:#C5CBD6 !important; }
  .aced-card { background:#2A2C33 !important; border-color:#3A3D46 !important; }
  .aced-card-main, .aced-card-copy { color:#F2F4F8 !important; }
  .aced-footer, .aced-small { color:#8D93A0 !important; }
  .aced-outline-button { background:#FFFFFF !important; }
}
</style>
</head>
<body class="aced-shell" style="margin:0;padding:0;background:#F3F5F8;font-family:-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
${previewHtml(input.previewText)}
<table class="aced-shell" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#F3F5F8"><tr><td align="center" style="padding:0 0 24px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background:#FFFFFF">
<tr><td bgcolor="#0F1838" style="background:#0F1838;line-height:0;font-size:0"><img src="${MOCK_EMAIL_HEADER_TOKEN}" width="600" height="200" alt="Aced" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;background:#0F1838"></td></tr>
<tr><td class="aced-body" style="padding:28px 24px 26px;background:#FFFFFF">
<h1 class="aced-headline" style="margin:0;color:#121826;font-size:28px;line-height:34px;font-weight:800;letter-spacing:-0.4px">${escapeHtml(input.headline.replace(/ ✦$/, ""))} <span style="color:${input.accent}">✦</span></h1>
<p class="aced-copy" style="margin:10px 0 0;color:#4A5466;font-size:16px;line-height:24px">${escapeHtml(input.sentence)}</p>
${input.beforeCardHtml ?? ""}${input.cardHtml ?? ""}${input.afterCardHtml ?? ""}${button}${smallLine}
</td></tr>
<tr><td class="aced-body" style="padding:0 24px 24px;background:#FFFFFF"><div style="border-top:1px solid #E3E6EB;padding-top:18px"><p class="aced-footer" style="margin:0;color:#9AA2B1;font-size:12px;line-height:18px;text-align:center">${escapeHtml(input.footerFirst)}<br>Questions? Just reply to this email.</p></div></td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function baseText(input: { body: string; footerFirst: string }) {
  return `${input.body}\n\n${input.footerFirst}\nQuestions? Just reply to this email.`;
}

export function renderRegistrationConfirmed(input: {
  timeZone: string;
  calendarUrl: string;
}): RenderedMockEmail {
  const zone = getFriendlyMockTimeZoneName(input.timeZone);
  const card = `<div class="aced-card" style="margin-top:22px;padding:18px;border:1px solid #B8E8D7;border-radius:16px;background:#F2FBF7"><div style="color:#28785F;font-size:12px;line-height:16px;font-weight:800;letter-spacing:1.2px">SATURDAY</div><div class="aced-card-main" style="margin-top:4px;color:#121826;font-size:24px;line-height:30px;font-weight:800">December 5</div><div class="aced-card-copy" style="margin-top:8px;color:#4A5466;font-size:14px;line-height:21px">Open all day in your time zone (${escapeHtml(zone)})<br>Start any time, as long as it's by 9 PM</div></div>`;
  const howItWorks = `${capsLabel("HOW IT WORKS", "#28785F")}${bulletList([
    { color: TEAL, text: "All 4 sections in one sitting: English, Math, Reading, Science. About 3 hours." },
    { color: VIOLET, text: "One 10-minute break, right after Math." },
    { color: AMBER, text: "A graphing calculator is built in for Math." },
    { color: CORAL, text: "If your wifi drops, keep going. Your answers save and sync." },
  ])}`;
  return {
    type: "registration_confirmed",
    subject: "You're in ✦",
    previewText: "Your ACED Mock Test seat is saved for Saturday, December 5.",
    html: layout({
      headline: "You're in ✦",
      accent: TEAL,
      sentence: "Your seat for the ACED Mock Test is saved. Here's everything you need for test day.",
      cardHtml: card,
      afterCardHtml: howItWorks,
      button: { label: "Add to calendar", url: input.calendarUrl },
      smallLine: `Scores out Sun, Dec 6 at 2 PM PT<br>$2 · non-refundable`,
      footerFirst: "You signed up for the ACED Mock Test on Aced.",
      previewText: "Your ACED Mock Test seat is saved for Saturday, December 5.",
    }),
    text: baseText({
      body: `You're in ✦\n\nYour seat for the ACED Mock Test is saved. Here's everything you need for test day.\n\nSATURDAY\nDecember 5\nOpen all day in your time zone (${zone})\nStart any time, as long as it's by 9 PM\n\nHOW IT WORKS\n● All 4 sections in one sitting: English, Math, Reading, Science. About 3 hours.\n● One 10-minute break, right after Math.\n● A graphing calculator is built in for Math.\n● If your wifi drops, keep going. Your answers save and sync.\n\nAdd to calendar: ${input.calendarUrl}\n\nScores out Sun, Dec 6 at 2 PM PT\n$2 · non-refundable`,
      footerFirst: "You signed up for the ACED Mock Test on Aced.",
    }),
    attachments: [{
      filename: "aced-mock-test-dec-5.ics",
      content: makeMockTestCalendarIcs(input.timeZone),
      contentType: "text/calendar; charset=utf-8",
    }],
  };
}

export function renderTomorrowReminder(input: { mockTestUrl: string }): RenderedMockEmail {
  const card = `<div class="aced-card" style="margin-top:22px;padding:18px;border:1px solid #F4D5A0;border-radius:16px;background:#FFF9EF"><div style="color:#9B6515;font-size:12px;line-height:16px;font-weight:800;letter-spacing:1.2px">WHAT TO HAVE READY</div>${bulletList([
    { color: AMBER, text: "A laptop or computer, charged" },
    { color: AMBER, text: "A quiet spot for about 3 hours" },
    { color: AMBER, text: "Scratch paper and a pencil" },
    { color: AMBER, text: "Water and a snack for your break" },
  ], true)}</div>`;
  return {
    type: "tomorrow_reminder",
    subject: "Tomorrow's the day",
    previewText: "Your ACED Mock Test opens at midnight tonight, your time.",
    html: layout({
      headline: "Tomorrow's the day ✦",
      accent: AMBER,
      sentence: "Your ACED Mock Test opens at midnight tonight, your time. Start whenever you're ready on Saturday, as long as it's by 9 PM.",
      cardHtml: card,
      afterCardHtml: smallParagraph("Once you start, the timer runs just like the real ACT. You can't pause, except for the break after Math."),
      button: { label: "Open mock test", url: input.mockTestUrl },
      smallLine: "Good luck. You've got this ✦",
      footerFirst: "You signed up for the ACED Mock Test on Aced.",
      previewText: "Your ACED Mock Test opens at midnight tonight, your time.",
    }),
    text: baseText({
      body: `Tomorrow's the day ✦\n\nYour ACED Mock Test opens at midnight tonight, your time. Start whenever you're ready on Saturday, as long as it's by 9 PM.\n\nWHAT TO HAVE READY\n● A laptop or computer, charged\n● A quiet spot for about 3 hours\n● Scratch paper and a pencil\n● Water and a snack for your break\n\nOnce you start, the timer runs just like the real ACT. You can't pause, except for the break after Math.\n\nOpen mock test: ${input.mockTestUrl}\n\nGood luck. You've got this ✦`,
      footerFirst: "You signed up for the ACED Mock Test on Aced.",
    }),
    attachments: [],
  };
}

export function renderWaitlistInvite(input: {
  inviteUrl: string;
  expiresAt: Date;
  timeZone: string;
}): RenderedMockEmail {
  const zone = getFriendlyMockTimeZoneName(input.timeZone);
  const expiry = new Intl.DateTimeFormat("en-US", {
    timeZone: input.timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(input.expiresAt).replace(/,(?=[^,]+$)/, " ·");
  const card = `<div class="aced-card" style="margin-top:22px;padding:18px;border:1px solid #D7D3F2;border-radius:16px;background:#F7F6FD"><div style="color:#6259B7;font-size:12px;line-height:16px;font-weight:800;letter-spacing:1.2px">HOLDING IT UNTIL</div><div class="aced-card-main" style="margin-top:4px;color:#121826;font-size:22px;line-height:28px;font-weight:800">${escapeHtml(expiry)}</div><div class="aced-card-copy" style="margin-top:4px;color:#4A5466;font-size:14px;line-height:20px">your time (${escapeHtml(zone)})</div></div>`;
  return {
    type: "waitlist_invite",
    subject: "A seat opened up for you",
    previewText: "You're next on the waitlist — you have 48 hours to claim your seat.",
    html: layout({
      headline: "A seat opened up ✦",
      accent: VIOLET,
      sentence: "Someone gave up their seat for the ACED Mock Test, and you're next on the waitlist. It's yours if you grab it in time.",
      cardHtml: card,
      afterCardHtml: smallParagraph("Claiming takes about a minute: sign in with Google, pick your time zone, and pay $2."),
      button: { label: "Claim my seat", url: input.inviteUrl },
      smallLine: "After that, the seat goes to the next person on the waitlist.",
      footerFirst: "You joined the ACED Mock Test waitlist on Aced.",
      previewText: "You're next on the waitlist — you have 48 hours to claim your seat.",
    }),
    text: baseText({
      body: `A seat opened up ✦\n\nSomeone gave up their seat for the ACED Mock Test, and you're next on the waitlist. It's yours if you grab it in time.\n\nHOLDING IT UNTIL\n${expiry}\nyour time (${zone})\n\nClaiming takes about a minute: sign in with Google, pick your time zone, and pay $2.\n\nClaim my seat: ${input.inviteUrl}\n\nAfter that, the seat goes to the next person on the waitlist.`,
      footerFirst: "You joined the ACED Mock Test waitlist on Aced.",
    }),
    attachments: [],
  };
}

export function renderWaitlistJoined(input: { practiceUrl: string }): RenderedMockEmail {
  const card = `<div class="aced-card" style="margin-top:22px;padding:18px;border:1px solid #D7D3F2;border-radius:16px;background:#F7F6FD"><div style="color:#6259B7;font-size:12px;line-height:16px;font-weight:800;letter-spacing:1.2px">HOW THE WAITLIST WORKS</div>${bulletList([
    { color: VIOLET, text: "If a seat opens, we'll email you right away." },
    { color: VIOLET, text: "You'll have 48 hours to claim it." },
    { color: VIOLET, text: "Nothing to do until then." },
  ], true)}</div>`;
  return {
    type: "waitlist_joined",
    subject: "You're on the waitlist",
    previewText: "You're saved on the ACED Mock Test waitlist.",
    html: layout({
      headline: "You're on the list ✦",
      accent: VIOLET,
      sentence: "The ACED Mock Test is full right now, but seats do open up. You're saved on the waitlist.",
      cardHtml: card,
      button: { label: "Practice while you wait", url: input.practiceUrl, outlined: true },
      smallLine: "Every question you practice brightens your star map.",
      footerFirst: "You joined the ACED Mock Test waitlist on Aced.",
      previewText: "You're saved on the ACED Mock Test waitlist.",
    }),
    text: baseText({
      body: `You're on the list ✦\n\nThe ACED Mock Test is full right now, but seats do open up. You're saved on the waitlist.\n\nHOW THE WAITLIST WORKS\n● If a seat opens, we'll email you right away.\n● You'll have 48 hours to claim it.\n● Nothing to do until then.\n\nPractice while you wait: ${input.practiceUrl}\n\nEvery question you practice brightens your star map.`,
      footerFirst: "You joined the ACED Mock Test waitlist on Aced.",
    }),
    attachments: [],
  };
}

export function renderPaymentRefunded(input: { practiceUrl: string }): RenderedMockEmail {
  const card = `<div class="aced-card" style="margin-top:22px;padding:18px;border:1px solid #F0C5B9;border-radius:16px;background:#FFF5F2"><div style="color:#A94B35;font-size:12px;line-height:16px;font-weight:800;letter-spacing:1.2px">YOU'RE FIRST IN LINE</div><div class="aced-card-copy" style="margin-top:6px;color:#4A5466;font-size:15px;line-height:22px">We moved you to the top of the waitlist. If a seat opens, it goes to you before anyone else, and we'll email you right away.</div></div>`;
  return {
    type: "payment_refunded",
    subject: "Your $2 is on its way back",
    previewText: "Your $2 refund is on the way, and you're first on the waitlist.",
    html: layout({
      headline: "Your $2 is on its way back ✦",
      accent: CORAL,
      sentence: "The test filled up before your payment went through, so we refunded your $2. Sorry about that!",
      cardHtml: card,
      afterCardHtml: smallParagraph("Refunds take 5 to 10 days to show up on your card or bank statement."),
      button: { label: "Practice while you wait", url: input.practiceUrl, outlined: true },
      footerFirst: "You tried to sign up for the ACED Mock Test on Aced.",
      previewText: "Your $2 refund is on the way, and you're first on the waitlist.",
    }),
    text: baseText({
      body: `Your $2 is on its way back ✦\n\nThe test filled up before your payment went through, so we refunded your $2. Sorry about that!\n\nYOU'RE FIRST IN LINE\nWe moved you to the top of the waitlist. If a seat opens, it goes to you before anyone else, and we'll email you right away.\n\nRefunds take 5 to 10 days to show up on your card or bank statement.\n\nPractice while you wait: ${input.practiceUrl}`,
      footerFirst: "You tried to sign up for the ACED Mock Test on Aced.",
    }),
    attachments: [],
  };
}

export function renderScoresReleased(input: { resultsUrl: string }): RenderedMockEmail {
  const star = (label: string, color: string) => `<td align="center" width="25%" style="padding:4px 2px"><div style="color:${color};font-size:19px;line-height:22px">✦</div><div class="aced-card-copy" style="margin-top:3px;color:#4A5466;font-size:12px;line-height:17px;font-weight:700">${label}</div></td>`;
  const card = `<div class="aced-card" style="margin-top:22px;padding:18px 10px;border:1px solid #DDE2E8;border-radius:16px;background:#F8FAFC"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${star("English", TEAL)}${star("Math", VIOLET)}${star("Reading", AMBER)}${star("Science", SCIENCE)}</tr></table></div>`;
  const details = bulletList([
    { color: TEAL, text: "Your score for each section" },
    { color: VIOLET, text: "Your composite score, out of 36" },
    { color: AMBER, text: "How you did compared to everyone who took it" },
    { color: CORAL, text: "The topics to work on before the real ACT" },
  ]);
  return {
    type: "scores_released",
    subject: "Your scores are in ✦",
    previewText: "Your ACED Mock Test results are ready.",
    html: layout({
      headline: "Your scores are in ✦",
      accent: TEAL,
      sentence: "Your ACED Mock Test results are ready. Here's what's waiting for you:",
      cardHtml: card,
      afterCardHtml: details,
      button: { label: "See my scores", url: input.resultsUrl },
      smallLine: "The real ACT is Saturday, Dec 12. One week to go ✦",
      footerFirst: "You took the ACED Mock Test on Aced.",
      previewText: "Your ACED Mock Test results are ready.",
    }),
    text: baseText({
      body: `Your scores are in ✦\n\nYour ACED Mock Test results are ready. Here's what's waiting for you:\n\n✦ English\n✦ Math\n✦ Reading\n✦ Science\n\n● Your score for each section\n● Your composite score, out of 36\n● How you did compared to everyone who took it\n● The topics to work on before the real ACT\n\nSee my scores: ${input.resultsUrl}\n\nThe real ACT is Saturday, Dec 12. One week to go ✦`,
      footerFirst: "You took the ACED Mock Test on Aced.",
    }),
    attachments: [],
  };
}

export function renderEveryMockEmailForTest(input: { timeZone: string; baseUrl: string }) {
  return [
    renderRegistrationConfirmed({
      timeZone: input.timeZone,
      calendarUrl: `${input.baseUrl}/api/mock-test/calendar?timeZone=${encodeURIComponent(input.timeZone)}`,
    }),
    renderTomorrowReminder({ mockTestUrl: `${input.baseUrl}/mock-test` }),
    renderWaitlistInvite({
      inviteUrl: `${input.baseUrl}/mock-test/signup?invite=test-token`,
      expiresAt: new Date("2026-11-23T00:15:00Z"),
      timeZone: input.timeZone,
    }),
    renderWaitlistJoined({ practiceUrl: `${input.baseUrl}/dashboard` }),
    renderPaymentRefunded({ practiceUrl: `${input.baseUrl}/dashboard` }),
    renderScoresReleased({ resultsUrl: `${input.baseUrl}/mock-test/results` }),
  ];
}
