import { getAuthSession } from "@/lib/auth";
import { sanitizeInternalCallbackUrl } from "@/lib/safe-callback";
import { getMockTestAuthMode } from "@/lib/mockTest/mode";

export { MOCK_TEST_STUDENTS, type MockTestStudentEmail } from "@/lib/mockTest/testStudents";

export function sanitizeMockTestReturnTo(value: string | null | undefined) {
  return sanitizeInternalCallbackUrl(value, "/mock-test/signup");
}

export async function getMockTestUser() {
  const session = await getAuthSession();
  if (!session?.user?.id || !session.user.email) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
  };
}

export function signInUrl(returnTo = "/mock-test/signup") {
  const safeReturnTo = sanitizeMockTestReturnTo(returnTo);
  const mode = getMockTestAuthMode();

  if (mode === "google") {
    return `/mock-test/auth/signin?returnTo=${encodeURIComponent(safeReturnTo)}`;
  }

  if (mode === "test") {
    return `/mock-test/dev/login?returnTo=${encodeURIComponent(safeReturnTo)}`;
  }

  return "/mock-test/signup";
}

export function signOutUrl(returnTo = "/mock-test") {
  const safeReturnTo = sanitizeInternalCallbackUrl(returnTo, "/mock-test");
  const mode = getMockTestAuthMode();

  if (mode === "google") {
    return `/mock-test/auth/signout?returnTo=${encodeURIComponent(safeReturnTo)}`;
  }

  if (mode === "test") {
    return `/mock-test/dev/logout?returnTo=${encodeURIComponent(safeReturnTo)}`;
  }

  return "/mock-test";
}
