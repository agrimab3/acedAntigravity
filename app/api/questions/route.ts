import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  actTopics,
  practiceSessions,
  questionExposures,
  questions,
  topicMastery,
  topicSkillState,
} from "@/db/schema";
import type { ChoiceMap } from "@/db/schema";
import {
  buildAdaptiveFeedback,
  chooseDifficultyBand,
  formatDifficultyBand,
  getDifficultySweep,
  normalizeDifficultyBand,
} from "@/lib/adaptive";
import {
  getPracticeScopeTopics,
  type SectionKey,
} from "@/lib/act-taxonomy";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMockQuestions } from "@/lib/mock-questions";
import { normalizeQuestionRow } from "@/lib/question-utils";

const sectionSchema = z.enum(["english", "math", "reading", "science"]);
const searchSchema = z.object({
  section: sectionSchema,
  topic: z.string().trim().optional(),
  difficulty: z.enum(["foundation", "easy", "medium", "hard", "challenge"]).optional(),
  limit: z.coerce.number().int().min(1).max(10).default(10),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    section: url.searchParams.get("section"),
    topic: url.searchParams.get("topic") ?? undefined,
    difficulty: url.searchParams.get("difficulty") ?? undefined,
    limit: url.searchParams.get("limit") ?? 10,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid practice query parameters." },
      { status: 400 }
    );
  }

  const { section, topic, difficulty, limit } = parsed.data;
  const db = getDb();
  const session = await getAuthSession();
  const userId = session?.user?.id || null;
  let targetDifficulty = "easy";
  let adaptiveFeedback = buildAdaptiveFeedback({
    previousDifficulty: "easy",
    nextDifficulty: "easy",
    totalAnswered: 0,
  });
  let topicId: string | null = null;
  let practiceScopeTopicNames = topic ? [topic] : [];

  if (db) {
    if (topic) {
      practiceScopeTopicNames = getPracticeScopeTopics(section as SectionKey, topic).map(
        (topicDefinition) => topicDefinition.name
      );
      if (practiceScopeTopicNames.length === 0) {
        practiceScopeTopicNames = [topic];
      }

      const [topicRow] = await db
        .select({
          id: actTopics.id,
          name: actTopics.name,
        })
        .from(actTopics)
        .where(and(eq(actTopics.sectionKey, section), eq(actTopics.name, topic)))
        .limit(1);

      topicId = topicRow?.id ?? null;
    }

    if (difficulty) {
      targetDifficulty = normalizeDifficultyBand(difficulty);
      adaptiveFeedback = {
        direction: "steady",
        label: "recovery drill",
        description: `Aced is starting this session at ${formatDifficultyBand(targetDifficulty)} so you can rebuild the pattern from your timed-test report.`,
      };
    } else if (userId && topicId) {
      const skillStateRows = await db
        .select({
          topicName: actTopics.name,
          currentDifficulty: topicSkillState.currentDifficulty,
          recentAccuracyPct: topicSkillState.recentAccuracyPct,
          rollingAccuracyPct: topicSkillState.rollingAccuracyPct,
          correctStreak: topicSkillState.correctStreak,
          incorrectStreak: topicSkillState.incorrectStreak,
          totalAnswered: topicSkillState.totalAnswered,
        })
        .from(topicSkillState)
        .innerJoin(actTopics, eq(topicSkillState.topicId, actTopics.id))
        .where(
          and(
            eq(topicSkillState.userId, userId),
            eq(actTopics.sectionKey, section),
            inArray(actTopics.name, practiceScopeTopicNames)
          )
        );

      const directSkillStateRow =
        skillStateRows.find((row) => row.topicName === topic) ??
        skillStateRows.sort((a, b) => b.totalAnswered - a.totalAnswered)[0];

      if (directSkillStateRow) {
        const totalAnsweredAcrossScope = skillStateRows.reduce(
          (sum, row) => sum + row.totalAnswered,
          0
        );
        const aggregateRollingAccuracyPct =
          totalAnsweredAcrossScope > 0
            ? Math.round(
                skillStateRows.reduce(
                  (sum, row) => sum + row.rollingAccuracyPct * row.totalAnswered,
                  0
                ) / totalAnsweredAcrossScope
              )
            : directSkillStateRow.rollingAccuracyPct;
        const aggregateRecentAccuracyPct =
          totalAnsweredAcrossScope > 0
            ? Math.round(
                skillStateRows.reduce(
                  (sum, row) => sum + row.recentAccuracyPct * row.totalAnswered,
                  0
                ) / totalAnsweredAcrossScope
              )
            : directSkillStateRow.recentAccuracyPct;

        targetDifficulty = chooseDifficultyBand({
          currentDifficulty: directSkillStateRow.currentDifficulty,
          recentAccuracyPct: aggregateRecentAccuracyPct,
          rollingAccuracyPct: aggregateRollingAccuracyPct,
          correctStreak: directSkillStateRow.correctStreak,
          incorrectStreak: directSkillStateRow.incorrectStreak,
          totalAnswered: totalAnsweredAcrossScope,
        });
        adaptiveFeedback = buildAdaptiveFeedback({
          previousDifficulty: directSkillStateRow.currentDifficulty,
          nextDifficulty: targetDifficulty,
          recentAccuracyPct: aggregateRecentAccuracyPct,
          rollingAccuracyPct: aggregateRollingAccuracyPct,
          correctStreak: directSkillStateRow.correctStreak,
          incorrectStreak: directSkillStateRow.incorrectStreak,
          totalAnswered: totalAnsweredAcrossScope,
        });
      } else {
        const masteryRows = await db
          .select({
            topicName: actTopics.name,
            masteryPct: topicMastery.masteryPct,
            attemptCount: topicMastery.attemptCount,
          })
          .from(topicMastery)
          .innerJoin(actTopics, eq(topicMastery.topicId, actTopics.id))
          .where(
            and(
              eq(topicMastery.userId, userId),
              eq(actTopics.sectionKey, section),
              inArray(actTopics.name, practiceScopeTopicNames)
            )
          );

        const totalAttemptsAcrossScope = masteryRows.reduce(
          (sum, row) => sum + row.attemptCount,
          0
        );
        const masteryPct =
          totalAttemptsAcrossScope > 0
            ? Math.round(
                masteryRows.reduce((sum, row) => sum + row.masteryPct * row.attemptCount, 0) /
                  totalAttemptsAcrossScope
              )
            : 0;
        targetDifficulty =
          masteryPct >= 80 ? "hard" : masteryPct >= 60 ? "medium" : normalizeDifficultyBand();
        adaptiveFeedback = buildAdaptiveFeedback({
          previousDifficulty: targetDifficulty,
          nextDifficulty: targetDifficulty,
          recentAccuracyPct: masteryPct,
          rollingAccuracyPct: masteryPct,
          totalAnswered: totalAttemptsAcrossScope,
        });
      }
    }

    const difficultySweep = getDifficultySweep(normalizeDifficultyBand(targetDifficulty));
    const selectedRows = new Map<
      string,
      {
        id: string;
        section: string;
        topic: string;
        difficulty: string;
        passage: string | null;
        question_text: string;
        choices: ChoiceMap;
        correct_answer: string;
        explanation: string;
      }
    >();

    for (const difficulty of difficultySweep) {
      const whereClause = topic
        ? and(
            eq(questions.status, "published"),
            eq(actTopics.sectionKey, section),
            inArray(actTopics.name, practiceScopeTopicNames),
            eq(questions.difficulty, difficulty)
          )
        : and(
            eq(questions.status, "published"),
            eq(actTopics.sectionKey, section),
            eq(questions.difficulty, difficulty)
          );

      const rows = userId
        ? await db
            .select({
              id: questions.id,
              section: questions.sectionKey,
              topic: actTopics.name,
              difficulty: questions.difficulty,
              passage: questions.passage,
              question_text: questions.prompt,
              choices: questions.choices,
              correct_answer: questions.correctAnswer,
              explanation: questions.explanation,
            })
            .from(questions)
            .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
            .leftJoin(
              questionExposures,
              and(
                eq(questionExposures.questionId, questions.id),
                eq(questionExposures.userId, userId)
              )
            )
            .where(whereClause)
            .orderBy(sql`coalesce(${questionExposures.timesSeen}, 0) asc`, sql`random()`)
            .limit(limit * 4)
        : await db
            .select({
              id: questions.id,
              section: questions.sectionKey,
              topic: actTopics.name,
              difficulty: questions.difficulty,
              passage: questions.passage,
              question_text: questions.prompt,
              choices: questions.choices,
              correct_answer: questions.correctAnswer,
              explanation: questions.explanation,
            })
            .from(questions)
            .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
            .where(whereClause)
            .orderBy(sql`random()`)
            .limit(limit * 4);

      for (const row of rows) {
        const normalizedRow = normalizeQuestionRow(row);

        if (normalizedRow && !selectedRows.has(normalizedRow.id)) {
          selectedRows.set(normalizedRow.id, normalizedRow);
        }
      }

      if (selectedRows.size >= limit) {
        break;
      }
    }

    const rows = Array.from(selectedRows.values()).slice(0, limit);

    if (rows.length > 0) {
      let practiceSessionId: string | null = null;

      if (userId && topicId) {
        const now = new Date();
        const [sessionRow] = await db
          .insert(practiceSessions)
          .values({
            userId,
            sectionKey: section,
            topicId,
            questionCount: rows.length,
          })
          .returning({ id: practiceSessions.id });

        practiceSessionId = sessionRow?.id ?? null;

        await Promise.all(
          rows.map((question) =>
            db
              .insert(questionExposures)
              .values({
                userId,
                questionId: question.id,
                timesSeen: 1,
                firstSeenAt: now,
                lastSeenAt: now,
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: [questionExposures.userId, questionExposures.questionId],
                set: {
                  timesSeen: sql`${questionExposures.timesSeen} + 1`,
                  lastSeenAt: now,
                  updatedAt: now,
                },
              })
          )
        );
      }

      return NextResponse.json({
        questions: rows,
        sessionId: practiceSessionId,
        adaptive: {
          targetDifficulty,
          label: adaptiveFeedback.label,
          description: adaptiveFeedback.description,
          direction: adaptiveFeedback.direction,
          source: "database",
        },
      });
    }
  }

  return NextResponse.json({
    questions: buildMockQuestions(section, topic ?? "", limit, targetDifficulty),
    source: "mock",
    sessionId: null,
    adaptive: {
      targetDifficulty,
      label: adaptiveFeedback.label,
      description: adaptiveFeedback.description,
      direction: adaptiveFeedback.direction,
      source: "mock",
    },
  });
}
