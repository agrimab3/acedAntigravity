import "server-only";

import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

// The current public Terms are the document available at /legal?tab=terms.
// This identifier intentionally does not claim a historical version for legacy acceptances.
export const CURRENT_TERMS_VERSION = "legal-terms-2026-10-14";

export type AccountConsentStatus = {
  authenticated: boolean;
  complete: boolean;
  userId: string | null;
  email: string | null;
  missingAgeConfirmation: boolean;
  missingTermsAcceptance: boolean;
};

export async function getAccountConsentStatus(): Promise<AccountConsentStatus> {
  const session = await getAuthSession();
  const userId = session?.user?.id ?? null;
  const email = session?.user?.email ?? null;
  const db = getDb();
  if (!userId || !email || !db) return { authenticated: false, complete: false, userId: null, email: null, missingAgeConfirmation: false, missingTermsAcceptance: false };
  const [user] = await db.select({ ageConfirmedAt: users.ageConfirmedAt, agreedTermsVersion: users.agreedTermsVersion }).from(users).where(eq(users.id, userId)).limit(1);
  const missingAgeConfirmation = !user?.ageConfirmedAt;
  const missingTermsAcceptance = user?.agreedTermsVersion !== CURRENT_TERMS_VERSION;
  return { authenticated: true, complete: !missingAgeConfirmation && !missingTermsAcceptance, userId, email, missingAgeConfirmation, missingTermsAcceptance };
}

export async function getEligibleAccountSession() {
  const status = await getAccountConsentStatus();
  return status.complete ? status : null;
}

export function accountConsentRequiredResponse() {
  return Response.json({ error: "Age confirmation and Terms acceptance are required.", code: "CONSENT_REQUIRED" }, { status: 403 });
}
