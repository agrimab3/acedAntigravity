import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { users } from "@/db/schema";
import { getAuthSession, isLocalDevTestUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getAuthSession();
  const db = getDb();

  if (!session?.user?.id || !isLocalDevTestUser(session.user.email, request.headers) || !db) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await db
    .update(users)
    .set({
      preferredName: null,
      gradeLevel: null,
      actTestDate: null,
      previousActScore: null,
      hasRecommendations: null,
      onboardingCompletedAt: null,
      walkthroughCompletedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}
