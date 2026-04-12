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
  { value: "not-scheduled", label: "Not scheduled yet" },
  { value: "just-exploring", label: "I'm just exploring" },
] as const;

export const ONBOARDING_TEST_DATE_OPTIONS = [
  ...ACT_TEST_DATE_OPTIONS,
  ...ONBOARDING_EXTRA_TEST_DATE_OPTIONS,
] as const;

export const ONBOARDING_GRADE_OPTIONS = [
  { value: "8", label: "8th grade" },
  { value: "9", label: "9th grade" },
  { value: "10", label: "10th grade" },
  { value: "11", label: "11th grade" },
  { value: "12", label: "12th grade" },
  { value: "graduated", label: "Graduated" },
] as const;

export type OnboardingGrade = (typeof ONBOARDING_GRADE_OPTIONS)[number]["value"];
export type OnboardingTestDateValue = (typeof ONBOARDING_TEST_DATE_OPTIONS)[number]["value"];

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
  testDateOptions: typeof ONBOARDING_TEST_DATE_OPTIONS;
  actDatesSourceUrl: string;
};

export function isValidOnboardingGrade(value: string | null | undefined): value is OnboardingGrade {
  return ONBOARDING_GRADE_OPTIONS.some((option) => option.value === value);
}

export function isValidOnboardingTestDate(
  value: string | null | undefined
): value is OnboardingTestDateValue {
  return ONBOARDING_TEST_DATE_OPTIONS.some((option) => option.value === value);
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
      isValidOnboardingTestDate(profile.actTestDate) &&
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
