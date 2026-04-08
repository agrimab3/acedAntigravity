import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from "drizzle-orm";
import { actTopics, topicSkillState } from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { generateGeminiText, hasGeminiApiKey } from "@/lib/gemini";
import { buildTutorInstructions, getActiveTutorProfile } from "@/lib/tutor-profile";

const tutorRequestSchema = z.object({
  message: z.string().trim().min(1),
  question: z.string().trim().min(1),
  section: z.string().trim().min(1),
  topic: z.string().trim().optional(),
  explanation: z.string().trim().min(1),
  difficulty: z.string().trim().optional(),
  sessionAccuracyPct: z.coerce.number().int().min(0).max(100).optional(),
  targetDifficulty: z.string().trim().optional(),
});

function buildFallbackTutorReply({
  message,
  section,
  topic,
  explanation,
}: {
  message: string;
  section: string;
  topic?: string;
  explanation: string;
}) {
  const lowerMessage = message.toLowerCase();
  const lowerExplanation = explanation.toLowerCase();

  if (lowerMessage.includes("hint")) {
    if (lowerExplanation.includes("parallel")) {
      return "Hint: check whether the two ideas being paired use the same grammatical form. After \"not only,\" the pattern should still match after \"but also.\"";
    }

    if (lowerExplanation.includes("data") || lowerExplanation.includes("graph")) {
      return "Hint: do not interpret yet. First identify the exact numbers or relationship the chart gives you, then choose the answer that states only what the data supports.";
    }

    if (section === "math") {
      return "Hint: before calculating, decide which formula or algebra move the question is really testing. Set that up first, then compute carefully.";
    }

    if (section === "reading") {
      return "Hint: go back to the exact sentence or detail the question points to. The best ACT Reading answer is usually the one most directly supported by the passage.";
    }

    return `Hint: focus on the core pattern this ${topic || section} question is testing, not just the surface wording.`;
  }

  if (lowerMessage.includes("why") || lowerMessage.includes("wrong")) {
    return `Quick coaching take: ${explanation} On ACT questions, wrong choices often break the rule, add something unsupported, or sound close without fully matching the evidence.`;
  }

  if (lowerMessage.includes("simple") || lowerMessage.includes("simpler")) {
    return `In simpler terms: ${explanation}`;
  }

  return `Here’s the key idea to focus on: ${explanation}`;
}

function normalizeTutorReply(reply: string) {
  const cleaned = reply.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return "";
  }

  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

export async function POST(req: Request) {
  const parsed = tutorRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid tutor payload.' }, { status: 400 });
  }

  const { message, question, section, topic, explanation } = parsed.data;

  if (!hasGeminiApiKey()) {
    return NextResponse.json({
      reply: buildFallbackTutorReply({
        message,
        section,
        topic,
        explanation,
      }),
      fallback: true,
      provider: "local-fallback",
    });
  }

  const session = await getAuthSession();
  const db = getDb();
  const profile = await getActiveTutorProfile();
  let recommendedDifficulty = parsed.data.targetDifficulty;

  if (session?.user?.id && db && topic) {
    const [topicRow] = await db
      .select({
        id: actTopics.id,
      })
      .from(actTopics)
      .where(and(eq(actTopics.sectionKey, section), eq(actTopics.name, topic)))
      .limit(1);

    if (topicRow) {
      const [skillStateRow] = await db
        .select({
          recommendedDifficulty: topicSkillState.recommendedDifficulty,
        })
        .from(topicSkillState)
        .where(
          and(
            eq(topicSkillState.userId, session.user.id),
            eq(topicSkillState.topicId, topicRow.id)
          )
        )
        .limit(1);

      recommendedDifficulty = skillStateRow?.recommendedDifficulty ?? recommendedDifficulty;
    }
  }

  try {
    const reply = await generateGeminiText({
      systemInstruction: buildTutorInstructions(profile, {
        section,
        topic,
        question,
        explanation,
        difficulty: parsed.data.difficulty,
        studentAccuracyPct: parsed.data.sessionAccuracyPct,
        targetDifficulty: recommendedDifficulty,
      }),
      prompt: `Student message: ${message}`,
      maxOutputTokens: 512,
      temperature: 0.35,
    });

    const normalizedReply = normalizeTutorReply(reply);

    if (!normalizedReply || normalizedReply.length < 12) {
      throw new Error("Gemini returned an empty tutor response.");
    }

    return NextResponse.json({ reply: normalizedReply });
  } catch (error) {
    console.error("Tutor request failed", error);

    return NextResponse.json({
      reply: buildFallbackTutorReply({
        message,
        section,
        topic,
        explanation,
      }),
      fallback: true,
    });
  }
}
