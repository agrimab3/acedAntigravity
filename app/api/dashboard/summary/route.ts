import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  actTopics,
  practiceTestSections,
  practiceTestSessions,
  topicMastery,
  topicSkillState,
} from "@/db/schema";
import {
  estimateCompositeScore,
  estimateSectionScore,
  estimateTopicScore,
} from "@/lib/act-score";
import { summarizePracticeTestPacing } from "@/lib/practice-test-score";
import { ACT_TAXONOMY } from "@/lib/act-taxonomy";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getEstimateLabel(confidence: number, sampleCount: number) {
  if (sampleCount < 3 || confidence < 0.28) {
    return "baseline estimate" as const;
  }

  if (sampleCount < 8 || confidence < 0.68) {
    return "building estimate" as const;
  }

  return "live estimate" as const;
}

function blendSectionWithPracticeTest<T extends {
  sectionKey: string;
  estimatedScore: number;
  confidence: number;
  answeredCount: number;
  topicsAttempted: number;
  scoreExplanation: string;
}>(
  summary: T,
  timedSignals: Array<{
    estimatedScore: number;
    answeredCount: number;
    questionCount: number;
    durationSeconds: number;
    timeLimitSeconds: number;
    accuracyPct: number;
  }>
) {
  if (timedSignals.length === 0) {
    return summary;
  }

  const recentSignals = timedSignals.slice(0, 3);
  const weightedSignals = recentSignals.map((signal, index) => {
    const pacing = summarizePracticeTestPacing({
      sectionKey: summary.sectionKey as "english" | "math" | "reading" | "science",
      questionCount: signal.questionCount,
      answeredCount: signal.answeredCount,
      durationSeconds: signal.durationSeconds,
      timeLimitSeconds: signal.timeLimitSeconds,
    });
    const recencyWeight = Math.max(0.72, 1 - index * 0.14);
    const completionWeight = clamp(signal.answeredCount / Math.max(signal.questionCount, 1), 0.4, 1);
    const pacingWeight =
      pacing.tone === "steady" ? 1.14 : pacing.tone === "ahead" ? 1.08 : 0.88;
    const accuracyWeight = clamp(signal.accuracyPct / 100, 0.55, 1);
    const weight = recencyWeight * completionWeight * pacingWeight * accuracyWeight;

    return {
      ...signal,
      pacing,
      weight,
    };
  });

  const weightTotal = weightedSignals.reduce((sum, signal) => sum + signal.weight, 0) || 1;
  const practiceAverage =
    weightedSignals.reduce((sum, signal) => sum + signal.estimatedScore * signal.weight, 0) /
    weightTotal;
  const blendWeight = Math.min(0.74, 0.42 + (weightedSignals.length - 1) * 0.1);
  const timedConfidence = clamp(
    weightedSignals.reduce((sum, signal) => sum + signal.weight, 0) / weightedSignals.length,
    0.62,
    0.96
  );
  const estimatedScore = Math.round(
    summary.estimatedScore * (1 - blendWeight) + practiceAverage * blendWeight
  );
  const confidence = clamp(
    summary.confidence * (1 - blendWeight * 0.85) + timedConfidence * blendWeight,
    0,
    1
  );
  const answeredCount = summary.answeredCount + recentSignals.length * 8;

  return {
    ...summary,
    estimatedScore,
    confidence,
    answeredCount,
    scoreLabel: getEstimateLabel(confidence, answeredCount),
    scoreExplanation: `${summary.scoreExplanation} Completed timed ${summary.sectionKey} test${recentSignals.length === 1 ? "" : "s"} with real pacing are now pulling this estimate closer to actual ACT performance.`,
  };
}

