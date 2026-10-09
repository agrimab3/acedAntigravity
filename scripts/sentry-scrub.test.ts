import assert from "node:assert/strict";
import test from "node:test";
import { scrubSentryEvent } from "../lib/sentry-scrub.ts";

test("Sentry scrubbing removes email, name, IP, cookies, answers, and tutor chat", () => {
  const event = scrubSentryEvent({
    user: { id: "internal-123", email: "teen@example.com", name: "Teen Student", ip_address: "1.2.3.4" },
    request: {
      url: "https://aced.test/api/tutor?email=teen@example.com&token=secret",
      headers: { cookie: "session=abc", authorization: "Bearer secret", "x-forwarded-for": "1.2.3.4", accept: "json" },
      cookies: { session: "abc" },
      data: { selectedAnswer: "B", message: "my tutor chat" },
      query_string: "email=teen@example.com",
    },
    extra: { email: "teen@example.com", studentName: "Teen Student", selectedAnswer: "B", tutorChat: "hello" },
  });
  assert.deepEqual(event.user, { id: "internal-123" });
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(serialized, /teen@example\.com|Teen Student|1\.2\.3\.4|session=abc|Bearer secret|my tutor chat|"B"/);
  assert.match(serialized, /internal-123/);
});
