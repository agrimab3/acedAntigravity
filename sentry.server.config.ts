import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0.05,
  beforeSend(event) {
    return scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event;
  },
});