export async function GET() {
  const session = await getAuthSession();
  const db = getDb();

  if (!session?.user?.id || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userId = session.user.id;
  const topics = await db
    .select({
      sectionKey: actTopics.sectionKey,
      topicName: actTopics.name,
      masteryPct: topicMastery.masteryPct,
      totalAnswered: topicSkillState.totalAnswered,
      rollingAccuracyPct: topicSkillState.rollingAccuracyPct,
      currentDifficulty: topicSkillState.currentDifficulty,
      averageTimeSpentSeconds: topicSkillState.averageTimeSpentSeconds,
      hintsUsed: topicSkillState.hintsUsed,
    })
    .from(actTopics)
    .leftJoin(
      topicMastery,
      and(eq(topicMastery.topicId, actTopics.id), eq(topicMastery.userId, userId))
    )
    .leftJoin(
      topicSkillState,
      and(eq(topicSkillState.topicId, actTopics.id), eq(topicSkillState.userId, userId))
    )
    .where(eq(actTopics.isActive, true));

  const topicSummaries = topics.map((topic) => {
    const summary = estimateTopicScore({
      sectionKey: topic.sectionKey,
      topicName: topic.topicName,
      masteryPct: topic.masteryPct,
      rollingAccuracyPct: topic.rollingAccuracyPct,
      currentDifficulty: topic.currentDifficulty,
      totalAnswered: topic.totalAnswered,
      averageTimeSpentSeconds: topic.averageTimeSpentSeconds,
      hintsUsed: topic.hintsUsed,
    });

    return summary;
  });

  const sectionSummaries = ACT_TAXONOMY.map((section) =>
    estimateSectionScore(
      section.key,
      topicSummaries.filter((topic) => topic.sectionKey === section.key)
    )
  );

  const completedSectionTests = await db
    .select({
      sectionKey: practiceTestSections.sectionKey,
      estimatedScore: practiceTestSections.estimatedScore,
      answeredCount: practiceTestSections.answeredCount,
      questionCount: practiceTestSections.questionCount,
      durationSeconds: practiceTestSections.durationSeconds,
      timeLimitSeconds: practiceTestSections.timeLimitSeconds,
      accuracyPct: practiceTestSections.accuracyPct,
    })
    .from(practiceTestSections)
    .innerJoin(practiceTestSessions, eq(practiceTestSections.sessionId, practiceTestSessions.id))
    .where(
      and(
        eq(practiceTestSessions.userId, userId),
        eq(practiceTestSessions.status, "completed"),
        isNotNull(practiceTestSections.estimatedScore)
      )
    )
    .orderBy(desc(practiceTestSections.completedAt), desc(practiceTestSections.updatedAt));

  const timedSectionScores = new Map<
    string,
    Array<{
      estimatedScore: number;
      answeredCount: number;
      questionCount: number;
      durationSeconds: number;
      timeLimitSeconds: number;
      accuracyPct: number;
    }>
  >();

  completedSectionTests.forEach((row) => {
    if (row.estimatedScore === null) {
      return;
    }
    const current = timedSectionScores.get(row.sectionKey) ?? [];
    current.push({
      estimatedScore: row.estimatedScore,
      answeredCount: row.answeredCount,
      questionCount: row.questionCount,
      durationSeconds: row.durationSeconds,
      timeLimitSeconds: row.timeLimitSeconds,
      accuracyPct: row.accuracyPct,
    });
    timedSectionScores.set(row.sectionKey, current);
  });

  const blendedSectionSummaries = sectionSummaries.map((summary) =>
    blendSectionWithPracticeTest(summary, timedSectionScores.get(summary.sectionKey) ?? [])
  );

  const composite = estimateCompositeScore(blendedSectionSummaries);
  const completedFullTests = await db
    .select({
      compositeEstimatedScore: practiceTestSessions.compositeEstimatedScore,
      answeredCount: practiceTestSessions.answeredCount,
      totalQuestionCount: practiceTestSessions.totalQuestionCount,
      durationSeconds: practiceTestSessions.durationSeconds,
    })
    .from(practiceTestSessions)
    .where(
      and(
        eq(practiceTestSessions.userId, userId),
        eq(practiceTestSessions.status, "completed"),
        eq(practiceTestSessions.format, "full"),
        isNotNull(practiceTestSessions.compositeEstimatedScore)
      )
    )
    .orderBy(desc(practiceTestSessions.completedAt), desc(practiceTestSessions.updatedAt))
    .limit(2);

  const timedCompositeScores = completedFullTests
    .filter((row) => row.compositeEstimatedScore !== null)
    .map((row, index) => {
      const completionWeight = clamp(
        row.answeredCount / Math.max(row.totalQuestionCount, 1),
        0.45,
        1
      );
      const recencyWeight = Math.max(0.76, 1 - index * 0.12);
      const targetSecondsPerQuestion =
        (165 * 60) / Math.max(row.totalQuestionCount, 1);
      const avgSecondsPerAnswered =
        row.durationSeconds / Math.max(row.answeredCount, 1);
      const pacingWeight =
        avgSecondsPerAnswered <= targetSecondsPerQuestion + 6 ? 1.12 : 0.9;

      return {
        score: row.compositeEstimatedScore as number,
        weight: completionWeight * recencyWeight * pacingWeight,
      };
    });
  const blendedComposite =
    timedCompositeScores.length > 0
      ? (() => {
          const totalWeight =
            timedCompositeScores.reduce((sum, row) => sum + row.weight, 0) || 1;
          const timedAverage =
            timedCompositeScores.reduce((sum, row) => sum + row.score * row.weight, 0) /
            totalWeight;
          const blendWeight = timedCompositeScores.length > 1 ? 0.68 : 0.54;
          const confidence = clamp(
            composite.confidence * (1 - blendWeight * 0.8) +
              clamp(
                timedCompositeScores.reduce((sum, row) => sum + row.weight, 0) /
                  timedCompositeScores.length,
                0.7,
                0.97
              ) *
                blendWeight,
            0,
            1
          );
          const estimatedScore = Math.round(
            composite.estimatedScore * (1 - blendWeight) + timedAverage * blendWeight
          );

          return {
            estimatedScore,
            confidence,
            scoreLabel: getEstimateLabel(
              confidence,
              blendedSectionSummaries.reduce((sum, section) => sum + section.answeredCount, 0) +
                timedCompositeScores.length * 18
            ),
            scoreExplanation: `${composite.scoreExplanation} Completed full-length practice test${timedCompositeScores.length === 1 ? "" : "s"} are now shaping this overall estimate more aggressively because they reflect real ACT pacing and endurance.`,
          };
        })()
      : composite;

  return NextResponse.json({
    compositeEstimatedScore: blendedComposite.estimatedScore,
    confidence: blendedComposite.confidence,
    scoreLabel: blendedComposite.scoreLabel,
    scoreExplanation: blendedComposite.scoreExplanation,
    sectionSummaries: blendedSectionSummaries,
    topicSummaries,
    practiceTestSignal: {
      completedSectionTests: completedSectionTests.length,
      completedFullTests: timedCompositeScores.length,
    },
  });
}
