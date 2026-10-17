import "server-only";

import crypto from "node:crypto";
import { isAcedStaging } from "@/lib/deployment-environment";

export function isStagingEmailDeliveryEnabled() {
  return isAcedStaging() && process.env.STAGING_EMAIL_DELIVERY_ENABLED === "true";
}

export function isAuthorizedStagingEmailWorker(authorization: string | null) {
  if (!isAcedStaging() || !authorization?.startsWith("Bearer ")) return false;
  const configured = process.env.STAGING_EMAIL_WORKER_TOKEN;
  const provided = authorization.slice("Bearer ".length);
  if (!configured || !provided) return false;
  const expectedBuffer = Buffer.from(configured);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}
