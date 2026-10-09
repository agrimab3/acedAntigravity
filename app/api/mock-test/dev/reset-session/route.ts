import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  mockRegistrations,
  mockTestForms,
  mockTestSessions,
  mockTestTopicResults,
  mockTests,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import {
  canBypassMockEventWindow,
  getPaidMockRegistration,
} from "@/lib/mockTest/runner";

export async function POST() {
  if (!canBypassMockEventWindow()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const user = await getMockTestUser();
  const db = getDb();
  if (!user || !db) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const registration = await getPaidMockRegistration(user.id);
  if (!registration) {
    return NextResponse.json({ error: "Paid mock-test registration required." }, { status: 403 });
  }

  const [session] = await db
    .select({
      id: mockTestSessions.id,
      formId: mockTestSessions.formId,
    })
    .from(mockTestSessions)
    .where(eq(mockTestSessions.registrationId, registration.id))
    .limit(1);

  if (session) {
    const [form] = await db
      .select({ version: mockTestForms.version })
      .from(mockTestForms)
      .where(
        and(
          eq(mockTestForms.id, session.formId),
          eq(mockTestForms.version, "DEV")
        )
      )
      .limit(1);

    if (!form) {
      return NextResponse.json(
        { error: "Only the local DEV rehearsal can be reset." },
        { status: 409 }
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(mockTests)
      .set({ status: "open", compositeDistribution: null })
      .where(eq(mockTests.id, registration.mockTestId));

    await tx
      .delete(mockTestTopicResults)
      .where(eq(mockTestTopicResults.registrationId, registration.id));

    if (session) {
      await tx
        .delete(mockTestSessions)
        .where(eq(mockTestSessions.id, session.id));
    }

    await tx
      .update(mockRegistrations)
      .set({
        startedAt: null,
        finishedAt: null,
        englishScore: null,
        mathScore: null,
        readingScore: null,
        scienceScore: null,
        composite: null,
        percentile: null,
        updatedAt: new Date(),
      })
      .where(eq(mockRegistrations.id, registration.id));
  });

  return NextResponse.json({ reset: true });
}
