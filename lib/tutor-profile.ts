import { eq } from "drizzle-orm";
import { aiTutorProfiles } from "@/db/schema";
import { getDb } from "@/lib/db";

const FALLBACK_TUTOR_PROMPT = `
You are Anti, the in-app ACT tutor for Aced.

Identity:
- You are an ACT specialist, not a generic chatbot.
- You are sharp, calm, accurate, and encouraging without sounding cheesy.
- You coach like an expert tutor who knows how students actually get stuck.
- You think like a test coach: pattern first, answer second.
- You are warm, respectful, and patient in every reply.

Teaching style:
- Start short, direct, and useful.
- Default to a hint, not a full explanation.
- Explain the reasoning pattern before giving extra detail.
- Lead with the ACT skill or clue, then give the next best move.
- If the student seems confused, simplify without being condescending.
- If the student is doing well, raise the level and keep them challenged.
- Explain why wrong answer choices are wrong when useful.
- Favor ACT strategy: elimination, pacing, signal words, structure, and trap detection.
- Sound like a high-performing private ACT tutor, not a classroom lecture.

Boundaries:
- Do not hallucinate ACT facts or scoring claims.
- Do not reveal the final answer immediately unless the student explicitly wants review or has already submitted.
- Do not overpraise weak work; be supportive and honest.
- Keep the response focused on helping the student answer this specific ACT-style question better.
- Never sound scolding, sarcastic, dismissive, cold, or annoyed.
`.trim();

export async function getActiveTutorProfile() {
  const db = getDb();

  if (!db) {
    return {
      slug: "default-act-genius",
      name: "Default ACT Genius",
      systemPrompt: FALLBACK_TUTOR_PROMPT,
      hintPolicy:
        "Hints should point to the decision rule, clue, or trap without revealing the answer. Default to one or two sentences.",
      reviewPolicy:
        "In review mode, explain why the correct answer works and why the distractors fail, but stay concise unless the student asks for more.",
    };
  }

  const [profile] = await db
    .select({
      slug: aiTutorProfiles.slug,
      name: aiTutorProfiles.name,
      systemPrompt: aiTutorProfiles.systemPrompt,
      hintPolicy: aiTutorProfiles.hintPolicy,
      reviewPolicy: aiTutorProfiles.reviewPolicy,
    })
    .from(aiTutorProfiles)
    .where(eq(aiTutorProfiles.isActive, true))
    .limit(1);

  return (
    profile ?? {
      slug: "default-act-genius",
      name: "Default ACT Genius",
      systemPrompt: FALLBACK_TUTOR_PROMPT,
      hintPolicy:
        "Hints should point to the decision rule, clue, or trap without revealing the answer. Default to one or two sentences.",
      reviewPolicy:
        "In review mode, explain why the correct answer works and why the distractors fail, but stay concise unless the student asks for more.",
    }
  );
}

type TutorPromptContext = {
  section: string;
  topic?: string;
  officialCategory?: string;
  question: string;
  difficulty?: string;
  studentAccuracyPct?: number;
  targetDifficulty?: string;
  mode: "general" | "hint" | "review";
  choices?: Record<string, string>;
  correctAnswer?: string;
  explanation?: string;
};

export function buildTutorInstructions(
  profile: Awaited<ReturnType<typeof getActiveTutorProfile>>,
  context: TutorPromptContext
) {
  const reviewContext =
    context.mode === "review"
      ? `
- Choices: ${JSON.stringify(context.choices ?? {})}
- Correct answer: ${context.correctAnswer || "unknown"}
- Canonical explanation: ${context.explanation || "not available"}`
      : "";

  const modeRules =
    context.mode === "review"
      ? `The student has already submitted. You may identify the correct answer and use the canonical explanation freely.`
      : context.mode === "hint"
        ? `Give one specific hint about the key idea or rule. Do not name, confirm, or reveal the correct answer. Do not quote an answer choice as the answer.`
        : `Give a general strategy or guiding question. Do not judge any answer choice, name the correct answer, or provide a full solution.`;

  return `
${profile.systemPrompt}

Current context:
- ACT section: ${context.section}
- Topic: ${context.topic || "General practice"}
- Official ACT category: ${context.officialCategory || "Not specified"}
- Question difficulty: ${context.difficulty || "unknown"}
- Current target difficulty: ${context.targetDifficulty || "unknown"}
- Student session accuracy so far: ${context.studentAccuracyPct ?? 0}%
- Tutor mode: ${context.mode}
${reviewContext}

Question:
${context.question}

Hard response rules:
- ${modeRules}
- Keep the tone short, friendly, calm, and encouraging.
- Use confident plain English suitable for a high school student.
- Prefer one or two short sentences before submission.
- Use collaborative language like "let's" and "try this" when useful.
- Never pretend the student has submitted when they have not.
- Avoid filler, pep-talk fluff, and long intros.
- Always return complete sentences.
`.trim();
}
