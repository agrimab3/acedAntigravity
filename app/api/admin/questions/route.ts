import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { actTopics, questions } from "@/db/schema";
import { getAdminSession } from "@/lib/admin";
import { getDb } from "@/lib/db";

const listSchema = z.object({
  status: z.enum(["draft", "published", "rejected"]).optional(),
  section: z.enum(["english", "math", "reading", "science"]).optional(),
  topic: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

const patchSchema = z.object({
  questionId: z.string().uuid(),
  status: z.enum(["draft", "published", "rejected"]),
  reviewNotes: z.string().trim().max(2000).optional().nullable(),
});

export async function GET(request: Request) {
  const session = await getAdminSession();
  const db = getDb();

  if (!session || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = listSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    section: url.searchParams.get("section") ?? undefined,
    topic: url.searchParams.get("topic") ?? undefined,
    limit: url.searchParams.get("limit") ?? 12,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review query." }, { status: 400 });
  }

  const filters = [];

  if (parsed.data.status) {
    filters.push(eq(questions.status, parsed.data.status));
  }

  if (parsed.data.section) {
    filters.push(eq(questions.sectionKey, parsed.data.section));
  }

  if (parsed.data.topic) {
    filters.push(eq(actTopics.slug, parsed.data.topic));
  }

  const rows = await db
    .select({
      id: questions.id,
      sectionKey: questions.sectionKey,
      topicName: actTopics.name,
      topicSlug: actTopics.slug,
      difficulty: questions.difficulty,
      prompt: questions.prompt,
      passage: questions.passage,
      choices: questions.choices,
      correctAnswer: questions.correctAnswer,
      explanation: questions.explanation,
      source: questions.source,
      generationModel: questions.generationModel,
      status: questions.status,
      reviewNotes: questions.reviewNotes,
      reviewedAt: questions.reviewedAt,
      createdAt: questions.createdAt,
    })
    .from(questions)
    .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(questions.createdAt))
    .limit(parsed.data.limit);

  return NextResponse.json({ questions: rows });
}

export async function PATCH(request: Request) {
  const session = await getAdminSession();
  const db = getDb();

  if (!session?.user?.id || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review update." }, { status: 400 });
  }

  const now = new Date();
  const reviewNotes =
    parsed.data.reviewNotes && parsed.data.reviewNotes.length > 0 ? parsed.data.reviewNotes : null;

  const [updatedQuestion] = await db
    .update(questions)
    .set({
      status: parsed.data.status,
      reviewNotes,
      reviewedAt: now,
      reviewedByUserId: session.user.id,
      updatedAt: now,
    })
    .where(eq(questions.id, parsed.data.questionId))
    .returning({
      id: questions.id,
      status: questions.status,
      reviewNotes: questions.reviewNotes,
      reviewedAt: questions.reviewedAt,
    });

  if (!updatedQuestion) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  return NextResponse.json({ question: updatedQuestion });
}
