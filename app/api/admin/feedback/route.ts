import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { feedback } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getAdminSession } from "@/lib/admin";

export async function GET(request: NextRequest) {
  if (!await getAdminSession()) return new NextResponse("Not Found", { status: 404 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const source = request.nextUrl.searchParams.get("source");
  const rating = request.nextUrl.searchParams.get("rating");
  const filters = [];
  if (["mock_test","practice_session","practice_test","page_footer"].includes(source ?? "")) filters.push(eq(feedback.source, source as typeof feedback.$inferSelect.source));
  if (rating && /^[1-5]$/.test(rating)) filters.push(eq(feedback.rating, Number(rating)));
  const { and } = await import("drizzle-orm");
  const rows = await db.select().from(feedback).where(filters.length ? and(...filters) : undefined).orderBy(desc(feedback.createdAt)).limit(300);
  const averages = await db.select({ source: feedback.source, average: sql<number>`avg(${feedback.rating})::float`, count: sql<number>`count(*)::int` }).from(feedback).groupBy(feedback.source);
  return NextResponse.json({ rows, averages });
}
