import { NextResponse } from "next/server";
import { waitlistSignups } from "@/db/schema";
import { getDb } from "@/lib/db";
import { consumeRateLimit, getRequestNetworkIdentity, RATE_LIMITS } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const limit = consumeRateLimit(`public-waitlist:${getRequestNetworkIdentity(request)}`, RATE_LIMITS.publicSignup);
  if (!limit.allowed) return NextResponse.json({ error: "Too many submissions. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const body = await request.json().catch(() => null) as { email?: string; company?: string } | null;
  if (!body || typeof body.company === "string" && body.company) return NextResponse.json({ ok: true });
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Signups are temporarily unavailable." }, { status: 503 });
  await db.insert(waitlistSignups).values({ email }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
