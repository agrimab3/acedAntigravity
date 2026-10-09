import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { mockTestSessions } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import {
  advanceMockBreak,
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
      currentBreakAfter: mockTestSessions.currentBreakAfter,
    })
    .from(mockTestSessions)
    .where(eq(mockTestSessions.registrationId, registration.id))
    .limit(1);

  if (!session || session.currentBreakAfter !== "math") {
    return NextResponse.json({ error: "Math-to-Reading break is not active." }, { status: 409 });
  }

  const result = await advanceMockBreak(session.id, registration.id, {
    forceStart: true,
  });

  if (!result.advanced) {
    return NextResponse.json({ error: "Could not bypass the break." }, { status: 409 });
  }

  return NextResponse.json({ advanced: true });
}
