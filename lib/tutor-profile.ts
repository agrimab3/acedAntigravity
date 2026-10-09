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
  hintLevel?: number;
  priorHints?: string[];
  strictPreSubmit?: boolean;
  correctAnswer?: string;
  explanation?: string;
};

export function buildTutorInstructions(
  profile: Awaited<ReturnType<typeof getActiveTutorProfile>>,
  context: TutorPromptContext
) {
  const preSubmit = context.mode !== "review";
  const hintLevel = Math.max(0, Math.min(3, context.hintLevel ?? 0));
  const priorHints = context.priorHints ?? [];
  const choiceContext = context.choices
    ? `\nChoices:\n${Object.entries(context.choices)
        .map(([letter, text]) => `${letter}. ${text}`)
        .join("\n")}`
    : "";
  const reviewContext =
    context.mode === "review"
      ? `\nCorrect answer: ${context.correctAnswer || "unknown"}\nCanonical explanation: ${context.explanation || "not available"}`
      : "";
  const priorHintContext =
    preSubmit && priorHints.length > 0
      ? `\nHints already shown to the student:\n${priorHints
          .map((hint, index) => `${index + 1}. ${hint}`)
          .join("\n")}`
      : "";

  let modeRules =
    "Answer the student's question directly and briefly. You may explain a concept or strategy, but do not say which answer choice is right or wrong.";

  if (context.mode === "hint") {
    modeRules =
      hintLevel <= 1
        ? "Give Hint 1: identify the key idea or rule being tested in THIS question. Be specific to the wording or setup, but do not solve it."
        : hintLevel === 2
          ? "Give Hint 2: point the student to the exact phrase, sentence, graph feature, equation part, or condition they should inspect next. Do not repeat Hint 1 and do not identify the correct choice."
          : "Give Hint 3: walk through only the first concrete reasoning step for THIS question. Do not repeat earlier hints, do not finish the solution, and do not identify the correct choice.";
  } else if (context.mode === "review") {
    modeRules =
      "The student has already submitted. You may identify the correct answer and use the canonical explanation freely.";
  }

  const strictRules =
    preSubmit && context.strictPreSubmit
      ? `\nSTRICT RETRY RULES:\n- A previous draft was blocked by the safety checker.\n- Do not name any answer letter as correct, best, right, or the answer.\n- Do not quote any answer choice as the answer.\n- Do not eliminate multiple choices in a way that leaves only one possible choice.\n- Do not repeat any prior hint.\n- Give only the requested concept explanation or hint.`
      : "";

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
- Hint stage: ${hintLevel}

Question / passage / figure text:
${context.question}${choiceContext}${reviewContext}${priorHintContext}

Hard response rules:
- ${modeRules}
- ${preSubmit ? "The correct answer and canonical explanation have deliberately NOT been provided to you. Never infer or claim that you know which choice is correct." : "The student has submitted, so full review is allowed."}
- Never confirm or deny a student's proposed choice before submission.
- Never repeat a hint already shown to the student.
- Keep the tone short, friendly, calm, and encouraging.
- Use confident plain English suitable for a high school student.
- Prefer one or two short sentences before submission.
- Always return complete sentences.
${strictRules}
`.trim();
}
