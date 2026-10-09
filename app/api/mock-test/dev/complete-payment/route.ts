import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { mockRegistrations, mockTests } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { getMockTestPaymentMode, isUnsafeProductionMockTestMode } from "@/lib/mockTest/mode";
import { markRegistrationPaid } from "@/lib/mockTest/payments";
import { NEXT_MOCK } from "@/lib/mockTests";

export async function POST(request: Request) {
  if (getMockTestPaymentMode() !== "test" || isUnsafeProductionMockTestMode()) {
    return NextResponse.json({ error: "Test checkout is disabled." }, { status: 404 });
  }

  const user = await getMockTestUser();
  const db = getDb();
  if (!user || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { registrationId?: string } | null;
  if (!body?.registrationId) {
    return NextResponse.json({ error: "Missing registration." }, { status: 400 });
  }

  const [registration] = await db
    .select({ id: mockRegistrations.id })
    .from(mockRegistrations)
    .innerJoin(mockTests, eq(mockRegistrations.mockTestId, mockTests.id))
    .where(
      and(
        eq(mockRegistrations.id, body.registrationId),
        eq(mockRegistrations.userId, user.id),
        eq(mockTests.slug, NEXT_MOCK.mockTestSlug)
      )
    )
    .limit(1);

  if (!registration) {
    return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  }

  await markRegistrationPaid(
    registration.id,
    `test_payment_${registration.id}`
  );

  return NextResponse.json({ url: "/mock-test/confirmed" });
}
