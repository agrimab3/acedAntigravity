import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { actTopics, questions, questionSets } from "@/db/schema";
import { getAdminSession } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { resolveEffectivePassage } from "@/lib/question-sets";
import { reviewQuestionQuality } from "@/lib/question-utils";

const listSchema = z.object({
  status: z.enum(["draft", "published", "rejected"]).optional(),
  section: z.enum(["english", "math", "reading", "science"]).optional(),
  topic: z.string().trim().optional(),
  qualityFilter: z.enum(["all", "blocked", "warning", "clean"]).default("all"),
  sort: z.enum(["blocked-first", "highest-risk", "newest"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

const singlePatchSchema = z.object({
  mode: z.literal("single").optional(),
  questionId: z.string().uuid(),
  status: z.enum(["draft", "published", "rejected"]),
  reviewNotes: z.string().trim().max(2000).optional().nullable(),
});

const bulkPatchSchema = z.object({
  mode: z.literal("bulk"),
  questionIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(["draft", "published", "rejected"]),
  reviewNotes: z.string().trim().max(2000).optional().nullable(),
});

const patchSchema = z.union([singlePatchSchema, bulkPatchSchema]);

function parseShadowReview(reviewNotes: string | null) {
  if (!reviewNotes) {
    return null;
  }

  const shadowLine = reviewNotes
    .split("\n")
    .find((line) => line.trim().startsWith("[shadow-review] "));

  if (!shadowLine) {
    return null;
  }

  try {
    return JSON.parse(shadowLine.replace("[shadow-review] ", "").trim());
  } catch {
    return null;
  }
}

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
    qualityFilter: url.searchParams.get("qualityFilter") ?? "all",
    sort:
      url.searchParams.get("sort") ??
      ((url.searchParams.get("status") ?? "draft") === "draft" ? "blocked-first" : "newest"),
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
      questionSetId: questions.questionSetId,
      questionSetKind: questionSets.kind,
      questionSetTitle: questionSets.title,
      questionSetContent: questionSets.content,
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
    .leftJoin(questionSets, eq(questions.questionSetId, questionSets.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(questions.createdAt))
    .limit(Math.min(Math.max(parsed.data.limit * 8, 80), 240));

  const reviewedRows = rows.map((row) => ({
    ...row,
    passage: resolveEffectivePassage({
      passage: row.passage,
      questionSetContent: row.questionSetContent,
    }),
    qualityReview: reviewQuestionQuality({
      id: row.id,
      section: row.sectionKey,
      topic: row.topicName,
      difficulty: row.difficulty,
      passage: resolveEffectivePassage({
        passage: row.passage,
        questionSetContent: row.questionSetContent,
      }),
      question_text: row.prompt,
      choices: row.choices,
      correct_answer: row.correctAnswer,
      explanation: row.explanation,
    }),
    shadowReview: parseShadowReview(row.reviewNotes),
  }));

  const filteredRows = reviewedRows.filter((row) => {
    if (parsed.data.qualityFilter === "blocked") {
      return row.qualityReview.blockingFlags.length > 0;
    }

    if (parsed.data.qualityFilter === "warning") {
      return (
        row.qualityReview.blockingFlags.length === 0 && row.qualityReview.warningFlags.length > 0
      );
    }

    if (parsed.data.qualityFilter === "clean") {
      return (
        row.qualityReview.blockingFlags.length === 0 && row.qualityReview.warningFlags.length === 0
      );
    }

    return true;
  });

  const sortedRows = [...filteredRows].sort((left, right) => {
    if (parsed.data.sort === "newest") {
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }

    if (parsed.data.sort === "highest-risk") {
      if (right.qualityReview.riskScore !== left.qualityReview.riskScore) {
        return right.qualityReview.riskScore - left.qualityReview.riskScore;
      }

      if (right.qualityReview.blockingFlags.length !== left.qualityReview.blockingFlags.length) {
        return right.qualityReview.blockingFlags.length - left.qualityReview.blockingFlags.length;
      }

      if (right.qualityReview.warningFlags.length !== left.qualityReview.warningFlags.length) {
        return right.qualityReview.warningFlags.length - left.qualityReview.warningFlags.length;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }

    if (right.qualityReview.blockingFlags.length !== left.qualityReview.blockingFlags.length) {
      return right.qualityReview.blockingFlags.length - left.qualityReview.blockingFlags.length;
    }

    if (right.qualityReview.riskScore !== left.qualityReview.riskScore) {
      return right.qualityReview.riskScore - left.qualityReview.riskScore;
    }

    if (right.qualityReview.warningFlags.length !== left.qualityReview.warningFlags.length) {
      return right.qualityReview.warningFlags.length - left.qualityReview.warningFlags.length;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  return NextResponse.json({
    questions: sortedRows.slice(0, parsed.data.limit),
  });
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

  if (parsed.data.mode === "bulk") {
    const updatedQuestions = await db
      .update(questions)
      .set({
        status: parsed.data.status,
        reviewNotes,
        reviewedAt: now,
        reviewedByUserId: session.user.id,
        updatedAt: now,
      })
      .where(inArray(questions.id, parsed.data.questionIds))
      .returning({
        id: questions.id,
        status: questions.status,
        reviewNotes: questions.reviewNotes,
        reviewedAt: questions.reviewedAt,
      });

    return NextResponse.json({
      updatedCount: updatedQuestions.length,
      questions: updatedQuestions,
    });
  }

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
