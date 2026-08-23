import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { actTopics, questions, questionSets } from "@/db/schema";
import { getAdminSession } from "@/lib/admin";
import {
  auditSectionTopicIntegrity,
  auditTopicInventory,
  selectTopicsForBacklogFill,
  sortTopicsByPriority,
} from "@/lib/content-audit";
import { getDb } from "@/lib/db";
import { DEFAULT_GROQ_MODEL, resolvePreferredGroqModel } from "@/lib/groq-models";
import { resolveEffectivePassage } from "@/lib/question-sets";

const execFileAsync = promisify(execFile);
const sectionKeySchema = z.enum(["english", "math", "reading", "science"]);
const difficultyKeySchema = z.enum(["easy", "medium", "hard"]);
const prioritySchema = z.enum(["critical", "rebuild", "watch", "healthy"]);
const launchSprintPresetSchema = z.enum(["critical-gaps", "launch-minimum"]);
const DIFFICULTY_KEYS = ["easy", "medium", "hard"] as const;
const MAX_TOPIC_CHILD_COUNT = 24;
const MAX_BULK_CHILD_COUNT = 72;
const priorityTieBreaker: Record<(typeof DIFFICULTY_KEYS)[number], number> = {
  hard: 3,
  medium: 2,
  easy: 1,
};
const launchMinimumSectionTargets = {
  english: 100,
  math: 90,
  reading: 72,
  science: 80,
} as const;
const criticalPresetTopicOrder = [
  "science:data-representation",
  "reading:natural-science",
  "math:functions",
  "math:integrating-essential-skills",
  "math:modeling",
  "reading:social-science",
  "reading:literary-narrative",
] as const;

const singleGenerateSchema = z.object({
  mode: z.literal("single").optional(),
  sectionKey: z.enum(["english", "math", "reading", "science"]),
  topicSlug: z.string().trim().min(1),
  requestedChildCount: z.coerce.number().int().min(1).max(MAX_TOPIC_CHILD_COUNT).default(3),
  status: z.enum(["draft", "published"]).default("draft"),
});

const bulkGenerateSchema = z.object({
  mode: z.literal("bulk"),
  sectionKeys: z.array(sectionKeySchema).min(1).max(4).default(["math", "reading"]),
  priorities: z.array(prioritySchema).min(1).max(4).default(["critical"]),
  preferredDifficulties: z.array(difficultyKeySchema).min(1).max(3).default(["hard", "medium"]),
  maxTopics: z.coerce.number().int().min(1).max(12).default(6),
  requestedChildCount: z.coerce.number().int().min(1).max(MAX_TOPIC_CHILD_COUNT).default(6),
  status: z.enum(["draft", "published"]).default("draft"),
});

const launchSprintGenerateSchema = z.object({
  mode: z.literal("launch-sprint"),
  preset: launchSprintPresetSchema,
  status: z.literal("draft").default("draft"),
});

const generateSchema = z.union([singleGenerateSchema, bulkGenerateSchema, launchSprintGenerateSchema]);

