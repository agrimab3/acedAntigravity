import { and, asc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  practiceTestAnswers,
  practiceTestSections,
  practiceTestSessions,
  type PracticeTestQuestionSnapshot,
} from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  summarizeCompositePacing,
  summarizePracticeTestPacing,
} from "@/lib/practice-test-score";
import { getPracticeTestMode } from "@/lib/practice-test-engine";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const session = await getAuthSession();
  const db = getDb();

  if (!session?.user?.id || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { sessionId } = await context.params;

  const [testSession] = await db
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
        eq(practiceTestSessions.id, sessionId),
        eq(practiceTestSessions.userId, session.user.id),
        eq(practiceTestSessions.status, "completed")
      )
    )
    .limit(1);

  if (!testSession) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const sectionRows = await db
    .select({
      id: practiceTestSections.id,
      sectionKey: practiceTestSections.sectionKey,
      sectionOrder: practiceTestSections.sectionOrder,
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
    .orderBy(asc(practiceTestSections.sectionOrder));

  const missedAnswerRows = await db
    .select({
      id: practiceTestAnswers.id,
      sectionRunId: practiceTestAnswers.sectionRunId,
      sectionKey: practiceTestSections.sectionKey,
      sectionTitle: practiceTestSections.title,
      sectionOrder: practiceTestSections.sectionOrder,
      questionOrder: practiceTestAnswers.questionOrder,
      topicName: practiceTestAnswers.topicName,
      selectedAnswer: practiceTestAnswers.selectedAnswer,
      correctAnswer: practiceTestAnswers.correctAnswer,
      flagged: practiceTestAnswers.flagged,
      questionSnapshot: practiceTestAnswers.questionSnapshot,
    })
    .from(practiceTestAnswers)
    .innerJoin(practiceTestSections, eq(practiceTestAnswers.sectionRunId, practiceTestSections.id))
    .where(
      and(
        eq(practiceTestAnswers.sessionId, sessionId),
        eq(practiceTestAnswers.userId, session.user.id),
        eq(practiceTestAnswers.isCorrect, false),
        isNotNull(practiceTestAnswers.selectedAnswer)
      )
    )
    .orderBy(asc(practiceTestSections.sectionOrder), asc(practiceTestAnswers.questionOrder));

  const mode = getPracticeTestMode(testSession.modeKey);
  const sectionReports = sectionRows.map((section) => ({
    ...section,
    pacingSummary: summarizePracticeTestPacing({
      sectionKey: section.sectionKey as "english" | "math" | "reading" | "science",
      questionCount: section.questionCount,
      answeredCount: section.answeredCount,
      durationSeconds: section.durationSeconds,
      timeLimitSeconds: section.timeLimitSeconds,
    }),
  }));

  return NextResponse.json({
    sessionId: testSession.id,
    modeKey: testSession.modeKey,
    title: mode?.title ?? testSession.modeKey,
    format: testSession.format,
    totalQuestionCount: testSession.totalQuestionCount,
    answeredCount: testSession.answeredCount,
    correctCount: testSession.correctCount,
    accuracyPct: testSession.accuracyPct,
    compositeEstimatedScore: testSession.compositeEstimatedScore,
    durationSeconds: testSession.durationSeconds,
    completedAt: testSession.completedAt,
    overallPacing: summarizeCompositePacing(sectionReports.map((section) => section.pacingSummary)),
    sectionReports,
    missedQuestions: missedAnswerRows.map((row) => ({
      id: row.id,
      sectionRunId: row.sectionRunId,
      sectionKey: row.sectionKey,
      sectionTitle: row.sectionTitle,
      sectionOrder: row.sectionOrder,
      questionOrder: row.questionOrder,
      topicName: row.topicName,
      selectedAnswer: row.selectedAnswer,
      correctAnswer: row.correctAnswer,
      flagged: row.flagged,
      question: row.questionSnapshot as PracticeTestQuestionSnapshot,
    })),
  });
}
