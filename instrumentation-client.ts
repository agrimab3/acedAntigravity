import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) && process.env.NEXT_PUBLIC_SENTRY_SERVER_ENABLED === "true",
  tracesSampleRate: 0.02,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend(event) {
    return scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
