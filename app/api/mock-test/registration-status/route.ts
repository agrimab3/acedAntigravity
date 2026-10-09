import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { mockRegistrations, mockTests } from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import { NEXT_MOCK, getMockTimeZoneDisplay } from "@/lib/mockTests";

export async function GET() {
  const session = await getAuthSession();
  const db = getDb();

  if (!session?.user?.id || !db) {
    return NextResponse.json(
      { paid: false, finished: false, released: false },
      { status: 401 }
    );
  }

  const [registration] = await db
    .select({
      id: mockRegistrations.id,
      timeZone: mockRegistrations.timeZone,
      finishedAt: mockRegistrations.finishedAt,
      testStatus: mockTests.status,
      resultsReleaseAt: mockTests.resultsReleaseAt,
    })
    .from(mockRegistrations)
    .innerJoin(mockTests, eq(mockRegistrations.mockTestId, mockTests.id))
    .where(
      and(
        eq(mockTests.slug, NEXT_MOCK.mockTestSlug),
        eq(mockRegistrations.userId, session.user.id),
        isNotNull(mockRegistrations.paidAt)
      )
    )
    .limit(1);

  if (!registration) {
    return NextResponse.json({
      paid: false,
      finished: false,
      released: false,
    });
  }

  const zoneDisplay = getMockTimeZoneDisplay(registration.timeZone);
  const now = getMockTestServerNow();
  const released =
    registration.testStatus === "released" &&
    now.getTime() >= registration.resultsReleaseAt.getTime();

  return NextResponse.json({
    paid: true,
    finished: Boolean(registration.finishedAt),
    released,
    localReleaseTime: zoneDisplay.localReleaseTime,
  });
}
