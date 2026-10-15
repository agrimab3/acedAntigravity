import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { legalTermsAcceptanceHistory, users, waitlistSignups } from "@/db/schema";
import { CURRENT_TERMS_VERSION, getAccountConsentStatus } from "@/lib/account-consent";
import { getDb } from "@/lib/db";

const payloadSchema = z.object({
  agreedTerms: z.literal(true),
  ageConfirmed: z.literal(true),
  termsVersion: z.literal(CURRENT_TERMS_VERSION),
  emailOptIn: z.boolean(),
});

export async function GET() {
  const status = await getAccountConsentStatus();
  if (!status.authenticated) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ complete: status.complete, missingAgeConfirmation: status.missingAgeConfirmation, missingTermsAcceptance: status.missingTermsAcceptance, termsVersion: CURRENT_TERMS_VERSION });
}

export async function POST(request: Request) {
  const status = await getAccountConsentStatus();
  const db = getDb();
  if (!status.authenticated || !status.userId || !status.email || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Confirm that you are at least 13 and accept the Terms and Privacy Policy." }, { status: 400 });
  }

  const email = status.email.trim().toLowerCase();
  const userId = status.userId;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(legalTermsAcceptanceHistory)
      .values({
        userId,
        termsVersion: CURRENT_TERMS_VERSION,
        acceptedAt: now,
        evidenceSource: "affirmative",
      })
      // One evidence record per account and Terms version prevents repeat POSTs
      // from creating misleading duplicate acceptances.
      .onConflictDoNothing();

    await tx
      .update(users)
      .set({
        agreedTermsAt: status.missingTermsAcceptance ? now : undefined,
        agreedTermsVersion: CURRENT_TERMS_VERSION,
        ageConfirmedAt: status.missingAgeConfirmation ? now : undefined,
        emailOptIn: parsed.data.emailOptIn,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
  });

  if (parsed.data.emailOptIn) {
    await db.insert(waitlistSignups).values({ email }).onConflictDoNothing();
  }

  return NextResponse.json({ ok: true });
}
