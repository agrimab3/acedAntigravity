import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { mockRegistrations, mockTestOpsEvents, mockWaitlist } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestPaymentMode, isUnsafeProductionMockTestMode } from "@/lib/mockTest/mode";

export type MockTestCheckoutRegistration = {
  id: string;
};

export async function createCheckout(registration: MockTestCheckoutRegistration) {
  const mode = getMockTestPaymentMode();

  if (mode === "test") {
    if (isUnsafeProductionMockTestMode()) {
      throw new Error("Test mock-test checkout is disabled in production.");
    }

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
    const paidAfterExpiredHold = Boolean(
      !beforePayment.paidAt &&
        beforePayment.holdExpiresAt &&
        beforePayment.holdExpiresAt.getTime() <= now.getTime()
    );
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
