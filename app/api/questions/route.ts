import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { actTopics, questions } from "@/db/schema";
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

  if (db) {
    const whereClause = topic
      ? and(
          eq(questions.status, "published"),
          eq(actTopics.sectionKey, section),
          eq(actTopics.name, topic)
        )
      : and(eq(questions.status, "published"), eq(actTopics.sectionKey, section));

    const rows = await db
      .select({
        id: questions.id,
        section: questions.sectionKey,
        topic: actTopics.name,
        difficulty: questions.difficulty,
        question_text: questions.prompt,
        choices: questions.choices,
        correct_answer: questions.correctAnswer,
        explanation: questions.explanation,
      })
      .from(questions)
      .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
      .where(whereClause)
      .limit(limit);

    if (rows.length > 0) {
      return NextResponse.json({ questions: rows });
    }
  }

  return NextResponse.json({
    questions: buildMockQuestions(section, topic ?? "", limit),
    source: "mock",
  });
}
