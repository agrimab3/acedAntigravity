import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { mockRegistrations, mockTestOpsEvents, mockWaitlist } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestPaymentMode, isUnsafeProductionMockTestMode, MOCK_TEST_SIGNUPS_SOON_MESSAGE } from "@/lib/mockTest/mode";
import { MOCK_TEST_SEAT_CAP } from "@/lib/mockTest/seat-policy";
import { WAITLIST_INVITE_MS } from "@/lib/mockTest/waitlist-policy";

export type MockTestCheckoutRegistration = {
  id: string;
};

export async function createCheckout(registration: MockTestCheckoutRegistration) {
  const mode = getMockTestPaymentMode();

  if (mode === "disabled" || isUnsafeProductionMockTestMode()) {
    throw new Error(MOCK_TEST_SIGNUPS_SOON_MESSAGE);
  }

  if (mode === "test") {
    return {
      url: `/mock-test/dev/checkout?registrationId=${encodeURIComponent(registration.id)}`,
    };
  }

  // TODO(mock-test-go-live): create the Stripe Checkout Session here and return its URL.
  // Stripe checkout creation must keep the existing 15-minute hold intact.
  throw new Error("Stripe checkout is not configured yet.");
}

export async function markRegistrationPaid(registrationId: string, reference: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");

  return db.transaction(async (tx) => {
    const [beforePayment] = await tx
      .select({
        id: mockRegistrations.id,
        mockTestId: mockRegistrations.mockTestId,
        userId: mockRegistrations.userId,
        paidAt: mockRegistrations.paidAt,
        holdExpiresAt: mockRegistrations.holdExpiresAt,
      })
      .from(mockRegistrations)
      .where(eq(mockRegistrations.id, registrationId))
      .limit(1);

    if (!beforePayment) throw new Error("Mock-test registration not found.");

    const now = new Date();
    const hasActiveHold = Boolean(
      beforePayment.holdExpiresAt && beforePayment.holdExpiresAt.getTime() > now.getTime()
    );
    const paidAfterExpiredHold = Boolean(
      !beforePayment.paidAt &&
        beforePayment.holdExpiresAt &&
        beforePayment.holdExpiresAt.getTime() <= now.getTime()
    );

    if (!beforePayment.paidAt && !hasActiveHold) {
      await tx.execute(sql`select id from mock_tests where id=${beforePayment.mockTestId} for update`);
      const inviteCutoff = new Date(now.getTime() - WAITLIST_INVITE_MS);
      const occupiedResult = await tx.execute(sql`
        select
          (
            select count(*)::int
            from mock_registrations
            where mock_test_id=${beforePayment.mockTestId}
              and id <> ${registrationId}
              and (paid_at is not null or (hold_expires_at is not null and hold_expires_at > ${now}))
          ) + (
            select count(*)::int
            from mock_waitlist
            where mock_test_id=${beforePayment.mockTestId}
              and invited_at is not null
              and invite_used_at is null
              and invited_at > ${inviteCutoff}
          ) as occupied
      `);
      const occupied = Number((occupiedResult.rows[0] as { occupied?: unknown })?.occupied ?? 0);
      if (occupied >= MOCK_TEST_SEAT_CAP) {
        throw new Error("This seat is no longer available. Please join the waitlist.");
      }
    }
    if (paidAfterExpiredHold && beforePayment.holdExpiresAt) {
      console.warn("[mock-test] payment completed after seat hold expired; honoring payment", {
        registrationId,
        holdExpiredAt: beforePayment.holdExpiresAt.toISOString(),
        paidAt: now.toISOString(),
        reference,
      });
      await tx.insert(mockTestOpsEvents).values({
        mockTestId: beforePayment.mockTestId,
        registrationId,
        kind: "payment_after_hold_expired",
        details: {
          holdExpiredAt: beforePayment.holdExpiresAt.toISOString(),
          paidAt: now.toISOString(),
          reference,
        },
        createdAt: now,
      });
    }

    const [registration] = await tx
      .update(mockRegistrations)
      .set({
        paidAt: beforePayment.paidAt ?? now,
        holdExpiresAt: null,
        stripePaymentIntentId: reference,
        updatedAt: now,
      })
      .where(eq(mockRegistrations.id, registrationId))
      .returning({ id: mockRegistrations.id });

    if (!registration) throw new Error("Mock-test registration not found.");

    await tx
      .update(mockWaitlist)
      .set({ inviteUsedAt: now })
      .where(
        and(
          eq(mockWaitlist.mockTestId, beforePayment.mockTestId),
          eq(mockWaitlist.userId, beforePayment.userId),
          isNotNull(mockWaitlist.invitedAt),
          isNull(mockWaitlist.inviteUsedAt)
        )
      );

    return registration;
  });
}
