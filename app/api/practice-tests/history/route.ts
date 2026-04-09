import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { practiceTestSections, practiceTestSessions } from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  summarizeCompositePacing,
  summarizePracticeTestPacing,
} from "@/lib/practice-test-score";
import { getPracticeTestMode } from "@/lib/practice-test-engine";

export async function GET() {
  const session = await getAuthSession();
  const db = getDb();

  if (!session?.user?.id || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userId = session.user.id;
  const sessions = await db
    .select({
      id: practiceTestSessions.id,
      modeKey: practiceTestSessions.modeKey,
      format: practiceTestSessions.format,
      totalQuestionCount: practiceTestSessions.totalQuestionCount,
      answeredCount: practiceTestSessions.answeredCount,
      correctCount: practiceTestSessions.correctCount,
      accuracyPct: practiceTestSessions.accuracyPct,
      compositeEstimatedScore: practiceTestSessions.compositeEstimatedScore,
      durationSeconds: practiceTestSessions.durationSeconds,
      completedAt: practiceTestSessions.completedAt,
    })
    .from(practiceTestSessions)
    .where(
      and(
        eq(practiceTestSessions.userId, userId),
        eq(practiceTestSessions.status, "completed")
      )
    )
    .orderBy(desc(practiceTestSessions.completedAt))
    .limit(8);

  if (sessions.length === 0) {
    return NextResponse.json({ history: [] });
  }

  const sessionIds = sessions.map((entry) => entry.id);
  const sections = await db
    .select({
      sessionId: practiceTestSections.sessionId,
      sectionOrder: practiceTestSections.sectionOrder,
      sectionKey: practiceTestSections.sectionKey,
      title: practiceTestSections.title,
      questionCount: practiceTestSections.questionCount,
      answeredCount: practiceTestSections.answeredCount,
      correctCount: practiceTestSections.correctCount,
      accuracyPct: practiceTestSections.accuracyPct,
      estimatedScore: practiceTestSections.estimatedScore,
      timeLimitSeconds: practiceTestSections.timeLimitSeconds,
      durationSeconds: practiceTestSections.durationSeconds,
    })
    .from(practiceTestSections)
    .where(eq(practiceTestSections.sessionId, sessionIds[0]));

  const allSections = await Promise.all(
    sessionIds.slice(1).map((sessionId) =>
      db
        .select({
          sessionId: practiceTestSections.sessionId,
          sectionOrder: practiceTestSections.sectionOrder,
          sectionKey: practiceTestSections.sectionKey,
          title: practiceTestSections.title,
          questionCount: practiceTestSections.questionCount,
          answeredCount: practiceTestSections.answeredCount,
          correctCount: practiceTestSections.correctCount,
          accuracyPct: practiceTestSections.accuracyPct,
          estimatedScore: practiceTestSections.estimatedScore,
          timeLimitSeconds: practiceTestSections.timeLimitSeconds,
          durationSeconds: practiceTestSections.durationSeconds,
        })
        .from(practiceTestSections)
        .where(eq(practiceTestSections.sessionId, sessionId))
    )
  );

  const sectionRows = [...sections, ...allSections.flat()];
  const sectionsBySessionId = new Map<string, typeof sectionRows>();

  sectionRows.forEach((row) => {
    const current = sectionsBySessionId.get(row.sessionId) ?? [];
    current.push(row);
    sectionsBySessionId.set(row.sessionId, current);
  });

  return NextResponse.json({
    history: sessions.map((entry) => {
      const mode = getPracticeTestMode(entry.modeKey);
      const sectionRowsForSession = (sectionsBySessionId.get(entry.id) ?? []).sort(
        (left, right) => left.sectionOrder - right.sectionOrder
      );
      const sectionSummaries = sectionRowsForSession.map((section) => ({
        ...section,
        pacingSummary: summarizePracticeTestPacing({
          sectionKey: section.sectionKey as "english" | "math" | "reading" | "science",
          questionCount: section.questionCount,
          answeredCount: section.answeredCount,
          durationSeconds: section.durationSeconds,
          timeLimitSeconds: section.timeLimitSeconds,
        }),
      }));

      return {
        sessionId: entry.id,
        modeKey: entry.modeKey,
        title: mode?.title ?? entry.modeKey,
        shortLabel: mode?.shortLabel ?? entry.modeKey,
        format: entry.format,
        totalQuestionCount: entry.totalQuestionCount,
        answeredCount: entry.answeredCount,
        correctCount: entry.correctCount,
        accuracyPct: entry.accuracyPct,
        compositeEstimatedScore: entry.compositeEstimatedScore,
        durationSeconds: entry.durationSeconds,
        completedAt: entry.completedAt,
        overallPacing: summarizeCompositePacing(
          sectionSummaries.map((section) => section.pacingSummary)
        ),
        sections: sectionSummaries,
      };
    }),
  });
}
