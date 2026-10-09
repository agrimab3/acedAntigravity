import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  actTopics,
  practiceAnswers,
  practiceSessions,
  practiceTutorStates,
  questions,
  topicSkillState,
  type ChoiceMap,
} from "@/db/schema";
import { getTopicByName, isTopicInPracticeScope, type SectionKey } from "@/lib/act-taxonomy";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { generateGeminiText, hasGeminiApiKey } from "@/lib/gemini";
import {
  buildFallbackTutorReply,
  buildSafePreSubmissionReply,
  decideTutorTurn,
  detectTutorLeak,
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
  prompt,
}: {
  passage: string | null;
  prompt: string;
}) {
  return passage ? `Passage:\n${passage}\n\nQuestion:\n${prompt}` : prompt;
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
    })
    .from(questions)
    .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
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
      hintLevel: 2,
      hintCount: nextHintCount,
      answerRevealed: true,
      submitted: false,
    });
  }

  if (!submitted) {
    const safeReply = buildSafePreSubmissionReply({
      section: questionRow.section,
      topic: questionRow.topic,
      phase: decision.phase === "hint" ? "hint" : "general",
    });
    const leakReason = detectTutorLeak({
      reply: safeReply,
      correctAnswer: questionRow.correctAnswer,
      correctChoiceText,
      explanation: questionRow.explanation,
    });

    if (leakReason) {
      console.error("[tutor-guard] Deterministic pre-submission reply failed leak check", {
        userId,
        sessionId,
        questionId,
        phase: decision.phase,
        reason: leakReason,
      });
      return NextResponse.json({
        reply: "Let's focus on the rule or evidence this question is testing before choosing an answer.",
        guarded: true,
        hintLevel: decision.nextHintLevel,
        hintCount: nextHintCount,
        answerRevealed,
        submitted: false,
      });
    }

    return NextResponse.json({
      reply: safeReply,
      hintLevel: decision.nextHintLevel,
      hintCount: nextHintCount,
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
  const questionText = buildQuestionText({
    passage: questionRow.passage,
    prompt: questionRow.prompt,
  });

  const fallbackReply = buildFallbackTutorReply({
    section: questionRow.section,
    topic: questionRow.topic,
    phase: submitted ? "review" : decision.phase,
    submitted,
    requestedAnswerWithoutHint: decision.answerRequestBlocked,
    correctAnswer: submitted ? questionRow.correctAnswer : undefined,
    explanation: submitted ? questionRow.explanation : undefined,
  });

  if (!hasGeminiApiKey()) {
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

  try {
    const reply = await generateGeminiText({
      systemInstruction: buildTutorInstructions(profile, {
        section: questionRow.section,
        topic: questionRow.topic,
        officialCategory,
        question: questionText,
        difficulty: questionRow.difficulty,
        studentAccuracyPct: parsed.data.sessionAccuracyPct,
        targetDifficulty: recommendedDifficulty,
        mode,
        choices: submitted ? choices : undefined,
        correctAnswer: submitted ? questionRow.correctAnswer : undefined,
        explanation: submitted ? questionRow.explanation : undefined,
      }),
      prompt: `Student message: ${message}`,
      maxOutputTokens: 512,
      temperature: 0.35,
    });

    const normalizedReply = normalizeTutorReply(reply);
    if (!normalizedReply || normalizedReply.length < 12) {
      throw new Error("Gemini returned an empty tutor response.");
    }

    if (looksIncompleteTutorReply(normalizedReply)) {
      console.error("[tutor-guard] Replaced incomplete tutor reply", {
        userId,
        sessionId,
        questionId,
        phase: decision.phase,
        submitted,
      });

      return NextResponse.json({
        reply: submitted
          ? fallbackReply
          : buildSafePreSubmissionReply({
              section: questionRow.section,
              topic: questionRow.topic,
              phase: decision.phase === "hint" ? "hint" : "general",
            }),
        guarded: true,
        hintLevel: decision.nextHintLevel,
        hintCount: nextHintCount,
        answerRevealed,
        submitted,
      });
    }

    if (!submitted) {
      const leakReason = detectTutorLeak({
        reply: normalizedReply,
        correctAnswer: questionRow.correctAnswer,
        correctChoiceText,
        explanation: questionRow.explanation,
      });

      if (leakReason) {
        console.error("[tutor-guard] Blocked pre-submission answer leak", {
          userId,
          sessionId,
          questionId,
          phase: decision.phase,
          reason: leakReason,
        });

        return NextResponse.json({
          reply: buildSafePreSubmissionReply({
            section: questionRow.section,
            topic: questionRow.topic,
            phase: decision.phase === "hint" ? "hint" : "general",
          }),
          guarded: true,
          hintLevel: decision.nextHintLevel,
          hintCount: nextHintCount,
          answerRevealed,
          submitted: false,
        });
      }
    }

    return NextResponse.json({
      reply: normalizedReply,
      hintLevel: decision.nextHintLevel,
      hintCount: nextHintCount,
      answerRevealed,
      submitted,
    });
  } catch (error) {
    console.error("Tutor request failed", {
      userId,
      sessionId,
      questionId,
      error,
    });

    return NextResponse.json({
      reply: fallbackReply,
      fallback: true,
      hintLevel: decision.nextHintLevel,
      hintCount: nextHintCount,
      answerRevealed,
      submitted,
    });
  }
}
