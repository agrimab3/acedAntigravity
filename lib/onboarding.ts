export const ACT_TEST_DATES_SOURCE_URL =
  "https://www.act.org/content/act/en/products-and-services/the-act/registration/test-dates.html";

export const ACT_TEST_DATE_OPTIONS = [
  { value: "2026-04-11", label: "April 11, 2026" },
  { value: "2026-06-13", label: "June 13, 2026" },
  { value: "2026-07-11", label: "July 11, 2026" },
  { value: "2026-09-19", label: "September 19, 2026" },
  { value: "2026-10-17", label: "October 17, 2026" },
  { value: "2026-12-12", label: "December 12, 2026" },
  { value: "2027-02-27", label: "February 27, 2027" },
  { value: "2027-04-10", label: "April 10, 2027" },
  { value: "2027-06-12", label: "June 12, 2027" },
  { value: "2027-07-10", label: "July 10, 2027" },
] as const;

export const ONBOARDING_EXTRA_TEST_DATE_OPTIONS = [
  { value: "not-scheduled", label: "I'm not sure yet" },
] as const;

const LEGACY_ONBOARDING_TEST_DATE_VALUES = new Set(["just-exploring"]);

export type OnboardingTestDateOption = {
  value: string;
  label: string;
};

function toCalendarDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getUpcomingActTestDateOptions(now = new Date()): OnboardingTestDateOption[] {
  const today = toCalendarDate(now);

  return ACT_TEST_DATE_OPTIONS.filter((option) => option.value >= today);
}

export function getOnboardingTestDateOptions(now = new Date()): OnboardingTestDateOption[] {
  return [...getUpcomingActTestDateOptions(now), ...ONBOARDING_EXTRA_TEST_DATE_OPTIONS];
}

export const ONBOARDING_GRADE_OPTIONS = [
  { value: "8", label: "8th grade" },
  { value: "9", label: "9th grade" },
  { value: "10", label: "10th grade" },
  { value: "11", label: "11th grade" },
  { value: "12", label: "12th grade" },
  { value: "graduated", label: "Graduated" },
] as const;

export type OnboardingGrade = (typeof ONBOARDING_GRADE_OPTIONS)[number]["value"];
export type OnboardingTestDateValue = string;

export type OnboardingProfile = {
  email: string;
  googleName: string | null;
  preferredName: string | null;
  gradeLevel: string | null;
  actTestDate: string | null;
  previousActScore: number | null;
  hasRecommendations: boolean | null;
  onboardingCompletedAt: string | null;
  walkthroughCompletedAt: string | null;
};

export type OnboardingApiResponse = {
  isComplete: boolean;
  profile: OnboardingProfile;
  gradeOptions: typeof ONBOARDING_GRADE_OPTIONS;
  testDateOptions: OnboardingTestDateOption[];
  actDatesSourceUrl: string;
};

export function isValidOnboardingGrade(value: string | null | undefined): value is OnboardingGrade {
  return ONBOARDING_GRADE_OPTIONS.some((option) => option.value === value);
}

export function isValidOnboardingTestDate(
  value: string | null | undefined,
  now = new Date()
): value is OnboardingTestDateValue {
  return getOnboardingTestDateOptions(now).some((option) => option.value === value);
}

function isKnownOnboardingTestDate(value: string | null | undefined) {
  return (
    ACT_TEST_DATE_OPTIONS.some((option) => option.value === value) ||
    ONBOARDING_EXTRA_TEST_DATE_OPTIONS.some((option) => option.value === value) ||
    (typeof value === "string" && LEGACY_ONBOARDING_TEST_DATE_VALUES.has(value))
  );
}

export function isOnboardingComplete(profile: {
  preferredName?: string | null;
  gradeLevel?: string | null;
  actTestDate?: string | null;
  hasRecommendations?: boolean | null;
}) {
  return Boolean(
    profile.preferredName?.trim() &&
      isValidOnboardingGrade(profile.gradeLevel) &&
      isKnownOnboardingTestDate(profile.actTestDate) &&
      typeof profile.hasRecommendations === "boolean"
  );
}

export function getDisplayFirstName(profile: {
  preferredName?: string | null;
  googleName?: string | null;
}) {
  const preferredName = profile.preferredName?.trim();
  if (preferredName) {
    return preferredName;
  }

  const googleName = profile.googleName?.trim();
  if (!googleName) {
    return "there";
  }

  return googleName.split(/\s+/)[0] ?? "there";
}
