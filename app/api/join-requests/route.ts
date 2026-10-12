import { NextResponse } from "next/server";
import { joinRequests } from "@/db/schema";
import { getDb } from "@/lib/db";
import { consumeRateLimit, getRequestNetworkIdentity, RATE_LIMITS } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["early tester", "question checker", "school ambassador"] as const;

export async function POST(request: Request) {
  const limit = consumeRateLimit(`public-join:${getRequestNetworkIdentity(request)}`, RATE_LIMITS.publicSignup);
  if (!limit.allowed) return NextResponse.json({ error: "Too many submissions. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const body = await request.json().catch(() => null) as { firstName?: string; email?: string; roles?: unknown; note?: string; company?: string } | null;
  if (!body || typeof body.company === "string" && body.company) return NextResponse.json({ ok: true });
  const firstName = body.firstName?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const roles = Array.isArray(body.roles) ? body.roles.filter((role): role is string => typeof role === "string" && (ROLES as readonly string[]).includes(role)) : [];
  const note = body.note?.trim() ?? "";
  if (!firstName || firstName.length > 120 || !EMAIL_RE.test(email) || roles.length === 0 || note.length > 1000) return NextResponse.json({ error: "Check your name, email, and selected roles." }, { status: 400 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Signups are temporarily unavailable." }, { status: 503 });
  await db.insert(joinRequests).values({ firstName, email, roles, note: note || null });
  return NextResponse.json({ ok: true });
}
