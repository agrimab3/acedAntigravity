import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { users } from "@/db/schema";
import { getAccountConsentStatus } from "@/lib/account-consent";
import { getDb } from "@/lib/db";

const schema = z.object({ emailOptIn: z.boolean() });
export async function GET() {
  const status = await getAccountConsentStatus(); const db = getDb();
  if (!status.authenticated || !status.userId || !db) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const [user] = await db.select({ emailOptIn: users.emailOptIn }).from(users).where(eq(users.id, status.userId)).limit(1);
  return NextResponse.json({ emailOptIn: user?.emailOptIn ?? false });
}
export async function PATCH(request: Request) {
  const status = await getAccountConsentStatus(); const db = getDb(); const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!status.authenticated || !status.userId || !db) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!parsed.success) return NextResponse.json({ error: "Invalid email preference." }, { status: 400 });
  await db.update(users).set({ emailOptIn: parsed.data.emailOptIn, updatedAt: new Date() }).where(eq(users.id, status.userId));
  return NextResponse.json({ ok: true, emailOptIn: parsed.data.emailOptIn });
}
