import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { mockRegistrations, mockTestOpsEvents, mockTests } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { createCheckout } from "@/lib/mockTest/payments";
import { isMockTestSignupEnabled, MOCK_TEST_SIGNUPS_SOON_MESSAGE } from "@/lib/mockTest/mode";
import { createSeatHold, MockTestSeatsFullError } from "@/lib/mockTest/seats";
import { validateInviteForUser } from "@/lib/mockTest/waitlist";
import { isMockSignupClosedForZone, NEXT_MOCK, TIME_ZONES } from "@/lib/mockTests";

type CheckoutBody = {
  timeZone?: string;
  agreedNoRefund?: boolean;
  marketingOptIn?: boolean;
  inviteToken?: string;
};

export async function POST(request: Request) {
  if (!isMockTestSignupEnabled()) {
    return NextResponse.json({ error: MOCK_TEST_SIGNUPS_SOON_MESSAGE }, { status: 503 });
  }

  const user = await getMockTestUser();
  const db = getDb();

  if (!user || !db) {
    return NextResponse.json({ error: "Please sign in before checking out." }, { status: 401 });
  }

  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  }

  if (!body.agreedNoRefund) {
    return NextResponse.json(
      { error: "You must agree to the non-refundable policy before checking out." },
      { status: 400 }
    );
  }

  if (!body.timeZone || !TIME_ZONES.some((zone) => zone.value === body.timeZone)) {
    return NextResponse.json({ error: "Choose a valid time zone." }, { status: 400 });
  }

  if (isMockSignupClosedForZone(body.timeZone)) {
    return NextResponse.json(
      { error: `Signups for ${NEXT_MOCK.testDateLabel} are closed.` },
      { status: 409 }
    );
  }

  const [mockTest] = await db
    .select({ id: mockTests.id, signupsPaused: mockTests.signupsPaused })
    .from(mockTests)
    .where(eq(mockTests.slug, NEXT_MOCK.mockTestSlug))
    .limit(1);

  if (!mockTest) {
    return NextResponse.json({ error: "The current mock test is not available." }, { status: 404 });
  }

  const [alreadyPaid] = await db
    .select({ id: mockRegistrations.id })
    .from(mockRegistrations)
    .where(
      and(
        eq(mockRegistrations.mockTestId, mockTest.id),
        eq(mockRegistrations.userId, user.id),
        isNotNull(mockRegistrations.paidAt)
      )
    )
    .limit(1);

  if (alreadyPaid) {
    return NextResponse.json({ url: "/mock-test/confirmed" });
  }
  if (mockTest.signupsPaused) {
    return NextResponse.json({ error: "Signups are paused. Check back soon." }, { status: 409 });
  }

  let registrationId: string | null = null;

  try {
    const invite = body.inviteToken
      ? await validateInviteForUser({
          inviteToken: body.inviteToken,
          mockTestId: mockTest.id,
          userId: user.id,
          email: user.email,
        })
      : null;

    const registration = await createSeatHold({
      mockTestId: mockTest.id,
      userId: user.id,
      timeZone: body.timeZone,
      agreedNoRefundAt: new Date(),
      marketingOptIn: Boolean(body.marketingOptIn),
      hasValidInvite: Boolean(invite),
    });

    registrationId = registration.id;

    if (registration.alreadyPaid) {
      return NextResponse.json({ url: "/mock-test/confirmed" });
    }

    const checkout = await createCheckout(registration);
    return NextResponse.json(checkout);
  } catch (error) {
    if (error instanceof MockTestSeatsFullError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          waitlist: true,
          url: "/mock-test/signup?waitlist=1",
        },
        { status: 409 }
      );
    }

    console.error("Failed to start mock-test checkout", error);
    if (registrationId) {
      await db.insert(mockTestOpsEvents).values({
        mockTestId: mockTest.id,
        registrationId,
        kind: "checkout_error",
        details: {
          message: error instanceof Error ? error.message : "Unknown checkout error",
        },
      });
    }
    return NextResponse.json({ error: "Could not start checkout. Try again." }, { status: 500 });
  }
}
