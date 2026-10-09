import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { mockStripeEvents, mockTestOpsEvents } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/mockTest/stripe";
import {
  hasStripeWebhookSignature,
  isExpectedMockCheckoutPayment,
  shouldProcessStripeEventClaim,
} from "@/lib/mockTest/stripe-policy";
import {
  completeStripeRegistration,
  recordNoSeatRefund,
  releaseExpiredCheckoutHold,
} from "@/lib/mockTest/payments";

export const runtime = "nodejs";

function registrationIdFromObject(object: Stripe.Event.Data.Object) {
  const metadata = (object as { metadata?: Record<string, string> }).metadata;
  return metadata?.registrationId || null;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!hasStripeWebhookSignature(signature, webhookSecret)) {
    return NextResponse.json({ error: "Webhook signature required." }, { status: 400 });
  }

  const rawBody = await request.text();
  const verifiedSignature = signature as string;
  const verifiedWebhookSecret = webhookSecret as string;
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      verifiedSignature,
      verifiedWebhookSecret
    );
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const registrationId = registrationIdFromObject(event.data.object);
  const inserted = await db.insert(mockStripeEvents).values({
    eventId: event.id,
    eventType: event.type,
    registrationId,
  }).onConflictDoNothing().returning({ eventId: mockStripeEvents.eventId });

  if (!shouldProcessStripeEventClaim(inserted.length)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const id = session.metadata?.registrationId;
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!id || !paymentIntentId) {
        throw new Error("Completed Checkout Session is missing registration metadata.");
      }
      if (
        !isExpectedMockCheckoutPayment({
          paymentStatus: session.payment_status,
          amountTotal: session.amount_total,
          currency: session.currency,
        })
      ) {
        throw new Error("Completed Checkout Session has an unexpected payment state.");
      }

      const result = await completeStripeRegistration(id, paymentIntentId, session.id);
      if (result.status === "refund_required") {
        const refund = await getStripe().refunds.create(
          { payment_intent: paymentIntentId, metadata: { registrationId: id, reason: "seat_unavailable" } },
          { idempotencyKey: `mock-seat-refund:${id}:${paymentIntentId}` }
        );
        await recordNoSeatRefund({
          registrationId: id,
          paymentIntentId,
          checkoutSessionId: session.id,
          refundId: refund.id,
          email: result.email,
          mockTestId: result.mockTestId,
        });
      }
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const id = session.metadata?.registrationId;
      if (id) await releaseExpiredCheckoutHold(id, session.id);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    await db.delete(mockStripeEvents).where(eq(mockStripeEvents.eventId, event.id));
    if (registrationId) {
      try {
        const result = await db.execute(sql`
          select mock_test_id from mock_registrations where id=${registrationId}
        `);
        const mockTestId = (result.rows[0] as { mock_test_id?: string } | undefined)?.mock_test_id;
        if (mockTestId) await db.insert(mockTestOpsEvents).values({
          mockTestId,
          registrationId,
          kind: "webhook_error",
          details: { eventId: event.id, eventType: event.type, message: error instanceof Error ? error.message : String(error) },
        });
      } catch {}
    }
    console.error("[mock-test stripe] webhook failed", { eventId: event.id, eventType: event.type, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
