import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  mockRegistrations,
  mockTestAnswers,
  mockTestFormQuestions,
  mockTestSectionRuns,
  mockTestSessions,
  mockTestTopicResults,
  mockTests,
  questions,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import { shouldRevealMockResults } from "@/lib/mockTest/release-policy";
import {
  canBypassMockEventWindow,
  getPaidMockRegistration,
} from "@/lib/mockTest/runner";

export async function GET(request: Request) {
  const user = await getMockTestUser();
  const db = getDb();

  if (!user || !db) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const registration = await getPaidMockRegistration(user.id);
  if (!registration) {
    return NextResponse.json({ error: "Paid mock-test registration required." }, { status: 403 });
  }

  const [mockTest] = await db
    .select({
      status: mockTests.status,
      resultsReleaseAt: mockTests.resultsReleaseAt,
      compositeDistribution: mockTests.compositeDistribution,
      actDate: mockTests.actDate,
    })
    .from(mockTests)
    .where(eq(mockTests.id, registration.mockTestId))
    .limit(1);

  if (!mockTest) {
    return NextResponse.json({ error: "Mock test not found." }, { status: 404 });
  }

  const [finishedCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mockRegistrations)
    .where(
      and(
        eq(mockRegistrations.mockTestId, registration.mockTestId),
        isNotNull(mockRegistrations.finishedAt)
      )
    );
  const finishedCount = Number(finishedCountRow?.count ?? 0);

  const url = new URL(request.url);
  const previewReleased =
    canBypassMockEventWindow() && url.searchParams.get("previewReleased") === "1";
  const previewCountdown =
    canBypassMockEventWindow() && url.searchParams.get("previewCountdown") === "1";
  const releaseAt = mockTest.resultsReleaseAt;

  if (previewCountdown) {
    return NextResponse.json({
      released: false,
      releaseAt: releaseAt.toISOString(),
      cohortCount: finishedCount,
    });
  }
  const now = previewReleased
    ? new Date(releaseAt.getTime() + 1000)
    : getMockTestServerNow();

  if (
    !shouldRevealMockResults({
      status: mockTest.status,
      now,
      releaseAt,
    })
  ) {
    return NextResponse.json({
      released: false,
      releaseAt: releaseAt.toISOString(),
      cohortCount: finishedCount,
    });
  }

  const [session] = await db
    .select({
      id: mockTestSessions.id,
      formId: mockTestSessions.formId,
      status: mockTestSessions.status,
    })
    .from(mockTestSessions)
    .where(eq(mockTestSessions.registrationId, registration.id))
    .limit(1);

  if (!session || session.status !== "completed") {
    return NextResponse.json({
      released: true,
      completed: false,
      releaseAt: releaseAt.toISOString(),
    });
  }

  if (
    registration.englishScore === null ||
    registration.mathScore === null ||
    registration.readingScore === null ||
    registration.scienceScore === null ||
    registration.composite === null ||
    registration.percentile === null
  ) {
    return NextResponse.json(
      { error: "Released mock result is incomplete." },
      { status: 500 }
    );
  }

  const rows = await db
    .select({
      sectionKey: mockTestSectionRuns.sectionKey,
      questionOrder: mockTestAnswers.questionOrder,
      topicName: mockTestFormQuestions.topicNameSnapshot,
      prompt: questions.prompt,
      choices: questions.choices,
      selectedAnswer: mockTestAnswers.selectedAnswer,
      correctAnswer: mockTestFormQuestions.correctAnswerSnapshot,
      explanation: questions.explanation,
    })
    .from(mockTestAnswers)
    .innerJoin(
      mockTestSectionRuns,
      eq(mockTestAnswers.sectionRunId, mockTestSectionRuns.id)
    )
    .innerJoin(
      mockTestFormQuestions,
      and(
        eq(mockTestFormQuestions.formId, session.formId),
        eq(mockTestFormQuestions.questionId, mockTestAnswers.questionId)
      )
    )
    .innerJoin(questions, eq(mockTestAnswers.questionId, questions.id))
    .where(eq(mockTestAnswers.sessionId, session.id))
    .orderBy(
      asc(mockTestSectionRuns.sectionOrder),
      asc(mockTestAnswers.questionOrder)
    );

  const sectionStats: Record<string, { correct: number; total: number }> = {
    english: { correct: 0, total: 0 },
    math: { correct: 0, total: 0 },
    reading: { correct: 0, total: 0 },
    science: { correct: 0, total: 0 },
  };

  const answers = rows.map((row) => {
    const isCorrect =
      row.selectedAnswer !== null &&
      row.selectedAnswer === row.correctAnswer;
    const stats = sectionStats[row.sectionKey];
    if (stats) {
      stats.total += 1;
      if (isCorrect) stats.correct += 1;
    }

    return {
      sectionKey: row.sectionKey,
      questionOrder: row.questionOrder,
      topicName: row.topicName,
      prompt: row.prompt,
      choices: row.choices,
      selectedAnswer: row.selectedAnswer,
      correctAnswer: row.correctAnswer,
      explanation: row.explanation,
      isCorrect,
    };
  });

  const topicRows = await db
    .select({
      sectionKey: mockTestTopicResults.sectionKey,
      topicId: mockTestTopicResults.topicId,
      topicName: mockTestTopicResults.topicName,
      correct: mockTestTopicResults.correctCount,
      total: mockTestTopicResults.totalCount,
    })
    .from(mockTestTopicResults)
    .where(eq(mockTestTopicResults.registrationId, registration.id));

  const topicBreakdown = topicRows
    .map((item) => ({
      ...item,
      accuracyPct: item.total
        ? Math.round((item.correct / item.total) * 100)
        : 0,
    }))
    .sort((a, b) => a.accuracyPct - b.accuracyPct || b.total - a.total);

  const distribution = mockTest.compositeDistribution ?? {};
  const cohortCount = Object.values(distribution).reduce(
    (sum, count) => sum + Number(count),
    0
  );

  return NextResponse.json({
    released: true,
    completed: true,
    releaseAt: releaseAt.toISOString(),
    timeZone: registration.timeZone,
    scoringLabel: "ACED estimated ACT score",
    scoringNote: "Estimated scores, not official ACT scores.",
    composite: registration.composite,
    percentile: registration.percentile,
    sectionScores: {
      english: registration.englishScore,
      math: registration.mathScore,
      reading: registration.readingScore,
      science: registration.scienceScore,
    },
    sectionStats,
    topicBreakdown,
    compositeDistribution: distribution,
    cohortCount,
    actDate: mockTest.actDate,
    answers,
  });
}
