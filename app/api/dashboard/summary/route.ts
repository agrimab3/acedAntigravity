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
}>(summary: T, timedScores: number[]) {
  if (timedScores.length === 0) {
    return summary;
  }

  const recentScores = timedScores.slice(0, 3);
  const practiceAverage =
    recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
  const blendWeight = Math.min(0.62, 0.34 + (recentScores.length - 1) * 0.1);
  const timedConfidence = clamp(0.58 + recentScores.length * 0.12, 0, 0.94);
  const estimatedScore = Math.round(
    summary.estimatedScore * (1 - blendWeight) + practiceAverage * blendWeight
  );
  const confidence = clamp(
    summary.confidence * (1 - blendWeight * 0.85) + timedConfidence * blendWeight,
    0,
    1
  );
  const answeredCount = summary.answeredCount + recentScores.length * 6;

  return {
    ...summary,
    estimatedScore,
    confidence,
    answeredCount,
    scoreLabel: getEstimateLabel(confidence, answeredCount),
    scoreExplanation: `${summary.scoreExplanation} Completed timed ${summary.sectionKey} test${recentScores.length === 1 ? "" : "s"} are now pulling this estimate closer to real ACT pacing.`,
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

  const timedSectionScores = new Map<string, number[]>();

  completedSectionTests.forEach((row) => {
    if (row.estimatedScore === null) {
      return;
    }
    const current = timedSectionScores.get(row.sectionKey) ?? [];
    current.push(row.estimatedScore);
    timedSectionScores.set(row.sectionKey, current);
  });

  const blendedSectionSummaries = sectionSummaries.map((summary) =>
    blendSectionWithPracticeTest(summary, timedSectionScores.get(summary.sectionKey) ?? [])
  );

  const composite = estimateCompositeScore(blendedSectionSummaries);
  const completedFullTests = await db
    .select({
      compositeEstimatedScore: practiceTestSessions.compositeEstimatedScore,
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
    .map((row) => row.compositeEstimatedScore)
    .filter((score): score is number => score !== null);
  const blendedComposite =
    timedCompositeScores.length > 0
      ? (() => {
          const timedAverage =
            timedCompositeScores.reduce((sum, score) => sum + score, 0) /
            timedCompositeScores.length;
          const blendWeight = timedCompositeScores.length > 1 ? 0.62 : 0.48;
          const confidence = clamp(
            composite.confidence * (1 - blendWeight * 0.8) +
              clamp(0.66 + timedCompositeScores.length * 0.12, 0, 0.96) * blendWeight,
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
            scoreExplanation: `${composite.scoreExplanation} Completed full-length practice test${timedCompositeScores.length === 1 ? "" : "s"} are now shaping this overall estimate too.`,
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
