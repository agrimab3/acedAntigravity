import { and, asc, desc, eq, gt, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  actTopics,
  practiceSessions,
  practiceTestSections,
  practiceTestSessions,
  topicMastery,
} from "@/db/schema";
import { getEligibleAccountSession } from "@/lib/account-consent";
import { getDb } from "@/lib/db";
import { getPracticeTestMode } from "@/lib/practice-test-engine";
import { getPracticeStreaks } from "@/lib/practice-streak.mjs";

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export async function GET() {
  const session = await getEligibleAccountSession();
  const db = getDb();

  if (!session?.userId || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userId = session.userId;

  const [drillRows, testRows, masteryRows, scoreTrendRows, weakestSkillRows] = await Promise.all([
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
    db
      .select({
        sessionId: practiceTestSessions.id,
        sectionKey: practiceTestSections.sectionKey,
        estimatedScore: practiceTestSections.estimatedScore,
        completedAt: practiceTestSessions.completedAt,
      })
      .from(practiceTestSections)
      .innerJoin(practiceTestSessions, eq(practiceTestSections.sessionId, practiceTestSessions.id))
      .where(
        and(
          eq(practiceTestSessions.userId, userId),
          eq(practiceTestSessions.status, "completed"),
          isNotNull(practiceTestSessions.completedAt),
          isNotNull(practiceTestSections.estimatedScore)
        )
      )
      .orderBy(asc(practiceTestSessions.completedAt), asc(practiceTestSections.sectionOrder)),
    db
      .select({
        sectionKey: actTopics.sectionKey,
        topicName: actTopics.name,
        masteryPct: topicMastery.masteryPct,
      })
      .from(topicMastery)
      .innerJoin(actTopics, eq(topicMastery.topicId, actTopics.id))
      .where(
        and(
          eq(topicMastery.userId, userId),
          eq(actTopics.isActive, true),
          gt(topicMastery.attemptCount, 0)
        )
      )
      .orderBy(asc(topicMastery.masteryPct), desc(topicMastery.attemptCount))
      .limit(5),
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
    streaks: getPracticeStreaks([...drillRows, ...testRows].map(row => row.completedAt)),
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
      averageAccuracyPct: average([
        ...drillRows.map((row) => row.accuracyPct),
        ...testRows.map((row) => row.accuracyPct),
      ]),
      averageDrillAccuracyPct: average(drillRows.map((row) => row.accuracyPct)),
      averageTestAccuracyPct: average(testRows.map((row) => row.accuracyPct)),
      litStars: masteryRows.filter((row) => row.attemptCount > 0).length,
      strongStars: masteryRows.filter((row) => row.masteryPct >= 75).length,
    },
    sectionProgress,
    scoreTrend: scoreTrendRows.flatMap((row) =>
      row.estimatedScore && row.completedAt
        ? [{
            sessionId: row.sessionId,
            sectionKey: row.sectionKey,
            score: row.estimatedScore,
            completedAt: row.completedAt.toISOString(),
          }]
        : []
    ),
    weakestSkills: weakestSkillRows.map((row) => ({
      sectionKey: row.sectionKey,
      topicName: row.topicName,
      masteryPct: row.masteryPct,
    })),
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
