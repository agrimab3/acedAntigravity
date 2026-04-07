import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { practiceAnswers, practiceSessions } from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

const completeSchema = z.object({
  sessionId: z.string().uuid().nullable().optional(),
  durationSeconds: z.coerce.number().int().min(0).default(0),
});

export async function POST(request: Request) {
  const parsed = completeSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid completion payload." }, { status: 400 });
  }

  const db = getDb();
  const session = await getAuthSession();
  const userId = session?.user?.id;

  if (!db || !userId || !parsed.data.sessionId) {
    return NextResponse.json({ persisted: false });
  }

  const { sessionId, durationSeconds } = parsed.data;

  const [sessionRow] = await db
    .select({
      id: practiceSessions.id,
    })
    .from(practiceSessions)
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)))
    .limit(1);

  if (!sessionRow) {
    return NextResponse.json({ error: "Practice session not found." }, { status: 404 });
  }

  const answers = await db
    .select({
      isCorrect: practiceAnswers.isCorrect,
    })
    .from(practiceAnswers)
    .where(eq(practiceAnswers.sessionId, sessionId));

  const answeredCount = answers.length;
  const correctCount = answers.filter((answer) => answer.isCorrect).length;

  await db
    .update(practiceSessions)
    .set({
      durationSeconds,
      correctCount,
      accuracyPct: answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0,
      completedAt: new Date(),
    })
    .where(eq(practiceSessions.id, sessionId));

  return NextResponse.json({
    persisted: true,
    answeredCount,
    correctCount,
  });
}
