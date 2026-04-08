import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  actTopics,
  practiceAnswers,
  practiceSessions,
  questionExposures,
  questions,
  topicMastery,
  topicSkillState,
} from "@/db/schema";
import { chooseDifficultyBand, normalizeDifficultyBand } from "@/lib/adaptive";
import { isTopicInPracticeScope, type SectionKey } from "@/lib/act-taxonomy";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

const answerSchema = z.object({
  sessionId: z.string().uuid().nullable().optional(),
  questionId: z.string().min(1),
  selectedAnswer: z.enum(["A", "B", "C", "D"]),
  isCorrect: z.boolean(),
  timeSpentSeconds: z.coerce.number().int().min(0).default(0),
  hintCount: z.coerce.number().int().min(0).default(0),
});

export async function POST(request: Request) {
  const parsed = answerSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answer payload." }, { status: 400 });
  }

  const session = await getAuthSession();
  const userId = session?.user?.id;
  const db = getDb();

  if (!userId || !db) {
    return NextResponse.json({ persisted: false });
  }

  const { sessionId, questionId, selectedAnswer, isCorrect, timeSpentSeconds, hintCount } =
    parsed.data;

  if (!sessionId || questionId.startsWith("mock-")) {
    return NextResponse.json({ persisted: false });
  }

  const [questionRow] = await db
    .select({
      id: questions.id,
      topicId: questions.topicId,
      topicName: actTopics.name,
    })
    .from(questions)
    .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
    .where(eq(questions.id, questionId))
    .limit(1);

  const [sessionRow] = await db
    .select({
      id: practiceSessions.id,
      topicId: practiceSessions.topicId,
      sectionKey: practiceSessions.sectionKey,
      topicName: actTopics.name,
      questionCount: practiceSessions.questionCount,
    })
    .from(practiceSessions)
    .innerJoin(actTopics, eq(practiceSessions.topicId, actTopics.id))
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)))
    .limit(1);

  const isAllowedTopic =
    questionRow &&
    sessionRow &&
    isTopicInPracticeScope(
      sessionRow.sectionKey as SectionKey,
      sessionRow.topicName,
      questionRow.topicName
    );

  if (!questionRow || !sessionRow || !isAllowedTopic) {
    return NextResponse.json({ error: "Practice session not found." }, { status: 404 });
  }

  const now = new Date();

  await db.insert(practiceAnswers).values({
    sessionId,
    userId,
    questionId,
    selectedAnswer,
    isCorrect,
    timeSpentSeconds,
  });

  await db
    .insert(questionExposures)
    .values({
      userId,
      questionId,
      timesSeen: 1,
      timesCorrect: isCorrect ? 1 : 0,
      timesIncorrect: isCorrect ? 0 : 1,
      firstSeenAt: now,
      lastSeenAt: now,
      lastAnsweredAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [questionExposures.userId, questionExposures.questionId],
      set: {
        timesCorrect: sql`${questionExposures.timesCorrect} + ${isCorrect ? 1 : 0}`,
        timesIncorrect: sql`${questionExposures.timesIncorrect} + ${isCorrect ? 0 : 1}`,
        lastSeenAt: now,
        lastAnsweredAt: now,
        updatedAt: now,
      },
    });

  const [masteryRow] = await db
    .select({
      correctCount: topicMastery.correctCount,
      attemptCount: topicMastery.attemptCount,
    })
    .from(topicMastery)
    .where(and(eq(topicMastery.userId, userId), eq(topicMastery.topicId, questionRow.topicId)))
    .limit(1);

  const nextAttemptCount = (masteryRow?.attemptCount ?? 0) + 1;
  const nextCorrectCount = (masteryRow?.correctCount ?? 0) + (isCorrect ? 1 : 0);
  const masteryPct = Math.round((nextCorrectCount / nextAttemptCount) * 100);

  await db
    .insert(topicMastery)
    .values({
      userId,
      topicId: questionRow.topicId,
      correctCount: nextCorrectCount,
      attemptCount: nextAttemptCount,
      masteryPct,
      lastPracticedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [topicMastery.userId, topicMastery.topicId],
      set: {
        correctCount: nextCorrectCount,
        attemptCount: nextAttemptCount,
        masteryPct,
        lastPracticedAt: now,
        updatedAt: now,
      },
    });

  const recentAnswers = await db
    .select({
      isCorrect: practiceAnswers.isCorrect,
      timeSpentSeconds: practiceAnswers.timeSpentSeconds,
    })
    .from(practiceAnswers)
    .innerJoin(questions, eq(practiceAnswers.questionId, questions.id))
    .where(and(eq(practiceAnswers.userId, userId), eq(questions.topicId, questionRow.topicId)))
    .orderBy(desc(practiceAnswers.submittedAt))
    .limit(5);

  const [skillStateRow] = await db
    .select({
      currentDifficulty: topicSkillState.currentDifficulty,
      totalAnswered: topicSkillState.totalAnswered,
      totalCorrect: topicSkillState.totalCorrect,
      hintsUsed: topicSkillState.hintsUsed,
      correctStreak: topicSkillState.correctStreak,
      incorrectStreak: topicSkillState.incorrectStreak,
    })
    .from(topicSkillState)
    .where(and(eq(topicSkillState.userId, userId), eq(topicSkillState.topicId, questionRow.topicId)))
    .limit(1);

  const nextCorrectStreak = isCorrect ? (skillStateRow?.correctStreak ?? 0) + 1 : 0;
  const nextIncorrectStreak = isCorrect ? 0 : (skillStateRow?.incorrectStreak ?? 0) + 1;
  const totalAnswered = (skillStateRow?.totalAnswered ?? 0) + 1;
  const totalCorrect = (skillStateRow?.totalCorrect ?? 0) + (isCorrect ? 1 : 0);
  const rollingAccuracyPct = Math.round((totalCorrect / totalAnswered) * 100);
  const recentAccuracyPct =
    recentAnswers.length > 0
      ? Math.round(
          (recentAnswers.filter((answer) => answer.isCorrect).length / recentAnswers.length) * 100
        )
      : rollingAccuracyPct;
  const averageTimeSpentSeconds =
    recentAnswers.length > 0
      ? Math.round(
          recentAnswers.reduce((sum, answer) => sum + answer.timeSpentSeconds, 0) /
            recentAnswers.length
        )
      : timeSpentSeconds;

  const recommendedDifficulty = chooseDifficultyBand({
    currentDifficulty: normalizeDifficultyBand(skillStateRow?.currentDifficulty),
    recentAccuracyPct,
    rollingAccuracyPct,
    correctStreak: nextCorrectStreak,
    incorrectStreak: nextIncorrectStreak,
    totalAnswered,
  });

  await db
    .insert(topicSkillState)
    .values({
      userId,
      topicId: questionRow.topicId,
      currentDifficulty: recommendedDifficulty,
      recommendedDifficulty,
      recentAccuracyPct,
      rollingAccuracyPct,
      averageTimeSpentSeconds,
      totalAnswered,
      totalCorrect,
      hintsUsed: (skillStateRow?.hintsUsed ?? 0) + hintCount,
      correctStreak: nextCorrectStreak,
      incorrectStreak: nextIncorrectStreak,
      lastAnsweredAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [topicSkillState.userId, topicSkillState.topicId],
      set: {
        currentDifficulty: recommendedDifficulty,
        recommendedDifficulty,
        recentAccuracyPct,
        rollingAccuracyPct,
        averageTimeSpentSeconds,
        totalAnswered,
        totalCorrect,
        hintsUsed: (skillStateRow?.hintsUsed ?? 0) + hintCount,
        correctStreak: nextCorrectStreak,
        incorrectStreak: nextIncorrectStreak,
        lastAnsweredAt: now,
        updatedAt: now,
      },
    });

  const sessionAnswers = await db
    .select({
      isCorrect: practiceAnswers.isCorrect,
    })
    .from(practiceAnswers)
    .where(eq(practiceAnswers.sessionId, sessionId));

  const answeredCount = sessionAnswers.length;
  const correctCount = sessionAnswers.filter((answer) => answer.isCorrect).length;

  await db
    .update(practiceSessions)
    .set({
      correctCount,
      accuracyPct: answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0,
    })
    .where(eq(practiceSessions.id, sessionId));

  return NextResponse.json({
    persisted: true,
    answeredCount,
    questionCount: sessionRow.questionCount,
    adaptive: {
      recommendedDifficulty,
      rollingAccuracyPct,
      recentAccuracyPct,
    },
  });
}