type DifficultyKey = z.infer<typeof difficultyKeySchema>;
type AuditedTopic = Awaited<ReturnType<typeof loadAuditedTopics>>[number];
type DifficultyCounts = Record<DifficultyKey, number>;
type TopicGenerationPlan = {
  sectionKey: string;
  topicSlug: string;
  topicName: string;
  reviewPriority: AuditedTopic["reviewPriority"];
  focusDifficulty: AuditedTopic["focusDifficulty"];
  publishedGapCount: number;
  requestedChildCount: number;
  requestedDifficultyCounts: DifficultyCounts;
  plannedSetCount: number;
};

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
        questionId: questions.id,
        questionSectionKey: questions.sectionKey,
        topicSectionKey: actTopics.sectionKey,
        sectionKey: questions.sectionKey,
        topicId: questions.topicId,
        topicSlug: actTopics.slug,
        topicName: actTopics.name,
        difficulty: questions.difficulty,
        status: questions.status,
        prompt: questions.prompt,
        passage: questions.passage,
        questionSetContent: questionSets.content,
        choices: questions.choices,
        correctAnswer: questions.correctAnswer,
        explanation: questions.explanation,
      })
      .from(questions)
      .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
      .leftJoin(questionSets, eq(questions.questionSetId, questionSets.id))
      .where(eq(actTopics.isActive, true)),
  ]);

  const questionsByTopicId = questionRows.reduce(
    (map, row) => {
      const currentRows = map.get(row.topicId) ?? [];
      currentRows.push({
        ...row,
        passage: resolveEffectivePassage({
          passage: row.passage,
          questionSetContent: row.questionSetContent,
        }),
      });
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
  const integrityRows = await db
    .select({
      questionId: questions.id,
      questionSectionKey: questions.sectionKey,
      topicSectionKey: actTopics.sectionKey,
      topicSlug: actTopics.slug,
      topicName: actTopics.name,
    })
    .from(questions)
    .innerJoin(actTopics, eq(questions.topicId, actTopics.id));
  const integrity = auditSectionTopicIntegrity(integrityRows);

  return NextResponse.json({ topics, integrity });
}

function extractJsonSummary(stdout: string) {
  const lines = stdout.trim().split("\n");
  const startIndex = lines.findIndex((line) => line.trim().startsWith("{"));

  if (startIndex === -1) {
    throw new Error("Generation script did not return a JSON summary.");
  }

  return JSON.parse(lines.slice(startIndex).join("\n"));
}

function emptyDifficultyCounts(): DifficultyCounts {
  return {
    easy: 0,
    medium: 0,
    hard: 0,
  };
}

function sumDifficultyCounts(counts: DifficultyCounts) {
  return DIFFICULTY_KEYS.reduce((sum, difficulty) => sum + counts[difficulty], 0);
}

function buildDifficultyPlanArg(counts: DifficultyCounts) {
  return DIFFICULTY_KEYS.map((difficulty) => `${difficulty}:${counts[difficulty]}`).join(",");
}

function countPlannedSets(sectionKey: string, counts: DifficultyCounts) {
  if (sectionKey !== "reading" && sectionKey !== "science") {
    return 0;
  }

  const totalRequested = sumDifficultyCounts(counts);
  return totalRequested > 0 ? Math.ceil(totalRequested / 6) : 0;
}

function resolveRequestedChildCountForPreset(topic: AuditedTopic, preset: z.infer<typeof launchSprintPresetSchema>) {
  const highestDifficultyGap = Math.max(...topic.difficultyBreakdown.map((difficulty) => difficulty.publishedGapCount));
  const hasZeroServeableInventory = topic.serveablePublishedCount === 0;

  if (topic.sectionKey === "reading" || topic.sectionKey === "science") {
    if (preset === "launch-minimum") {
      return hasZeroServeableInventory || topic.publishedGapCount >= 8 || highestDifficultyGap >= 3 ? 12 : 6;
    }

    return hasZeroServeableInventory || topic.publishedGapCount >= 6 || highestDifficultyGap >= 3 ? 12 : 6;
  }

  if (preset === "launch-minimum") {
    if (hasZeroServeableInventory || topic.publishedGapCount >= 8 || highestDifficultyGap >= 3) {
      return 12;
    }

    if (topic.publishedGapCount >= 4 || highestDifficultyGap >= 2) {
      return 6;
    }

    return 3;
  }

  if (hasZeroServeableInventory || topic.publishedGapCount >= 6 || highestDifficultyGap >= 2) {
    return 6;
  }

  return 3;
}

function allocateRequestedDifficultyCounts(topic: AuditedTopic, requestedChildCount: number): DifficultyCounts {
  const counts = emptyDifficultyCounts();
  const difficultyMap = new Map(
    topic.difficultyBreakdown.map((difficulty) => [difficulty.difficulty, difficulty])
  );
  let remaining = requestedChildCount;

  while (remaining > 0) {
    const rankedByGap = [...DIFFICULTY_KEYS].sort((left, right) => {
      const leftGap = Math.max(0, (difficultyMap.get(left)?.publishedGapCount ?? 0) - counts[left]);
      const rightGap = Math.max(0, (difficultyMap.get(right)?.publishedGapCount ?? 0) - counts[right]);

      if (rightGap !== leftGap) {
        return rightGap - leftGap;
      }

      const leftServeable = difficultyMap.get(left)?.serveablePublishedCount ?? 0;
      const rightServeable = difficultyMap.get(right)?.serveablePublishedCount ?? 0;

      if (leftServeable !== rightServeable) {
        return leftServeable - rightServeable;
      }

      return priorityTieBreaker[right] - priorityTieBreaker[left];
    });

    const gapTarget = rankedByGap.find(
      (difficulty) => Math.max(0, (difficultyMap.get(difficulty)?.publishedGapCount ?? 0) - counts[difficulty]) > 0
    );

    if (!gapTarget) {
      break;
    }

    counts[gapTarget] += 1;
    remaining -= 1;
  }

  while (remaining > 0) {
    const overflowTarget = [...DIFFICULTY_KEYS].sort((left, right) => {
      const leftProjected = (difficultyMap.get(left)?.serveablePublishedCount ?? 0) + counts[left];
      const rightProjected = (difficultyMap.get(right)?.serveablePublishedCount ?? 0) + counts[right];

      if (leftProjected !== rightProjected) {
        return leftProjected - rightProjected;
      }

      return priorityTieBreaker[right] - priorityTieBreaker[left];
    })[0];

    counts[overflowTarget] += 1;
    remaining -= 1;
  }

  return counts;
}

function buildTopicPlan(topic: AuditedTopic, requestedChildCount: number): TopicGenerationPlan {
  const requestedDifficultyCounts = allocateRequestedDifficultyCounts(topic, requestedChildCount);

  return {
    sectionKey: topic.sectionKey,
    topicSlug: topic.topicSlug,
    topicName: topic.topicName,
    reviewPriority: topic.reviewPriority,
    focusDifficulty: topic.focusDifficulty,
    publishedGapCount: topic.publishedGapCount,
    requestedChildCount: sumDifficultyCounts(requestedDifficultyCounts),
    requestedDifficultyCounts,
    plannedSetCount: countPlannedSets(topic.sectionKey, requestedDifficultyCounts),
  };
}

function enforceBulkCap(plans: TopicGenerationPlan[]) {
  const totalRequestedChildCount = plans.reduce((sum, plan) => sum + plan.requestedChildCount, 0);

  if (totalRequestedChildCount > MAX_BULK_CHILD_COUNT) {
    throw new Error(
      `Generation request exceeds the admin safety cap of ${MAX_BULK_CHILD_COUNT} child questions. Reduce the batch size or topic count and try again.`
    );
  }

  return totalRequestedChildCount;
}

function buildCriticalSprintPlans(auditedTopics: AuditedTopic[]) {
  const preferredIndex = new Map<string, number>(
    criticalPresetTopicOrder.map((topicKey, index) => [topicKey, index])
  );

  const candidates = auditedTopics
    .filter(
      (topic) =>
        topic.needsWork &&
        (topic.reviewPriority === "critical" || topic.serveablePublishedCount === 0)
    )
    .sort((left, right) => {
      const leftKey = `${left.sectionKey}:${left.topicSlug}`;
      const rightKey = `${right.sectionKey}:${right.topicSlug}`;
      const leftIndex = preferredIndex.get(leftKey);
      const rightIndex = preferredIndex.get(rightKey);

      if (leftIndex !== undefined || rightIndex !== undefined) {
        if (leftIndex === undefined) {
          return 1;
        }

        if (rightIndex === undefined) {
          return -1;
        }

        return leftIndex - rightIndex;
      }

      if (left.serveablePublishedCount === 0 && right.serveablePublishedCount !== 0) {
        return -1;
      }

      if (right.serveablePublishedCount === 0 && left.serveablePublishedCount !== 0) {
        return 1;
      }

      if (left.priorityScore !== right.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      return left.topicName.localeCompare(right.topicName);
    });

  const plans: TopicGenerationPlan[] = [];
  let remainingTotal = MAX_BULK_CHILD_COUNT;

  for (const topic of candidates) {
    const requestedChildCount = resolveRequestedChildCountForPreset(topic, "critical-gaps");

    if (requestedChildCount > remainingTotal) {
      continue;
    }

    plans.push(buildTopicPlan(topic, requestedChildCount));
    remainingTotal -= requestedChildCount;

    if (remainingTotal < 3) {
      break;
    }
  }

  return plans;
}

function buildLaunchMinimumPlans(auditedTopics: AuditedTopic[]) {
  const sectionServeableCounts = auditedTopics.reduce<Record<string, number>>((counts, topic) => {
    counts[topic.sectionKey] = (counts[topic.sectionKey] ?? 0) + topic.serveablePublishedCount;
    return counts;
  }, {});
  const sectionDeficits = Object.fromEntries(
    Object.entries(launchMinimumSectionTargets).map(([sectionKey, target]) => [
      sectionKey,
      Math.max(0, target - (sectionServeableCounts[sectionKey] ?? 0)),
    ])
  ) as Record<keyof typeof launchMinimumSectionTargets, number>;
  const candidates = sortTopicsByPriority(
    auditedTopics.filter((topic) => (sectionDeficits[topic.sectionKey as keyof typeof sectionDeficits] ?? 0) > 0)
  );
  const plans: TopicGenerationPlan[] = [];
  let remainingTotal = MAX_BULK_CHILD_COUNT;

  for (const topic of candidates) {
    const sectionKey = topic.sectionKey as keyof typeof launchMinimumSectionTargets;
    const remainingSectionDeficit = sectionDeficits[sectionKey] ?? 0;

    if (remainingSectionDeficit <= 0 || remainingTotal < 3) {
      continue;
    }

    const suggestedChildCount = resolveRequestedChildCountForPreset(topic, "launch-minimum");
    const requestedChildCount = Math.min(suggestedChildCount, remainingTotal);

    if (requestedChildCount < 3) {
      break;
    }

    const plan = buildTopicPlan(topic, requestedChildCount);
    plans.push(plan);
    remainingTotal -= plan.requestedChildCount;
    sectionDeficits[sectionKey] = Math.max(0, remainingSectionDeficit - plan.requestedChildCount);
  }

  return plans;
}

function resolveGenerationProvider() {
  const configuredProvider =
    process.env.QUESTION_GENERATION_PROVIDER || process.env.CONTENT_GENERATION_PROVIDER;
  const hasOllamaConfig = Boolean(
    process.env.OLLAMA_GENERATION_MODEL ||
      process.env.OLLAMA_REVIEW_MODEL ||
      process.env.OLLAMA_MODEL ||
      process.env.OLLAMA_API_BASE_URL ||
      process.env.OLLAMA_BASE_URL
  );
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const hasGroqKey = Boolean(process.env.GROQ_API_KEY);

  if (configuredProvider?.trim()) {
    return configuredProvider.trim().toLowerCase();
  }

  if (hasOllamaConfig) {
    return "ollama";
  }

  if (hasGeminiKey) {
    return "gemini";
  }

  if (hasGroqKey) {
    return "groq";
  }

  return "gemini";
}

function resolveGenerationModel(provider: string) {
  if (provider === "ollama") {
    return process.env.OLLAMA_GENERATION_MODEL || process.env.OLLAMA_MODEL || "gemma3:4b";
  }

  if (provider === "groq") {
    return resolvePreferredGroqModel(
      process.env.GROQ_GENERATION_MODEL,
      process.env.GROQ_MODEL,
      DEFAULT_GROQ_MODEL
    );
  }

  return process.env.GEMINI_GENERATION_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
}

async function runGeneration({
  sectionKey,
  topicSlug,
  requestedDifficultyCounts,
  status,
}: {
  sectionKey: string;
  topicSlug: string;
  requestedDifficultyCounts: DifficultyCounts;
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
      `--difficulty-plan=${buildDifficultyPlanArg(requestedDifficultyCounts)}`,
      `--status=${status}`,
      `--provider=${provider}`,
      `--model=${model}`,
      "--delay-ms=0",
      "--fast-retry=1",
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
    const auditedTopics = await loadAuditedTopics(db);

    if (parsed.data.mode === "bulk") {
      const bulkRequest = parsed.data;
      const selectedTopics = selectTopicsForBacklogFill(auditedTopics, {
        sectionKeys: bulkRequest.sectionKeys,
        priorities: bulkRequest.priorities,
        preferredDifficulties: bulkRequest.preferredDifficulties,
        maxTopics: bulkRequest.maxTopics,
      });
      const plans = selectedTopics.map((topic) => buildTopicPlan(topic, bulkRequest.requestedChildCount));
      const totalRequestedChildCount = enforceBulkCap(plans);

      const results = [];

      for (const plan of plans) {
        const generation = await runGeneration({
          sectionKey: plan.sectionKey,
          topicSlug: plan.topicSlug,
          requestedDifficultyCounts: plan.requestedDifficultyCounts,
          status: bulkRequest.status,
        });

        results.push({
          sectionKey: plan.sectionKey,
          topicSlug: plan.topicSlug,
          topicName: plan.topicName,
          requestedChildCount: plan.requestedChildCount,
          requestedDifficultyCounts: plan.requestedDifficultyCounts,
          plannedSetCount: plan.plannedSetCount,
          reviewPriority: plan.reviewPriority,
          focusDifficulty: plan.focusDifficulty,
          publishedGapCount: plan.publishedGapCount,
          summary: generation.summary,
        });
      }

      return NextResponse.json({
        selection: {
          sectionKeys: bulkRequest.sectionKeys,
          priorities: bulkRequest.priorities,
          preferredDifficulties: bulkRequest.preferredDifficulties,
          maxTopics: bulkRequest.maxTopics,
          requestedChildCount: bulkRequest.requestedChildCount,
          totalRequestedChildCount,
          selectedTopicCount: selectedTopics.length,
          status: bulkRequest.status,
        },
        results,
      });
    }

    if (parsed.data.mode === "launch-sprint") {
      const launchSprintRequest = parsed.data;
      const plans =
        launchSprintRequest.preset === "critical-gaps"
          ? buildCriticalSprintPlans(auditedTopics)
          : buildLaunchMinimumPlans(auditedTopics);
      const totalRequestedChildCount = enforceBulkCap(plans);
      const results = [];

      for (const plan of plans) {
        const generation = await runGeneration({
          sectionKey: plan.sectionKey,
          topicSlug: plan.topicSlug,
          requestedDifficultyCounts: plan.requestedDifficultyCounts,
          status: "draft",
        });

        results.push({
          sectionKey: plan.sectionKey,
          topicSlug: plan.topicSlug,
          topicName: plan.topicName,
          requestedChildCount: plan.requestedChildCount,
          requestedDifficultyCounts: plan.requestedDifficultyCounts,
          plannedSetCount: plan.plannedSetCount,
          reviewPriority: plan.reviewPriority,
          focusDifficulty: plan.focusDifficulty,
          publishedGapCount: plan.publishedGapCount,
          summary: generation.summary,
        });
      }

      return NextResponse.json({
        selection: {
          preset: launchSprintRequest.preset,
          status: "draft",
          selectedTopicCount: plans.length,
          totalRequestedChildCount,
        },
        results,
      });
    }

    const singleRequest = parsed.data;
    const singleTopic = auditedTopics.find(
      (topic) => topic.sectionKey === singleRequest.sectionKey && topic.topicSlug === singleRequest.topicSlug
    );

    if (!singleTopic) {
      return NextResponse.json({ error: "Topic not found." }, { status: 404 });
    }

    const plan = buildTopicPlan(singleTopic, singleRequest.requestedChildCount);
    const generation = await runGeneration({
      sectionKey: singleRequest.sectionKey,
      topicSlug: singleRequest.topicSlug,
      requestedDifficultyCounts: plan.requestedDifficultyCounts,
      status: singleRequest.status,
    });

    return NextResponse.json({
      requestedChildCount: plan.requestedChildCount,
      requestedDifficultyCounts: plan.requestedDifficultyCounts,
      plannedSetCount: plan.plannedSetCount,
      summary: generation.summary,
      stdout: generation.stdout,
      stderr: generation.stderr,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
