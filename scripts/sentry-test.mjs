import * as Sentry from "@sentry/node";

if (!process.env.SENTRY_DSN) throw new Error("SENTRY_DSN is required.");
Sentry.init({ dsn: process.env.SENTRY_DSN, enabled: true, tracesSampleRate: 0 });
Sentry.captureException(new Error("Aced Sentry test"), {
  tags: { "aced.area": "sentry-test" },
});
const flushed = await Sentry.flush(5000);
if (!flushed) throw new Error("Sentry test event did not flush in time.");
console.log("Aced Sentry test sent successfully.");
