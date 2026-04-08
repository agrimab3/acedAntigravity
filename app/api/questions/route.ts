import { and, eq, sql } from "drizzle-orm";
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
  chooseDifficultyBand,
  getDifficultySweep,
  normalizeDifficultyBand,
} from "@/lib/adaptive";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMockQuestions } from "@/lib/mock-questions";

const sectionSchema = z.enum(["english", "math", "reading", "science"]);
const searchSchema = z.object({
  section: sectionSchema,
  topic: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(10).default(10),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    section: url.searchParams.get("section"),
    topic: url.searchParams.get("topic") ?? undefined,
    limit: url.searchParams.get("limit") ?? 10,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid practice query parameters." },
      { status: 400 }
    );
  }

  const { section, topic, limit } = parsed.data;
  const db = getDb();
  const session = await getAuthSession();
  const userId = session?.user?.id || null;
  let targetDifficulty = "easy";
  let topicId: string | null = null;

  if (db) {
    if (topic) {
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

    if (userId && topicId) {
      const [skillStateRow] = await db
        .select({
          currentDifficulty: topicSkillState.currentDifficulty,
          recentAccuracyPct: topicSkillState.recentAccuracyPct,
          rollingAccuracyPct: topicSkillState.rollingAccuracyPct,
          correctStreak: topicSkillState.correctStreak,
          incorrectStreak: topicSkillState.incorrectStreak,
          totalAnswered: topicSkillState.totalAnswered,
        })
        .from(topicSkillState)
        .where(and(eq(topicSkillState.userId, userId), eq(topicSkillState.topicId, topicId)))
        .limit(1);

      if (skillStateRow) {
        targetDifficulty = chooseDifficultyBand(skillStateRow);
      } else {
        const [masteryRow] = await db
          .select({
            masteryPct: topicMastery.masteryPct,
          })
          .from(topicMastery)
          .where(and(eq(topicMastery.userId, userId), eq(topicMastery.topicId, topicId)))
          .limit(1);

        const masteryPct = masteryRow?.masteryPct ?? 0;
        targetDifficulty =
          masteryPct >= 80 ? "hard" : masteryPct >= 60 ? "medium" : normalizeDifficultyBand();
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
            eq(actTopics.name, topic),
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
            .limit(limit)
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
            .limit(limit);

      for (const row of rows) {
        if (!selectedRows.has(row.id)) {
          selectedRows.set(row.id, {
            id: row.id,
            section: row.section,
            topic: row.topic,
            difficulty: row.difficulty,
            passage: row.passage,
            question_text: row.question_text,
            choices: row.choices,
            correct_answer: row.correct_answer,
            explanation: row.explanation,
          });
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
      source: "mock",
    },
  });
}
