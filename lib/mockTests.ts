export interface MockTestSection {
  key: "english" | "math" | "reading" | "science";
  title: string;
  constellation: string;
  color: string;
  questionCount: number;
  durationMinutes: number;
  description?: string;
}

export interface MockTestConfig {
  testDate: string;
  testDateLabel: string;
  testDateShort: string;
  actDateLabel: string;
  resultsLabel: string;
  resultsLongLabel: string;
  resultsReleaseUtc: string;
  startCutoffLabel: string;
  mockTestSlug: string;
  priceUsd: number;
  priceCents: number;
  seatLimitDefault: number;
  nextTestDateLabel: string;
  sections: MockTestSection[];
}

export interface MockTimeZone {
  value: string;
  label: string;
  shortLabel: "PT" | "MT" | "CT" | "ET" | "AKT" | "HT";
}

export const TIME_ZONES: readonly MockTimeZone[] = [
  { value: "America/Los_Angeles", label: "Pacific Time", shortLabel: "PT" },
  { value: "America/Denver", label: "Mountain Time", shortLabel: "MT" },
  { value: "America/Chicago", label: "Central Time", shortLabel: "CT" },
  { value: "America/New_York", label: "Eastern Time", shortLabel: "ET" },
  { value: "America/Anchorage", label: "Alaska Time", shortLabel: "AKT" },
  { value: "Pacific/Honolulu", label: "Hawaii Time", shortLabel: "HT" },
] as const;

export const MOCK_TEST: MockTestConfig = {
  testDate: "2026-12-05",
  testDateLabel: "Saturday, Dec 5",
  testDateShort: "Sat, Dec 5",
  actDateLabel: "Dec 12",
  resultsLabel: "Sun, 2 PM PT",
  resultsLongLabel: "Sunday, Dec 6 · 2 PM PT",
  resultsReleaseUtc: "2026-12-06T22:00:00Z",
  startCutoffLabel: "9 PM",
  mockTestSlug: "2026-12-05",
  priceUsd: 2,
  priceCents: 200,
  seatLimitDefault: 100,
  nextTestDateLabel: "Saturday, Feb 20",
  sections: [
    {
      key: "english",
      title: "English",
      constellation: "Gemini",
      color: "#5DCAA5",
      questionCount: 50,
      durationMinutes: 35,
      description: "Grammar, sentence structure, punctuation, rhetorical skills",
    },
    {
      key: "math",
      title: "Math",
      constellation: "Aquarius",
      color: "#AFA9EC",
      questionCount: 45,
      durationMinutes: 50,
      description: "Pre-algebra, elementary algebra, geometry, trigonometry",
    },
    {
      key: "reading",
      title: "Reading",
      constellation: "Virgo",
      color: "#EF9F27",
      questionCount: 36,
      durationMinutes: 40,
      description: "Literary narrative, social sciences, humanities, natural sciences",
    },
    {
      key: "science",
      title: "Science",
      constellation: "Sagittarius",
      color: "#F0997B",
      questionCount: 40,
      durationMinutes: 40,
      description: "Data representation, research summaries, conflicting viewpoints",
    },
  ],
};

export const NEXT_MOCK: MockTestConfig = MOCK_TEST;
export const MOCK_SECTIONS: MockTestSection[] = MOCK_TEST.sections;

export const MOCK_BREAK_SECONDS = {
  afterMath: 600,
} as const;

export const MOCK_TRANSITION_SECONDS = 5;
export const MOCK_SAVE_GRACE_SECONDS = 5;
export const MOCK_OFFLINE_SYNC_WINDOW_MINUTES = 15;

export const MOCK_CALCULATOR_SECTIONS = ["math"] as const;

export function mockSectionAllowsCalculator(sectionKey: MockTestSection["key"]) {
  return (MOCK_CALCULATOR_SECTIONS as readonly string[]).includes(sectionKey);
}

export function getMockBreakSecondsAfter(sectionKey: MockTestSection["key"]) {
  return sectionKey === "math" ? MOCK_BREAK_SECONDS.afterMath : null;
}

export function getMockTransitionSecondsAfter(sectionKey: MockTestSection["key"]) {
  return sectionKey === "english" || sectionKey === "reading"
    ? MOCK_TRANSITION_SECONDS
    : null;
}

export const TOTAL_QUESTIONS: number = MOCK_TEST.sections.reduce(
  (sum, section) => sum + section.questionCount,
  0
);

export const TOTAL_MINUTES: number = MOCK_TEST.sections.reduce(
  (sum, section) => sum + section.durationMinutes,
  0
);

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

export function getMockTimeZoneDisplay(timeZone: string) {
  const zone = TIME_ZONES.find((item) => item.value === timeZone) ?? TIME_ZONES[0];
  const release = new Date(NEXT_MOCK.resultsReleaseUtc);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone.value,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(release);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  const clock = minute === "00" ? `${hour} ${dayPeriod}` : `${hour}:${minute} ${dayPeriod}`;

  return {
    shortLabel: zone.shortLabel,
    localReleaseTime: `${clock} ${zone.shortLabel}`,
  };
}

export function isMockSignupClosedForZone(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const localDate = `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(
    get("day")
  ).padStart(2, "0")}`;

  if (localDate > NEXT_MOCK.testDate) return true;
  if (localDate < NEXT_MOCK.testDate) return false;

  const cutoffMatch = NEXT_MOCK.startCutoffLabel.match(/^(\d{1,2})\s*(AM|PM)$/i);
  const rawHour = Number(cutoffMatch?.[1] ?? "9");
  const period = (cutoffMatch?.[2] ?? "PM").toUpperCase();
  const cutoffHour =
    period === "PM" && rawHour !== 12 ? rawHour + 12 : period === "AM" && rawHour === 12 ? 0 : rawHour;

  const localSeconds = get("hour") * 3600 + get("minute") * 60 + get("second");
  return localSeconds > cutoffHour * 3600;
}
