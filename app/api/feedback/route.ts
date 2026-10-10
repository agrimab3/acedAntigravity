import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { feedback } from "@/db/schema";
import { feedbackSchema } from "@/lib/feedback/validation";

const requests = new Map<string, number[]>();
function feedbackRateAllowed(key: string, now = Date.now()) {
  if (requests.size > 5000) for (const [id, times] of requests) if (!times.some(t => now - t < 3600000)) requests.delete(id);
  const recent = (requests.get(key) ?? []).filter(t => now - t < 3600000);
  if (recent.length >= 10) { requests.set(key, recent); return false; }
  requests.set(key, [...recent, now]);
  return true;
}
export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  const userId = session?.user?.id ?? null;
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!feedbackRateAllowed(userId ? `user:${userId}` : `ip:${ip}`))
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const data = parsed.data;
  const values = { userId, source: data.source, contextId: data.contextId ?? null, pagePath: data.pagePath, rating: data.rating ?? null, tags: data.tags ?? null, message: data.message?.trim() || null };
  if (userId && values.contextId) {
    const [existing] = await db.select({ id: feedback.id }).from(feedback).where(and(eq(feedback.userId, userId), eq(feedback.contextId, values.contextId))).limit(1);
    if (existing) {
      await db.update(feedback).set(values).where(eq(feedback.id, existing.id));
      return NextResponse.json({ ok: true, updated: true });
    }
  }
  await db.insert(feedback).values(values).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
