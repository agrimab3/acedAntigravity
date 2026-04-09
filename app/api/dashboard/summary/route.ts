import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { actTopics, topicMastery, topicSkillState } from "@/db/schema";
import {
  estimateCompositeScore,
  estimateSectionScore,
  estimateTopicScore,
} from "@/lib/act-score";
import { ACT_TAXONOMY } from "@/lib/act-taxonomy";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

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
      topicName: topic.topicName,
      masteryPct: topic.masteryPct,
      rollingAccuracyPct: topic.rollingAccuracyPct,
      currentDifficulty: topic.currentDifficulty,
      totalAnswered: topic.totalAnswered,
    });

    return {
      sectionKey: topic.sectionKey,
      ...summary,
    };
  });

  const sectionSummaries = ACT_TAXONOMY.map((section) =>
    estimateSectionScore(
      section.key,
      topicSummaries.filter((topic) => topic.sectionKey === section.key)
    )
  );

  const composite = estimateCompositeScore(sectionSummaries);

  return NextResponse.json({
    compositeEstimatedScore: composite.estimatedScore,
    confidence: composite.confidence,
    sectionSummaries,
    topicSummaries,
  });
}
