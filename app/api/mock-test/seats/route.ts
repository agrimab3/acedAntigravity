import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { mockTests } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSeatStatusCached } from "@/lib/mockTest/seats";
import { NEXT_MOCK } from "@/lib/mockTests";

export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Seat status unavailable." }, { status: 503 });
  }

  const [mockTest] = await db
    .select({ id: mockTests.id })
    .from(mockTests)
    .where(eq(mockTests.slug, NEXT_MOCK.mockTestSlug))
    .limit(1);

  if (!mockTest) {
    return NextResponse.json({ error: "Mock test not found." }, { status: 404 });
  }

  const status = await getSeatStatusCached(mockTest.id);
  const response = NextResponse.json({
    limit: status.limit,
    remaining: status.remaining,
    isFull: status.isFull,
  });
  response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=30");
  return response;
}
