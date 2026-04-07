import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { and, eq } from "drizzle-orm";
import { actTopics, topicSkillState } from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildTutorInstructions, getActiveTutorProfile } from "@/lib/tutor-profile";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

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

export async function POST(req: Request) {
  const parsed = tutorRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid tutor payload.' }, { status: 400 });
  }

  if (!client) {
    return NextResponse.json({
      reply: 'The AI tutor is not configured yet. Add OPENAI_API_KEY on the server to enable it.',
    });
  }

  const { message, question, section, topic, explanation } = parsed.data;
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

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    max_output_tokens: 250,
    instructions: buildTutorInstructions(profile, {
      section,
      topic,
      question,
      explanation,
      difficulty: parsed.data.difficulty,
      studentAccuracyPct: parsed.data.sessionAccuracyPct,
      targetDifficulty: recommendedDifficulty,
    }),
    input: message,
  });

  const reply = response.output_text?.trim() || 'let me think about that!';
  return NextResponse.json({ reply });
}
