import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { mockRegistrations, mockTestOpsEvents, mockWaitlist } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestPaymentMode, isUnsafeProductionMockTestMode, MOCK_TEST_SIGNUPS_SOON_MESSAGE } from "@/lib/mockTest/mode";
import { MOCK_TEST_SEAT_CAP } from "@/lib/mockTest/seat-policy";
import { WAITLIST_INVITE_MS } from "@/lib/mockTest/waitlist-policy";
import { getStripe } from "@/lib/mockTest/stripe";
import { decideStripeCheckoutCompletion } from "@/lib/mockTest/stripe-policy";
import { reconcileWaitlistInvites } from "@/lib/mockTest/waitlist";

export type MockTestCheckoutRegistration = { id: string; email?: string; origin?: string };

export async function createCheckout(registration: MockTestCheckoutRegistration) {
  const mode = getMockTestPaymentMode();
  if (mode === "disabled" || isUnsafeProductionMockTestMode()) throw new Error(MOCK_TEST_SIGNUPS_SOON_MESSAGE);
  if (mode === "test") return { url: `/mock-test/dev/checkout?registrationId=${encodeURIComponent(registration.id)}` };

  const origin = registration.origin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const stripe = getStripe();
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");

  const [existing] = await db
    .select({
      checkoutSessionId: mockRegistrations.stripeCheckoutSessionId,
      paidAt: mockRegistrations.paidAt,
      refundedAt: mockRegistrations.refundedAt,
      holdExpiresAt: mockRegistrations.holdExpiresAt,
    })
    .from(mockRegistrations)
    .where(eq(mockRegistrations.id, registration.id))
    .limit(1);

  if (existing?.paidAt && !existing.refundedAt) {
    return { url: `${origin}/mock-test/confirmed` };
  }

  if (
    existing?.checkoutSessionId &&
    existing.holdExpiresAt &&
    existing.holdExpiresAt.getTime() > Date.now()
  ) {
    try {
      const current = await stripe.checkout.sessions.retrieve(existing.checkoutSessionId);
      if (current.status === "open" && current.url) return { url: current.url };
    } catch {
      // A stale Stripe session is replaced below.
    }
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: registration.email,
    expires_at: expiresAt,
    success_url: `${origin}/mock-test/confirmed`,
    cancel_url: `${origin}/mock-test/signup?canceled=1`,
    metadata: { registrationId: registration.id },
    payment_intent_data: {
      metadata: { registrationId: registration.id },
      statement_descriptor_suffix: "ACED MOCK TEST",
    },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: 200,
        product_data: { name: "ACED Mock Test · Saturday, December 5" },
      },
    }],
  });
  if (!session.url) throw new Error("Stripe Checkout did not return a URL.");

  await db.update(mockRegistrations).set({
    stripeCheckoutSessionId: session.id,
    holdExpiresAt: new Date(session.expires_at * 1000),
    updatedAt: new Date(),
  }).where(eq(mockRegistrations.id, registration.id));
  return { url: session.url };
}

export async function markRegistrationPaid(registrationId: string, reference: string) {
  return completeStripeRegistration(registrationId, reference, null);
}

