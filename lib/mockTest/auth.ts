import { getAuthSession } from "@/lib/auth";

export { MOCK_TEST_STUDENTS, type MockTestStudentEmail } from "@/lib/mockTest/testStudents";

export function sanitizeMockTestReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/mock-test/signup";
  }

  return value;
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

  if (process.env.MOCK_TEST_AUTH_MODE === "google") {
    // TODO(mock-test-go-live): plug the production Google sign-in entry point in here.
    return `/?callbackUrl=${encodeURIComponent(safeReturnTo)}`;
  }

  return `/mock-test/dev/login?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

export function signOutUrl(returnTo = "/mock-test/signup") {
  const safeReturnTo = sanitizeMockTestReturnTo(returnTo);

  if (process.env.MOCK_TEST_AUTH_MODE === "google") {
    // TODO(mock-test-go-live): plug the production Google sign-out entry point in here.
    return `/mock-test/dev/logout?returnTo=${encodeURIComponent(safeReturnTo)}`;
  }

  return `/mock-test/dev/logout?returnTo=${encodeURIComponent(safeReturnTo)}`;
}
