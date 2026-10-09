import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { mockRegistrations, mockTests, mockWaitlist } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { canBypassMockEventWindow } from "@/lib/mockTest/runner";
import { NEXT_MOCK } from "@/lib/mockTests";

export async function POST() {
  if (!canBypassMockEventWindow()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const user = await getMockTestUser();
  const db = getDb();
  if (!user || !db) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const [mockTest] = await db
    .select({ id: mockTests.id })
    .from(mockTests)
    .where(eq(mockTests.slug, NEXT_MOCK.mockTestSlug))
    .limit(1);

  if (!mockTest) {
    return NextResponse.json({ error: "Mock test not found." }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(mockWaitlist)
      .where(
        and(
          eq(mockWaitlist.mockTestId, mockTest.id),
          or(
            eq(mockWaitlist.userId, user.id),
            eq(mockWaitlist.email, user.email.trim().toLowerCase())
          )
        )
      );

    await tx
      .delete(mockRegistrations)
      .where(
        and(
          eq(mockRegistrations.mockTestId, mockTest.id),
          eq(mockRegistrations.userId, user.id)
        )
      );
  });

  return NextResponse.json({ reset: true });
}