export async function completeStripeRegistration(registrationId: string, paymentIntentId: string, checkoutSessionId: string | null) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");
  return db.transaction(async (tx) => {
    const row = await tx.execute(sql`select mr.id,mr.mock_test_id,mr.user_id,mr.paid_at,mr.refunded_at,mr.hold_expires_at,u.email from mock_registrations mr join users u on u.id=mr.user_id where mr.id=${registrationId} for update`);
    const before = row.rows[0] as {id:string;mock_test_id:string;user_id:string;paid_at:Date|null;refunded_at:Date|null;hold_expires_at:Date|null;email:string}|undefined;
    if (!before) throw new Error("Mock-test registration not found.");
    const now = new Date();
    const activeHold = Boolean(before.hold_expires_at && new Date(before.hold_expires_at).getTime() > now.getTime());
    await tx.execute(sql`select id from mock_tests where id=${before.mock_test_id} for update`);
    const cutoff = new Date(now.getTime() - WAITLIST_INVITE_MS);
    const occupied = await tx.execute(sql`select ((select count(*)::int from mock_registrations where mock_test_id=${before.mock_test_id} and id<>${registrationId} and (paid_at is not null or (hold_expires_at is not null and hold_expires_at>${now}))) + (select count(*)::int from mock_waitlist where mock_test_id=${before.mock_test_id} and invited_at is not null and invite_used_at is null and invited_at>${cutoff})) as occupied`);
    const completionDecision = decideStripeCheckoutCompletion({
      alreadyPaid: Boolean(before.paid_at),
      alreadyRefunded: Boolean(before.refunded_at),
      activeHold,
      occupiedWithoutRegistration: Number((occupied.rows[0] as {occupied?:unknown})?.occupied ?? 0),
      seatCap: MOCK_TEST_SEAT_CAP,
    });
    if (completionDecision === "refunded") return { status: "refunded" as const, mockTestId: before.mock_test_id, email: before.email };
    if (completionDecision === "paid" && before.paid_at) return { status: "paid" as const, mockTestId: before.mock_test_id, email: before.email };
    if (completionDecision === "refund_required") {
      await tx.update(mockRegistrations).set({ stripePaymentIntentId: paymentIntentId, stripeCheckoutSessionId: checkoutSessionId ?? undefined, holdExpiresAt: null, updatedAt: now }).where(eq(mockRegistrations.id, registrationId));
      return { status: "refund_required" as const, mockTestId: before.mock_test_id, email: before.email };
    }

    await tx.update(mockRegistrations).set({ paidAt: now, holdExpiresAt: null, stripePaymentIntentId: paymentIntentId, stripeCheckoutSessionId: checkoutSessionId ?? undefined, updatedAt: now }).where(eq(mockRegistrations.id, registrationId));
    await tx.update(mockWaitlist).set({ inviteUsedAt: now }).where(and(eq(mockWaitlist.mockTestId,before.mock_test_id),eq(mockWaitlist.userId,before.user_id),isNotNull(mockWaitlist.invitedAt),isNull(mockWaitlist.inviteUsedAt)));
    return { status: "paid" as const, mockTestId: before.mock_test_id, email: before.email };
  });
}

export async function recordNoSeatRefund(input:{registrationId:string;paymentIntentId:string;checkoutSessionId:string|null;refundId:string;email:string;mockTestId:string}) {
  const db=getDb(); if(!db) throw new Error("Database is not configured.");
  const now=new Date();
  await db.transaction(async tx=>{
    const [registration] = await tx
      .select({ timeZone: mockRegistrations.timeZone })
      .from(mockRegistrations)
      .where(eq(mockRegistrations.id, input.registrationId))
      .limit(1);
    await tx.update(mockRegistrations).set({paidAt:null,holdExpiresAt:null,stripePaymentIntentId:input.paymentIntentId,stripeCheckoutSessionId:input.checkoutSessionId ?? undefined,stripeRefundId:input.refundId,refundedAt:now,refundReason:"seat_unavailable",updatedAt:now}).where(eq(mockRegistrations.id,input.registrationId));
    await tx.insert(mockWaitlist).values({mockTestId:input.mockTestId,email:input.email.toLowerCase(),timeZone:registration?.timeZone ?? null,createdAt:new Date(0)}).onConflictDoUpdate({target:[mockWaitlist.mockTestId,mockWaitlist.email],set:{timeZone:registration?.timeZone ?? null,createdAt:new Date(0),invitedAt:null,inviteToken:null,inviteUsedAt:null}});
    await tx.insert(mockTestOpsEvents).values({mockTestId:input.mockTestId,registrationId:input.registrationId,kind:"payment_refunded_no_seat",details:{refundId:input.refundId,paymentIntentId:input.paymentIntentId},createdAt:now});
  });
}

export async function releaseExpiredCheckoutHold(
  registrationId: string,
  checkoutSessionId?: string | null
) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");

  const conditions = [
    eq(mockRegistrations.id, registrationId),
    isNull(mockRegistrations.paidAt),
  ];

  if (checkoutSessionId) {
    conditions.push(eq(mockRegistrations.stripeCheckoutSessionId, checkoutSessionId));
  }

  const [released] = await db
    .update(mockRegistrations)
    .set({ holdExpiresAt: null, updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ mockTestId: mockRegistrations.mockTestId });

  if (released) {
    await reconcileWaitlistInvites(released.mockTestId);
  }

  return {
    released: Boolean(released),
    checkoutSessionId: checkoutSessionId ?? null,
  };
}
