import { and, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { accountDeletionRequests } from "@/db/schema";
import { getAccountConsentStatus } from "@/lib/account-consent";
import { getDb } from "@/lib/db";

const schema = z.object({ confirm: z.literal(true) });
export async function GET() {
  const status = await getAccountConsentStatus(); const db = getDb();
  if (!status.authenticated || !status.userId || !db) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const [request] = await db.select({ status: accountDeletionRequests.status, requestedAt: accountDeletionRequests.requestedAt, completedAt: accountDeletionRequests.completedAt }).from(accountDeletionRequests).where(eq(accountDeletionRequests.userId, status.userId)).orderBy(desc(accountDeletionRequests.requestedAt)).limit(1);
  return NextResponse.json({ request: request ?? null });
}
export async function POST(request: Request) {
  const status = await getAccountConsentStatus(); const db = getDb(); const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!status.authenticated || !status.userId || !db) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!parsed.success) return NextResponse.json({ error: "Please confirm your request." }, { status: 400 });
  const [existing] = await db.select({ id: accountDeletionRequests.id, status: accountDeletionRequests.status }).from(accountDeletionRequests).where(and(eq(accountDeletionRequests.userId, status.userId), ne(accountDeletionRequests.status, "completed"))).orderBy(desc(accountDeletionRequests.requestedAt)).limit(1);
  if (existing) return NextResponse.json({ ok: true, status: existing.status, duplicate: true });
  const [created] = await db.insert(accountDeletionRequests).values({ userId: status.userId }).returning({ status: accountDeletionRequests.status, requestedAt: accountDeletionRequests.requestedAt });
  return NextResponse.json({ ok: true, request: created });
}
