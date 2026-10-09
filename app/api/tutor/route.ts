import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  actTopics,
  practiceAnswers,
  practiceSessions,
  practiceTutorStates,
  questions,
  questionSets,
  topicSkillState,
  type ChoiceMap,
} from "@/db/schema";
import { getTopicByName, isTopicInPracticeScope, type SectionKey } from "@/lib/act-taxonomy";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { generateTutorAiText, hasTutorAiProvider } from "@/lib/tutor-ai";
import {
  buildFallbackTutorReply,
  buildSafePreSubmissionReply,
  decideTutorTurn,
  guardPreSubmissionTutorReply,
  isRepeatedTutorHint,
  looksIncompleteTutorReply,
  type TutorAction,
} from "@/lib/tutor-guard";
import { buildTutorInstructions, getActiveTutorProfile } from "@/lib/tutor-profile";

const tutorRequestSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  questionId: z.string().uuid(),
  sessionId: z.string().uuid(),
  action: z.enum(["message", "hint", "show_answer"]).default("message"),
  sessionAccuracyPct: z.coerce.number().int().min(0).max(100).optional(),
  targetDifficulty: z.string().trim().optional(),
});

function normalizeTutorReply(reply: string) {
  const cleaned = reply.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function buildQuestionText({
  passage,
  questionSetContent,
  prompt,
}: {
  passage: string | null;
  questionSetContent: string | null;
  prompt: string;
}) {
  const parts: string[] = [];
  if (questionSetContent) {
    parts.push(`Passage / figure / stimulus:\n${questionSetContent}`);
  }
  if (passage && passage !== questionSetContent) {
    parts.push(`Passage / context:\n${passage}`);
  }
  parts.push(`Question:\n${prompt}`);
  return parts.join("\n\n");
}

export async function POST(req: Request) {
  const parsed = tutorRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid tutor payload." }, { status: 400 });
  }

  const session = await getAuthSession();
  const userId = session?.user?.id;
  const db = getDb();

  if (!userId || !db) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const tutorLimit = consumeRateLimit(`tutor:${userId}`, RATE_LIMITS.tutor);
  if (!tutorLimit.allowed) {
    return NextResponse.json(
      { error: "Take a quick break, the tutor will be back in a bit ✦" },
      { status: 429, headers: { "Retry-After": String(tutorLimit.retryAfterSeconds) } }
    );
  }

  const { message, questionId, sessionId, action } = parsed.data;

  const [questionRow] = await db
    .select({
      id: questions.id,
      section: questions.sectionKey,
      topicId: questions.topicId,
      topic: actTopics.name,
      difficulty: questions.difficulty,
      passage: questions.passage,
      prompt: questions.prompt,
      choices: questions.choices,
      correctAnswer: questions.correctAnswer,
      explanation: questions.explanation,
      questionSetContent: questionSets.content,
    })
    .from(questions)
    .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
    .leftJoin(questionSets, eq(questions.questionSetId, questionSets.id))
    .where(and(eq(questions.id, questionId), eq(questions.status, "published")))
    .limit(1);

  const [practiceSession] = await db
    .select({
      id: practiceSessions.id,
      section: practiceSessions.sectionKey,
      topicId: practiceSessions.topicId,
      topic: actTopics.name,
    })
    .from(practiceSessions)
    .innerJoin(actTopics, eq(practiceSessions.topicId, actTopics.id))
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)))
    .limit(1);

  if (
    !questionRow ||
    !practiceSession ||
    !isTopicInPracticeScope(
      practiceSession.section as SectionKey,
      practiceSession.topic,
      questionRow.topic
    )
  ) {
    return NextResponse.json({ error: "Practice question not found." }, { status: 404 });
  }

  await db
    .insert(practiceTutorStates)
    .values({
      sessionId,
      userId,
      questionId,
      hintLevel: 0,
      hintCount: 0,
      hintHistory: [],
      answerRevealed: false,
    })
    .onConflictDoNothing({
      target: [
        practiceTutorStates.userId,
        practiceTutorStates.sessionId,
        practiceTutorStates.questionId,
      ],
    });

  const [state] = await db
    .select({
      hintLevel: practiceTutorStates.hintLevel,
      hintCount: practiceTutorStates.hintCount,
      hintHistory: practiceTutorStates.hintHistory,
      answerRevealed: practiceTutorStates.answerRevealed,
      submittedAt: practiceTutorStates.submittedAt,
    })
    .from(practiceTutorStates)
    .where(
      and(
        eq(practiceTutorStates.userId, userId),
        eq(practiceTutorStates.sessionId, sessionId),
        eq(practiceTutorStates.questionId, questionId)
      )
    )
    .limit(1);

  const [submittedAnswer] = await db
    .select({ submittedAt: practiceAnswers.submittedAt })
    .from(practiceAnswers)
    .where(
      and(
        eq(practiceAnswers.userId, userId),
        eq(practiceAnswers.sessionId, sessionId),
        eq(practiceAnswers.questionId, questionId)
      )
    )
    .limit(1);

  const submitted = Boolean(submittedAnswer?.submittedAt || state?.submittedAt);
  const currentHintLevel = state?.hintLevel ?? 0;
  const currentHintCount = state?.hintCount ?? 0;
  const priorHints = Array.isArray(state?.hintHistory) ? state.hintHistory : [];
  const decision = decideTutorTurn({
    message,
    action: action as TutorAction,
    submitted,
    hintLevel: currentHintLevel,
  });

  const nextHintCount = currentHintCount + (decision.incrementHintCount ? 1 : 0);
  const now = new Date();

  await db
    .update(practiceTutorStates)
    .set({
      hintLevel: decision.nextHintLevel,
      hintCount: nextHintCount,
      answerRevealed: (state?.answerRevealed ?? false) || decision.revealAnswer,
      submittedAt: submitted ? submittedAnswer?.submittedAt ?? state?.submittedAt ?? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(practiceTutorStates.userId, userId),
        eq(practiceTutorStates.sessionId, sessionId),
        eq(practiceTutorStates.questionId, questionId)
      )
    );

  const answerRevealed = (state?.answerRevealed ?? false) || decision.revealAnswer;
  const choices = questionRow.choices as ChoiceMap;
  const correctAnswer = questionRow.correctAnswer as keyof ChoiceMap;
  const correctChoiceText = choices[correctAnswer] ?? "";
  const officialCategory =
    getTopicByName(questionRow.section as SectionKey, questionRow.topic)?.officialCategory;
  const questionText = buildQuestionText({
    passage: questionRow.passage,
    questionSetContent: questionRow.questionSetContent,
    prompt: questionRow.prompt,
  });

  const persistHint = async (reply: string) => {
    if (!decision.incrementHintCount) return;
    const nextHistory = [...priorHints, reply].slice(-3);
    await db
      .update(practiceTutorStates)
      .set({
        hintHistory: nextHistory,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(practiceTutorStates.userId, userId),
          eq(practiceTutorStates.sessionId, sessionId),
          eq(practiceTutorStates.questionId, questionId)
        )
      );
  };

  if (decision.phase === "choice_check") {
    return NextResponse.json({
      reply: buildSafePreSubmissionReply({
        section: questionRow.section,
        topic: questionRow.topic,
        phase: "choice_check",
      }),
      hintLevel: decision.nextHintLevel,
      hintCount: nextHintCount,
      answerRevealed,
      submitted,
    });
  }

  if (decision.answerRequestBlocked) {
    return NextResponse.json({
      reply: buildSafePreSubmissionReply({
        section: questionRow.section,
        topic: questionRow.topic,
        phase: "general",
        requestedAnswerWithoutHint: true,
      }),
      hintLevel: decision.nextHintLevel,
      hintCount: nextHintCount,
      answerRevealed,
      submitted,
    });
  }

  if (decision.phase === "reveal") {
    return NextResponse.json({
      reply: buildFallbackTutorReply({
        section: questionRow.section,
        topic: questionRow.topic,
        phase: "reveal",
        submitted: false,
        correctAnswer: questionRow.correctAnswer,
        explanation: questionRow.explanation,
      }),
      hintLevel: decision.nextHintLevel,
      hintCount: nextHintCount,
      answerRevealed: true,
      submitted: false,
    });
  }

  if (!submitted && decision.phase === "hint" && currentHintLevel >= 3) {
    return NextResponse.json({
      reply: "You've got all three hints. Try the question now, or use Show answer if you want the full solution.",
      hintLevel: 3,
      hintCount: currentHintCount,
      answerRevealed,
      submitted: false,
    });
  }

  const profile = await getActiveTutorProfile();
  let recommendedDifficulty = parsed.data.targetDifficulty;

  if (questionRow.topicId) {
    const [skillStateRow] = await db
      .select({
        recommendedDifficulty: topicSkillState.recommendedDifficulty,
      })
      .from(topicSkillState)
      .where(
        and(
          eq(topicSkillState.userId, userId),
          eq(topicSkillState.topicId, questionRow.topicId)
        )
      )
      .limit(1);

    recommendedDifficulty = skillStateRow?.recommendedDifficulty ?? recommendedDifficulty;
  }

  const mode = submitted ? "review" : decision.phase === "hint" ? "hint" : "general";
  const fallbackReply = buildFallbackTutorReply({
    section: questionRow.section,
    topic: questionRow.topic,
    phase: submitted ? "review" : decision.phase,
    submitted,
    requestedAnswerWithoutHint: decision.answerRequestBlocked,
    hintLevel: decision.nextHintLevel,
    correctAnswer: submitted ? questionRow.correctAnswer : undefined,
    explanation: submitted ? questionRow.explanation : undefined,
  });

  if (!hasTutorAiProvider()) {
    await persistHint(fallbackReply);
    return NextResponse.json({
      reply: fallbackReply,
      fallback: true,
      provider: "local-fallback",
      hintLevel: decision.nextHintLevel,
      hintCount: nextHintCount,
      answerRevealed,
      submitted,
    });
  }

  const buildInstruction = (strictPreSubmit: boolean) =>
    buildTutorInstructions(profile, {
      section: questionRow.section,
      topic: questionRow.topic,
      officialCategory,
      question: questionText,
      difficulty: questionRow.difficulty,
      studentAccuracyPct: parsed.data.sessionAccuracyPct,
      targetDifficulty: recommendedDifficulty,
      mode,
      choices,
      hintLevel: decision.nextHintLevel,
      priorHints,
      strictPreSubmit,
      correctAnswer: submitted ? questionRow.correctAnswer : undefined,
      explanation: submitted ? questionRow.explanation : undefined,
    });

  let activeProvider: "gemini" | "groq" | undefined;
  const generateReply = async (strictPreSubmit: boolean) => {
    const result = await generateTutorAiText({
      systemInstruction: buildInstruction(strictPreSubmit),
      prompt: `Student message: ${message}`,
      maxOutputTokens: submitted ? 512 : 320,
      temperature: submitted ? 0.35 : 0.25,
    });
    activeProvider = result.provider;
    return normalizeTutorReply(result.text);
  };

  try {
    let normalizedReply = await generateReply(false);

    if (!normalizedReply || normalizedReply.length < 12) {
      throw new Error("Tutor AI returned an empty response.");
    }

    if (!submitted) {
      const firstGuard = guardPreSubmissionTutorReply({
        reply: normalizedReply,
        correctAnswer: questionRow.correctAnswer,
        correctChoiceText,
        explanation: questionRow.explanation,
        choices,
      });
      const firstRepeated =
        decision.phase === "hint" && isRepeatedTutorHint(normalizedReply, priorHints);
      const firstIncomplete = looksIncompleteTutorReply(normalizedReply);

      if (firstGuard.blocked || firstRepeated || firstIncomplete) {
        console.error("[tutor-guard] Blocked pre-submission tutor reply", {
          userId,
          sessionId,
          questionId,
          phase: decision.phase,
          hintLevel: decision.nextHintLevel,
          reason:
            firstGuard.reason ??
            (firstRepeated ? "repeated-hint" : firstIncomplete ? "incomplete-reply" : "unknown"),
          attempt: 1,
        });

        normalizedReply = await generateReply(true);

        const retryGuard = guardPreSubmissionTutorReply({
          reply: normalizedReply,
          correctAnswer: questionRow.correctAnswer,
          correctChoiceText,
          explanation: questionRow.explanation,
          choices,
        });
        const retryRepeated =
          decision.phase === "hint" && isRepeatedTutorHint(normalizedReply, priorHints);
        const retryIncomplete =
          !normalizedReply || normalizedReply.length < 12 || looksIncompleteTutorReply(normalizedReply);

        if (retryGuard.blocked || retryRepeated || retryIncomplete) {
          console.error("[tutor-guard] Blocked pre-submission tutor retry", {
            userId,
            sessionId,
            questionId,
            phase: decision.phase,
            hintLevel: decision.nextHintLevel,
            reason:
              retryGuard.reason ??
              (retryRepeated
                ? "repeated-hint"
                : retryIncomplete
                  ? "incomplete-reply"
                  : "unknown"),
            attempt: 2,
          });

          const safeReply = buildSafePreSubmissionReply({
            section: questionRow.section,
            topic: questionRow.topic,
            phase: decision.phase === "hint" ? "hint" : "general",
            hintLevel: decision.nextHintLevel,
          });
          await persistHint(safeReply);

          return NextResponse.json({
            reply: safeReply,
            guarded: true,
            fallback: true,
            hintLevel: decision.nextHintLevel,
            hintCount: nextHintCount,
            answerRevealed,
            submitted: false,
          });
        }
      }

      await persistHint(normalizedReply);
      return NextResponse.json({
        reply: normalizedReply,
        hintLevel: decision.nextHintLevel,
        hintCount: nextHintCount,
        answerRevealed,
        submitted: false,
        provider: activeProvider,
      });
    }

    if (looksIncompleteTutorReply(normalizedReply)) {
      console.error("[tutor-guard] Replaced incomplete post-submission tutor reply", {
        userId,
        sessionId,
        questionId,
      });
      normalizedReply = fallbackReply;
    }

    return NextResponse.json({
      reply: normalizedReply,
      hintLevel: decision.nextHintLevel,
      hintCount: nextHintCount,
      answerRevealed,
      submitted: true,
      provider: activeProvider,
    });
  } catch (error) {
    console.error("Tutor request failed", {
      userId,
      sessionId,
      questionId,
      submitted,
      error: error instanceof Error ? error.message : String(error),
    });

    await persistHint(fallbackReply);
    return NextResponse.json({
      reply: fallbackReply,
      fallback: true,
      provider: "local-fallback",
      hintLevel: decision.nextHintLevel,
      hintCount: nextHintCount,
      answerRevealed,
      submitted,
    });
  }
}
