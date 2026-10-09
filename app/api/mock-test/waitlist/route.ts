import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { mockTests, mockWaitlist } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { normalizeWaitlistEmail } from "@/lib/mockTest/waitlist";
import { queueWaitlistJoinedEmail } from "@/lib/mockTest/email-outbox";
import { getSeatStatus } from "@/lib/mockTest/seats";
import { isMockTestSignupEnabled, MOCK_TEST_SIGNUPS_SOON_MESSAGE } from "@/lib/mockTest/mode";
import { isMockSignupClosedForZone, NEXT_MOCK, TIME_ZONES } from "@/lib/mockTests";
import { consumeRateLimit, rateLimitIdentity, RATE_LIMITS } from "@/lib/rate-limit";

type WaitlistBody = { email?: string; timeZone?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!isMockTestSignupEnabled()) {
    return NextResponse.json({ error: MOCK_TEST_SIGNUPS_SOON_MESSAGE }, { status: 503 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Waitlist unavailable." }, { status: 503 });

  const user = await getMockTestUser();
  const body = (await request.json().catch(() => null)) as WaitlistBody | null;
  const email = normalizeWaitlistEmail(body?.email ?? "");
  const timeZone = body?.timeZone ?? "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const waitlistKey = user?.id ?? rateLimitIdentity(email);
  const waitlistLimit = consumeRateLimit(`waitlist:${waitlistKey}`, RATE_LIMITS.waitlist);
  if (!waitlistLimit.allowed) {
    return NextResponse.json(
      { error: "Too many signup tries. Give it a minute and try again ✦" },
      { status: 429, headers: { "Retry-After": String(waitlistLimit.retryAfterSeconds) } }
    );
  }

  if (user && normalizeWaitlistEmail(user.email) !== email) {
    return NextResponse.json({ error: "Use the email on your signed-in account." }, { status: 400 });
  }

  if (!TIME_ZONES.some((zone) => zone.value === timeZone)) {
    return NextResponse.json({ error: "Choose a valid time zone." }, { status: 400 });
  }

  if (isMockSignupClosedForZone(timeZone)) {
    return NextResponse.json({ error: `Signups for ${NEXT_MOCK.testDateLabel} are closed.` }, { status: 409 });
  }

  const [mockTest] = await db
    .select({ id: mockTests.id })
    .from(mockTests)
    .where(eq(mockTests.slug, NEXT_MOCK.mockTestSlug))
    .limit(1);

  if (!mockTest) return NextResponse.json({ error: "Mock test not found." }, { status: 404 });

  const seatStatus = await getSeatStatus(mockTest.id);
  if (!seatStatus.isFull) {
    return NextResponse.json(
      { error: "Seats are available right now. You can save your seat." },
      { status: 409 }
    );
  }

  const [entry] = await db
    .insert(mockWaitlist)
    .values({
      mockTestId: mockTest.id,
      email,
      userId: user?.id ?? null,
      timeZone,
    })
    .onConflictDoUpdate({
      target: [mockWaitlist.mockTestId, mockWaitlist.email],
      set: { userId: user?.id ?? null, timeZone },
    })
    .returning({ id: mockWaitlist.id, email: mockWaitlist.email });

  try {
    await queueWaitlistJoinedEmail(entry.id);
  } catch (error) {
    console.error("[mock-test email] failed to queue waitlist joined email", {
      waitlistId: entry.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({ joined: true, email: entry.email });
}
