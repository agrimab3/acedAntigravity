import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  actTopics,
  practiceSessions,
  practiceTestSessions,
  topicMastery,
} from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getPracticeTestMode } from "@/lib/practice-test-engine";

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export async function GET() {
  const session = await getAuthSession();
  const db = getDb();

  if (!session?.user?.id || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userId = session.user.id;

  const [drillRows, testRows, masteryRows] = await Promise.all([
    db
      .select({
        id: practiceSessions.id,
        sectionKey: practiceSessions.sectionKey,
        topicName: actTopics.name,
        questionCount: practiceSessions.questionCount,
        correctCount: practiceSessions.correctCount,
        accuracyPct: practiceSessions.accuracyPct,
        durationSeconds: practiceSessions.durationSeconds,
        completedAt: practiceSessions.completedAt,
      })
      .from(practiceSessions)
      .innerJoin(actTopics, eq(practiceSessions.topicId, actTopics.id))
      .where(
        and(eq(practiceSessions.userId, userId), isNotNull(practiceSessions.completedAt))
      )
      .orderBy(desc(practiceSessions.completedAt)),
    db
      .select({
        id: practiceTestSessions.id,
        modeKey: practiceTestSessions.modeKey,
        format: practiceTestSessions.format,
        accuracyPct: practiceTestSessions.accuracyPct,
        totalQuestionCount: practiceTestSessions.totalQuestionCount,
        compositeEstimatedScore: practiceTestSessions.compositeEstimatedScore,
        durationSeconds: practiceTestSessions.durationSeconds,
        completedAt: practiceTestSessions.completedAt,
      })
      .from(practiceTestSessions)
      .where(
        and(
          eq(practiceTestSessions.userId, userId),
          eq(practiceTestSessions.status, "completed"),
          isNotNull(practiceTestSessions.completedAt)
        )
      )
      .orderBy(desc(practiceTestSessions.completedAt)),
    db
      .select({
        masteryPct: topicMastery.masteryPct,
        attemptCount: topicMastery.attemptCount,
      })
      .from(topicMastery)
      .where(eq(topicMastery.userId, userId)),
  ]);

  const sectionProgress = Array.from(
    drillRows.reduce((map, row) => {
      const current = map.get(row.sectionKey) ?? {
        sectionKey: row.sectionKey,
        completedDrills: 0,
        totalQuestions: 0,
        accuracyValues: [] as number[],
        lastPracticedAt: row.completedAt?.toISOString() ?? null,
      };

      current.completedDrills += 1;
      current.totalQuestions += row.questionCount;
      current.accuracyValues.push(row.accuracyPct);

      if (
        row.completedAt &&
        (!current.lastPracticedAt ||
          new Date(row.completedAt).getTime() > new Date(current.lastPracticedAt).getTime())
      ) {
        current.lastPracticedAt = row.completedAt.toISOString();
      }

      map.set(row.sectionKey, current);
      return map;
    }, new Map<string, {
      sectionKey: string;
      completedDrills: number;
      totalQuestions: number;
      accuracyValues: number[];
      lastPracticedAt: string | null;
    }>())
  ).map(([, value]) => ({
    sectionKey: value.sectionKey,
    completedDrills: value.completedDrills,
    totalQuestions: value.totalQuestions,
    averageAccuracyPct: average(value.accuracyValues),
    lastPracticedAt: value.lastPracticedAt,
  }));

  return NextResponse.json({
    totals: {
      drillsCompleted: drillRows.length,
      testRunsCompleted: testRows.length,
      questionsAnswered:
        drillRows.reduce((sum, row) => sum + row.questionCount, 0) +
        testRows.reduce((sum, row) => sum + row.totalQuestionCount, 0),
      totalMinutes:
        Math.round(
          (drillRows.reduce((sum, row) => sum + row.durationSeconds, 0) +
            testRows.reduce((sum, row) => sum + row.durationSeconds, 0)) /
            60
        ) || 0,
      averageDrillAccuracyPct: average(drillRows.map((row) => row.accuracyPct)),
      averageTestAccuracyPct: average(testRows.map((row) => row.accuracyPct)),
      litStars: masteryRows.filter((row) => row.attemptCount > 0).length,
      strongStars: masteryRows.filter((row) => row.masteryPct >= 75).length,
    },
    sectionProgress,
    recentDrills: drillRows.slice(0, 10).map((row) => ({
      sessionId: row.id,
      sectionKey: row.sectionKey,
      topicName: row.topicName,
      questionCount: row.questionCount,
      correctCount: row.correctCount,
      accuracyPct: row.accuracyPct,
      durationSeconds: row.durationSeconds,
      completedAt: row.completedAt?.toISOString() ?? null,
    })),
    recentTests: testRows.slice(0, 10).map((row) => ({
      sessionId: row.id,
      modeKey: row.modeKey,
      title: getPracticeTestMode(row.modeKey)?.title ?? row.modeKey,
      format: row.format,
      accuracyPct: row.accuracyPct,
      estimatedScore: row.compositeEstimatedScore,
      durationSeconds: row.durationSeconds,
      completedAt: row.completedAt?.toISOString() ?? null,
    })),
  });
}
