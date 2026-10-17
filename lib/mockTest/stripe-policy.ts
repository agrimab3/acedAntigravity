export function hasStripeWebhookSignature(
  signature: string | null | undefined,
  webhookSecret: string | null | undefined
) {
  return Boolean(signature && webhookSecret);
}

export function shouldProcessStripeEventClaim(insertedRowCount: number) {
  return insertedRowCount > 0;
}

export function decideStripeCheckoutCompletion(input: {
  alreadyPaid: boolean;
  alreadyRefunded: boolean;
  activeHold: boolean;
  occupiedWithoutRegistration: number;
  seatCap: number;
}) {
  if (input.alreadyRefunded) return "refunded" as const;
  if (input.alreadyPaid) return "paid" as const;
  if (
    !input.activeHold &&
    input.occupiedWithoutRegistration >= input.seatCap
  ) {
    return "refund_required" as const;
  }
  return "paid" as const;
}

export function shouldReleaseCheckoutHoldOnExpiredEvent(
  paidAt: Date | null,
  storedCheckoutSessionId: string | null,
  eventCheckoutSessionId: string | null
) {
  if (paidAt !== null) return false;
  if (!eventCheckoutSessionId) return true;
  return storedCheckoutSessionId === eventCheckoutSessionId;
}

export function isExpectedMockCheckoutPayment(input: {
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
}) {
  return (
    input.paymentStatus === "paid" &&
    input.amountTotal === 200 &&
    input.currency === "usd"
  );
}

/** Production Checkout redirects must not depend on an inbound Host header. */
export function resolveCheckoutOrigin(input: {
  configuredOrigin?: string;
  requestOrigin?: string;
  nodeEnv?: string;
  deploymentEnvironment?: string;
}) {
  const configuredOrigin = input.configuredOrigin?.replace(/\/$/, "");
  if (input.nodeEnv === "production") {
    const environment = getAcedDeploymentEnvironment(input.deploymentEnvironment);
    const allowedOrigin = environment === "staging" ? ACED_STAGING_ORIGIN : ACED_PRODUCTION_ORIGIN;
    if (configuredOrigin !== allowedOrigin) {
      throw new Error(`Checkout requires NEXT_PUBLIC_SITE_URL=${allowedOrigin}.`);
    }
    return configuredOrigin;
  }
  return input.requestOrigin || configuredOrigin || "http://localhost:3000";
}
import {
  ACED_PRODUCTION_ORIGIN,
  ACED_STAGING_ORIGIN,
  getAcedDeploymentEnvironment,
} from "../deployment-environment.ts";
