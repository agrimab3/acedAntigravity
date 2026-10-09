import * as Sentry from "@sentry/nextjs";

export type AcedErrorArea =
  | "stripe-webhook"
  | "mock-answer-save"
  | "mock-section-submit"
  | "score-release"
  | "email-outbox"
  | "google-sign-in";

export function captureAcedError(error: unknown, area: AcedErrorArea, userId?: string | null) {
  try {
    Sentry.withScope((scope) => {
      scope.setTag("aced.area", area);
      if (userId) scope.setUser({ id: userId });
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  } catch {
    // Monitoring must never break the student-facing path.
  }
}
