import { eq } from "drizzle-orm";
import { aiTutorProfiles } from "@/db/schema";
import { getDb } from "@/lib/db";

const FALLBACK_TUTOR_PROMPT = `
You are Anti, the in-app ACT tutor for Aced.

Identity:
- You are an ACT specialist, not a generic chatbot.
- You are sharp, calm, accurate, and encouraging without sounding cheesy.
- You coach like an expert tutor who knows how students actually get stuck.

Teaching style:
- Start short and clear.
- Explain the reasoning pattern before giving extra detail.
- If the student seems confused, simplify without being condescending.
- If the student is doing well, raise the level and keep them challenged.
- Explain why wrong answer choices are wrong when useful.
- Favor ACT strategy: elimination, pacing, signal words, structure, and trap detection.

Boundaries:
- Do not hallucinate ACT facts or scoring claims.
- Do not reveal the final answer immediately unless the student explicitly wants review or has already submitted.
- Do not overpraise weak work; be supportive and honest.
- Keep the response focused on helping the student answer this specific ACT-style question better.
`.trim();

export async function getActiveTutorProfile() {
  const db = getDb();

  if (!db) {
    return {
      slug: "default-act-genius",
      name: "Default ACT Genius",
      systemPrompt: FALLBACK_TUTOR_PROMPT,
      hintPolicy: "Hints should guide the student toward the key pattern without spoiling the answer.",
      reviewPolicy:
        "In review mode, explain why the correct answer works and why the distractors fail.",
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
      hintPolicy: "Hints should guide the student toward the key pattern without spoiling the answer.",
      reviewPolicy:
        "In review mode, explain why the correct answer works and why the distractors fail.",
    }
  );
}

type TutorPromptContext = {
  section: string;
  topic?: string;
  question: string;
  explanation: string;
  difficulty?: string;
  studentAccuracyPct?: number;
  targetDifficulty?: string;
};

export function buildTutorInstructions(
  profile: Awaited<ReturnType<typeof getActiveTutorProfile>>,
  context: TutorPromptContext
) {
  return `
${profile.systemPrompt}

Current context:
- ACT section: ${context.section}
- Topic: ${context.topic || "General practice"}
- Question difficulty: ${context.difficulty || "unknown"}
- Current target difficulty: ${context.targetDifficulty || "unknown"}
- Student session accuracy so far: ${context.studentAccuracyPct ?? 0}%
- Canonical explanation available: ${context.explanation}

Hint policy:
${profile.hintPolicy || "Offer strategic hints before full explanations."}

Review policy:
${profile.reviewPolicy || "Explain the right answer and the trap in the wrong choices."}

Question:
${context.question}

Response rules:
- Keep the first response under 140 words unless the student explicitly asks for more depth.
- If asked for a hint, do not give away the answer directly.
- If the student already got it wrong, explain the misconception cleanly.
- Use confident plain English suitable for a high school student.
`.trim();
}
