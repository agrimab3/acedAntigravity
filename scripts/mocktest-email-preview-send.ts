import { eq } from "drizzle-orm";
import { mockTests } from "../db/schema.ts";
import { getDb } from "../lib/db.ts";
import {
  getMockEmailSiteBaseUrl,
  processMockEmailOutbox,
  queueMockEmail,
} from "../lib/mockTest/email-outbox.ts";
import { renderEveryMockEmailForTest } from "../lib/mockTest/email-templates.ts";
import { NEXT_MOCK } from "../lib/mockTests.ts";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to send preview emails in production.");
  }
  if (!process.env.EMAIL_TEST_TO) throw new Error("EMAIL_TEST_TO is required.");
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required.");

  const db = getDb();
  if (!db) throw new Error("Database is not configured.");
  const [mockTest] = await db
    .select({ id: mockTests.id })
    .from(mockTests)
    .where(eq(mockTests.slug, NEXT_MOCK.mockTestSlug))
    .limit(1);
  if (!mockTest) throw new Error("Mock test not found.");

  const now = new Date();
  const prefix = `preview:${now.toISOString()}`;
  const messages = renderEveryMockEmailForTest({
    timeZone: "America/Los_Angeles",
    baseUrl: getMockEmailSiteBaseUrl(),
  });

  for (const message of messages) {
    await queueMockEmail({
      mockTestId: mockTest.id,
      sourceKey: "batch7-preview",
      uniqueKey: `${prefix}:${message.type}`,
      recipientEmail: "preview-student@example.com",
      scheduledAt: now,
      rendered: message,
    });
  }

  const result = await processMockEmailOutbox(new Date(now.getTime() + 1000));
  console.log(JSON.stringify({ queued: messages.length, ...result }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
