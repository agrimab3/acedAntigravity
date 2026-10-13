import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { users, waitlistSignups } from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

const payloadSchema = z.object({
  agreedTerms: z.literal(true),
  emailOptIn: z.boolean(),
});

export async function POST(request: Request) {
  const session = await getAuthSession();
  const db = getDb();
  if (!session?.user?.id || !session.user.email || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please agree to the Terms and Privacy Policy." }, { status: 400 });
  }

  const email = session.user.email.trim().toLowerCase();
  const now = new Date();
  await db
    .update(users)
    .set({
      agreedTermsAt: now,
      emailOptIn: parsed.data.emailOptIn,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  if (parsed.data.emailOptIn) {
    await db.insert(waitlistSignups).values({ email }).onConflictDoNothing();
  }

  return NextResponse.json({ ok: true });
}
