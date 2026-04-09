import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { actTopics, questions } from "@/db/schema";
import { getAdminSession } from "@/lib/admin";
import { auditTopicInventory } from "@/lib/content-audit";
import { getDb } from "@/lib/db";

const execFileAsync = promisify(execFile);

const generateSchema = z.object({
  sectionKey: z.enum(["english", "math", "reading", "science"]),
  topicSlug: z.string().trim().min(1),
  perDifficulty: z.coerce.number().int().min(1).max(3).default(1),
  status: z.enum(["draft", "published"]).default("draft"),
});

export async function GET() {
  const session = await getAdminSession();
  const db = getDb();

  if (!session || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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

  const topics = topicRows
    .map((topic) =>
      auditTopicInventory(topic, questionsByTopicId.get(topic.id) ?? [])
    )
    .sort((left, right) => {
      if (left.needsWork !== right.needsWork) {
        return left.needsWork ? -1 : 1;
      }

      if (left.priorityScore !== right.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      if (left.sectionKey !== right.sectionKey) {
        return left.sectionKey.localeCompare(right.sectionKey);
      }

      return left.topicName.localeCompare(right.topicName);
    });

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

export async function POST(request: Request) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = generateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid generation request." }, { status: 400 });
  }

  try {
    const provider = resolveGenerationProvider();
    const model = resolveGenerationModel(provider);
    const child = await execFileAsync(
      "node",
      [
        "generate-questions.mjs",
        `--section=${parsed.data.sectionKey}`,
        `--topic=${parsed.data.topicSlug}`,
        `--per-difficulty=${parsed.data.perDifficulty}`,
        `--status=${parsed.data.status}`,
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

    return NextResponse.json({
      summary: extractJsonSummary(child.stdout),
      stdout: child.stdout,
      stderr: child.stderr,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
