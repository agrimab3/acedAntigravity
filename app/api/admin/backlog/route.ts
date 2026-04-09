import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { actTopics, questions } from "@/db/schema";
import { getAdminSession } from "@/lib/admin";
import {
  auditTopicInventory,
  selectTopicsForBacklogFill,
  sortTopicsByPriority,
} from "@/lib/content-audit";
import { getDb } from "@/lib/db";

const execFileAsync = promisify(execFile);
const sectionKeySchema = z.enum(["english", "math", "reading", "science"]);
const difficultyKeySchema = z.enum(["easy", "medium", "hard"]);
const prioritySchema = z.enum(["critical", "rebuild", "watch", "healthy"]);

const singleGenerateSchema = z.object({
  mode: z.literal("single").optional(),
  sectionKey: z.enum(["english", "math", "reading", "science"]),
  topicSlug: z.string().trim().min(1),
  perDifficulty: z.coerce.number().int().min(1).max(3).default(1),
  status: z.enum(["draft", "published"]).default("draft"),
});

const bulkGenerateSchema = z.object({
  mode: z.literal("bulk"),
  sectionKeys: z.array(sectionKeySchema).min(1).max(4).default(["math", "reading"]),
  priorities: z.array(prioritySchema).min(1).max(4).default(["critical"]),
  preferredDifficulties: z.array(difficultyKeySchema).min(1).max(3).default(["hard", "medium"]),
  maxTopics: z.coerce.number().int().min(1).max(12).default(6),
  status: z.enum(["draft", "published"]).default("draft"),
});

const generateSchema = z.union([singleGenerateSchema, bulkGenerateSchema]);

async function loadAuditedTopics(db: NonNullable<ReturnType<typeof getDb>>) {
  const [topicRows, questionRows] = await Promise.all([
    db
      .select({
        id: actTopics.id,
        sectionKey: actTopics.sectionKey,
        topicSlug: actTopics.slug,
        topicName: actTopics.name,
        displayOrder: actTopics.displayOrder,
      })
      .from(actTopics)
      .where(eq(actTopics.isActive, true))
      .orderBy(asc(actTopics.sectionKey), asc(actTopics.displayOrder)),
    db
      .select({
        sectionKey: questions.sectionKey,
        topicId: questions.topicId,
        topicSlug: actTopics.slug,
        topicName: actTopics.name,
        difficulty: questions.difficulty,
        status: questions.status,
        prompt: questions.prompt,
        passage: questions.passage,
        choices: questions.choices,
        correctAnswer: questions.correctAnswer,
        explanation: questions.explanation,
      })
      .from(questions)
      .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
      .where(eq(actTopics.isActive, true)),
  ]);

  const questionsByTopicId = questionRows.reduce(
    (map, row) => {
      const currentRows = map.get(row.topicId) ?? [];
      currentRows.push(row);
      map.set(row.topicId, currentRows);
      return map;
    },
    new Map<typeof topicRows[number]["id"], typeof questionRows>()
  );

  return sortTopicsByPriority(
    topicRows.map((topic) => auditTopicInventory(topic, questionsByTopicId.get(topic.id) ?? []))
  );
}

export async function GET() {
  const session = await getAdminSession();
  const db = getDb();

  if (!session || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const topics = await loadAuditedTopics(db);

  return NextResponse.json({ topics });
}

function extractJsonSummary(stdout: string) {
  const lines = stdout.trim().split("\n");
  const startIndex = lines.findIndex((line) => line.trim().startsWith("{"));

  if (startIndex === -1) {
    throw new Error("Generation script did not return a JSON summary.");
  }

  return JSON.parse(lines.slice(startIndex).join("\n"));
}

function resolveGenerationProvider() {
  return (
    process.env.QUESTION_GENERATION_PROVIDER ||
    process.env.CONTENT_GENERATION_PROVIDER ||
    (process.env.GROQ_API_KEY ? "groq" : "gemini")
  )
    .trim()
    .toLowerCase();
}

function resolveGenerationModel(provider: string) {
  if (provider === "groq") {
    return process.env.GROQ_GENERATION_MODEL || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  }

  return process.env.GEMINI_GENERATION_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
}

async function runGeneration({
  sectionKey,
  topicSlug,
  perDifficulty,
  status,
}: {
  sectionKey: string;
  topicSlug: string;
  perDifficulty: number;
  status: "draft" | "published";
}) {
  const provider = resolveGenerationProvider();
  const model = resolveGenerationModel(provider);
  const child = await execFileAsync(
    "node",
    [
      "generate-questions.mjs",
      `--section=${sectionKey}`,
      `--topic=${topicSlug}`,
      `--per-difficulty=${perDifficulty}`,
      `--status=${status}`,
      `--provider=${provider}`,
      `--model=${model}`,
      "--delay-ms=0",
      "--json=1",
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      timeout: 240000,
      maxBuffer: 1024 * 1024 * 4,
    }
  );

  return {
    provider,
    model,
    summary: extractJsonSummary(child.stdout),
    stdout: child.stdout,
    stderr: child.stderr,
  };
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  const db = getDb();

  if (!session || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = generateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid generation request." }, { status: 400 });
  }

  try {
    if (parsed.data.mode === "bulk") {
      const auditedTopics = await loadAuditedTopics(db);
      const selectedTopics = selectTopicsForBacklogFill(auditedTopics, {
        sectionKeys: parsed.data.sectionKeys,
        priorities: parsed.data.priorities,
        preferredDifficulties: parsed.data.preferredDifficulties,
        maxTopics: parsed.data.maxTopics,
      });

      const results = [];

      for (const topic of selectedTopics) {
        const generation = await runGeneration({
          sectionKey: topic.sectionKey,
          topicSlug: topic.topicSlug,
          perDifficulty: topic.recommendedPerDifficulty,
          status: parsed.data.status,
        });

        results.push({
          sectionKey: topic.sectionKey,
          topicSlug: topic.topicSlug,
          topicName: topic.topicName,
          perDifficulty: topic.recommendedPerDifficulty,
          reviewPriority: topic.reviewPriority,
          focusDifficulty: topic.focusDifficulty,
          publishedGapCount: topic.publishedGapCount,
          summary: generation.summary,
        });
      }

      return NextResponse.json({
        selection: {
          sectionKeys: parsed.data.sectionKeys,
          priorities: parsed.data.priorities,
          preferredDifficulties: parsed.data.preferredDifficulties,
          maxTopics: parsed.data.maxTopics,
          selectedTopicCount: selectedTopics.length,
          status: parsed.data.status,
        },
        results,
      });
    }

    const generation = await runGeneration({
      sectionKey: parsed.data.sectionKey,
      topicSlug: parsed.data.topicSlug,
      perDifficulty: parsed.data.perDifficulty,
      status: parsed.data.status,
    });

    return NextResponse.json({
      summary: generation.summary,
      stdout: generation.stdout,
      stderr: generation.stderr,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
