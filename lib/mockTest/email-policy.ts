export const MOCK_EMAIL_FROM = process.env.EMAIL_FROM || "onboarding@resend.dev";
export const MOCK_EMAIL_SUPPORT = process.env.EMAIL_SUPPORT || "support@example.com";

export function resolveEmailDeliveryTarget(input: {
  realRecipient: string;
  subject: string;
  nodeEnv?: string;
  testRecipient?: string;
}) {
  if (input.nodeEnv === "production") {
    return { to: input.realRecipient, subject: input.subject };
  }
  if (!input.testRecipient) {
    throw new Error("EMAIL_TEST_TO is required outside production.");
  }
  return {
    to: input.testRecipient,
    subject: `[to: ${input.realRecipient}] ${input.subject}`,
  };
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function zonedLocalTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  second?: number;
  timeZone: string;
}) {
  const desiredUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute ?? 0,
    input.second ?? 0
  );
  let guess = new Date(desiredUtc);
  for (let i = 0; i < 3; i += 1) {
    const actual = zonedParts(guess, input.timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    guess = new Date(guess.getTime() + (desiredUtc - actualAsUtc));
  }
  return guess;
}

export function getMockReminderAt(timeZone: string) {
  return zonedLocalTimeToUtc({
    year: 2026,
    month: 12,
    day: 4,
    hour: 17,
    timeZone,
  });
}

export function formatMockEmailTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatScoreReleaseForZone(timeZone: string) {
  return formatMockEmailTime(new Date("2026-12-06T22:00:00Z"), timeZone);
}

export function makeMockTestCalendarIcs(timeZone: string) {
  const safeZone = timeZone.replace(/[^A-Za-z0-9_+\/-]/g, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aced//ACED Mock Test//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:aced-mock-test-2026-12-05@aced",
    "DTSTAMP:20261009T000000Z",
    `DTSTART;TZID=${safeZone}:20261205T000000`,
    `DTEND;TZID=${safeZone}:20261206T000000`,
    "SUMMARY:ACED Mock Test",
    "DESCRIPTION:Take all four ACT sections in one sitting. Must start by 9:00 PM local time.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export const MOCK_EMAIL_MAX_ATTEMPTS = 5;

export function shouldRetryMockEmail(attempts: number, sentAt: Date | null) {
  return sentAt === null && attempts < MOCK_EMAIL_MAX_ATTEMPTS;
}
