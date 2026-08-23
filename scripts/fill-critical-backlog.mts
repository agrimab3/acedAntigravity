import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_GROQ_MODEL, resolvePreferredGroqModel } from "../lib/groq-models";
import { Client } from "pg";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.join("=") || "true"];
    })
);

const execFileAsync = promisify(execFile);
const databaseUrl = args["database-url"] || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const sections = (args.sections || "math,reading")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const priorities = (args.priorities || "critical")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const preferredDifficulties = (args["preferred-difficulties"] || "hard,medium")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const maxTopics = Math.max(1, Math.min(12, Number(args["max-topics"] || 6)));
const status = (args.status || "draft").trim().toLowerCase();
const topicSleepMs = Math.max(0, Number(args["topic-sleep-ms"] || 0));
const dryRun = args["dry-run"] === "true" || args["dry-run"] === "1";
const generationProvider = resolveGenerationProvider(args.provider);
const generationModel = resolveGenerationModel(generationProvider, args.model);
const contentDifficulties = ["easy", "medium", "hard"] as const;
const publishedTarget = 10;
const publishedDifficultyTarget = 3;

type ChoiceMap = Record<"A" | "B" | "C" | "D", string>;

if (!["draft", "published"].includes(status)) {
  throw new Error(`Invalid status: ${status}`);
}

const client = new Client({
  connectionString: databaseUrl,
});

function resolveGenerationProvider(rawProvider?: string) {
  return (
    rawProvider ||
    process.env.QUESTION_GENERATION_PROVIDER ||
    process.env.CONTENT_GENERATION_PROVIDER ||
    (process.env.GROQ_API_KEY ? "groq" : "gemini")
  )
    .trim()
    .toLowerCase();
}

function resolveGenerationModel(provider: string, rawModel?: string) {
  if (provider === "groq") {
    return resolvePreferredGroqModel(
      rawModel,
      process.env.GROQ_GENERATION_MODEL,
      process.env.GROQ_MODEL,
      DEFAULT_GROQ_MODEL
    );
  }

  if (rawModel?.trim()) {
    return rawModel.trim();
  }

  return process.env.GEMINI_GENERATION_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCorrectAnswer(answer: string) {
  const normalized = answer.trim().toUpperCase();
  return ["A", "B", "C", "D"].includes(normalized) ? (normalized as keyof ChoiceMap) : null;
}

function parseNumericEquivalent(value: string) {
  const normalized = value.replace(/,/g, "").replace(/\s+/g, "").trim();

  if (!normalized) {
    return null;
  }

  if (/^-?\d+\/-?\d+$/.test(normalized)) {
    const [numerator, denominator] = normalized.split("/").map(Number);

    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }

    return numerator / denominator;
  }

  if (/^-?\d*\.?\d+%$/.test(normalized)) {
    const numeric = Number(normalized.slice(0, -1));
    return Number.isFinite(numeric) ? numeric / 100 : null;
  }

  if (/^-?\d*\.?\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function normalizeChoiceForComparison(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function areEquivalentChoices(left: string, right: string) {
  const normalizedLeft = normalizeChoiceForComparison(left);
  const normalizedRight = normalizeChoiceForComparison(right);

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const numericLeft = parseNumericEquivalent(normalizedLeft);
  const numericRight = parseNumericEquivalent(normalizedRight);

  if (numericLeft === null || numericRight === null) {
    return false;
  }

  return Math.abs(numericLeft - numericRight) < 1e-9;
}

function hasUnderlineMarkup(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /\[underline\].*?\[\/underline\]|__(.*?)__|<u>.*?<\/u>/i.test(value);
}

function countWords(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function reviewQuestionQuality(row: {
  id: string;
  section: string;
  topic: string;
  difficulty: string;
  passage: string | null;
  question_text: string;
  choices: ChoiceMap;
  correct_answer: string;
  explanation: string;
}) {
  const flags: Array<{ severity: "reject" | "warn"; code: string; message: string }> = [];
  const correctAnswer = normalizeCorrectAnswer(row.correct_answer);
  const choices = row.choices;

  if (!correctAnswer || !choices || !choices[correctAnswer]) {
    flags.push({
      severity: "reject",
      code: "invalid-answer-map",
      message: "Correct answer mapping is invalid or incomplete.",
    });
  }

  if (choices) {
    const choiceValues = (["A", "B", "C", "D"] as const).map((choice) => choices[choice]);

    for (let index = 0; index < choiceValues.length; index += 1) {
      for (let innerIndex = index + 1; innerIndex < choiceValues.length; innerIndex += 1) {
        if (areEquivalentChoices(choiceValues[index], choiceValues[innerIndex])) {
          flags.push({
            severity: "reject",
            code: "equivalent-choices",
            message: "Two answer choices collapse to the same value or meaning.",
          });
        }
      }
    }
  }

  const combinedText = `${row.question_text} ${row.passage ?? ""}`.toLowerCase();
  const normalizedDifficulty = row.difficulty.trim().toLowerCase();
  const promptWordCount = countWords(row.question_text);
  const passageWordCount = countWords(row.passage);
  const explanationWordCount = countWords(row.explanation);
  const allNumericChoices =
    choices !== null &&
    Object.values(choices).every((choice) => /^-?\d+(\.\d+)?$/.test(choice.trim()));
  const isMediumHard = normalizedDifficulty === "medium" || normalizedDifficulty === "hard";

  if (row.section === "english" && (!row.passage || row.passage.trim().length === 0)) {
    flags.push({
      severity: "reject",
      code: "english-no-passage",
      message: "English revision question is missing passage context.",
    });
  }

  if (row.section === "reading" && (!row.passage || row.passage.trim().length === 0)) {
    flags.push({
      severity: "reject",
      code: "reading-no-passage",
      message: "Reading question is missing passage text.",
    });
  }

  if (row.section === "science" && (!row.passage || row.passage.trim().length === 0)) {
    flags.push({
      severity: "reject",
      code: "science-no-setup",
      message: "Science question is missing experiment or data setup.",
    });
  }

  if (
    row.section === "english" &&
    /\b(identify|what is the function|which punctuation mark|what is the subject|define|part of speech|best synonym)\b/.test(
      combinedText
    )
  ) {
    flags.push({
      severity: "reject",
      code: "english-terminology-quiz",
      message: "English item reads like terminology recall instead of ACT revision in context.",
    });
  }

  if (
    combinedText.includes("underlin") &&
    !hasUnderlineMarkup(row.question_text) &&
    !hasUnderlineMarkup(row.passage)
  ) {
    flags.push({
      severity: "reject",
      code: "missing-underline-markup",
      message: "Question refers to underlined text without marking it in the prompt or passage.",
    });
  }

  if (
    row.section === "math" &&
    normalizedDifficulty !== "easy" &&
    (
      /a rectangle has length .* what is its area\?/i.test(row.question_text) ||
      /what is the slope of the line passing through/i.test(row.question_text) ||
      /^solve for x:\s*[-\d+x\s=+]+$/i.test(row.question_text) ||
      (row.question_text.trim().length < 85 && allNumericChoices)
    )
  ) {
    flags.push({
      severity: "reject",
      code: "soft-math-stem",
      message: "Math item looks too direct or too clean to deserve a medium or hard label.",
    });
  }

  if (isMediumHard && explanationWordCount < 16) {
    flags.push({
      severity: "warn",
      code: "thin-explanation",
      message: "Explanation is thin for a medium or hard question and may not show real reasoning depth.",
    });
  }

  if (row.section === "english" && isMediumHard) {
    if (passageWordCount < 35) {
      flags.push({
        severity: "warn",
        code: "thin-english-context",
        message: "English passage context is short enough that the revision may feel too isolated.",
      });
    }

    if (promptWordCount < 9) {
      flags.push({
        severity: "warn",
        code: "thin-english-stem",
        message: "English prompt is very short for a medium or hard revision decision.",
      });
    }
  }

  if (row.section === "math" && isMediumHard) {
    if (promptWordCount < 14 && !row.passage) {
      flags.push({
        severity: "warn",
        code: "short-math-stem",
        message: "Math stem is unusually short for a medium or hard ACT item.",
      });
    }

    if (allNumericChoices && promptWordCount < 18) {
      flags.push({
        severity: "warn",
        code: "clean-numeric-choices",
        message: "All-numeric choices plus a short stem often signals a soft math item.",
      });
    }

    if (/^(solve|what is the value of x|what is x)/i.test(row.question_text.trim())) {
      flags.push({
        severity: "warn",
        code: "direct-math-ask",
        message: "Stem opens like a direct classroom drill instead of a fuller ACT setup.",
      });
    }
  }

  if (row.section === "reading" && isMediumHard) {
    if (passageWordCount < 55) {
      flags.push({
        severity: "warn",
        code: "short-reading-passage",
        message: "Reading passage is short enough that the question may not create real passage pressure.",
      });
    }

    if (promptWordCount < 10) {
      flags.push({
        severity: "warn",
        code: "short-reading-stem",
        message: "Reading stem is very short for a medium or hard discrimination task.",
      });
    }

    if (
      !/\b(infer|imply|suggest|tone|attitude|purpose|primarily|main|best supports|evidence|organization|meaning|context)\b/i.test(
        row.question_text
      )
    ) {
      flags.push({
        severity: "warn",
        code: "low-demand-reading-ask",
        message: "Reading stem may be too generic to reliably feel like true ACT medium or hard difficulty.",
      });
    }
  }

  if (row.section === "science" && isMediumHard) {
    if (passageWordCount < 45) {
      flags.push({
        severity: "warn",
        code: "thin-science-setup",
        message: "Science setup is short for a medium or hard data or experiment question.",
      });
    }

    if (
      !/\b(experiment|study|figure|table|graph|trial|sample|temperature|rate|scientist|researcher|viewpoint|results)\b/i.test(
        combinedText
      )
    ) {
      flags.push({
        severity: "warn",
        code: "weak-science-signal",
        message: "Science wording lacks the data or experiment signal expected from stronger ACT-style items.",
      });
    }
  }

  const blockingFlags = flags.filter((flag) => flag.severity === "reject");
  const warningFlags = flags.filter((flag) => flag.severity === "warn");
  const riskScore = blockingFlags.length * 3 + warningFlags.length + (isMediumHard ? 1 : 0);
  const shouldServe = blockingFlags.length === 0 && !(isMediumHard && warningFlags.length >= 2);

  return {
    shouldServe,
    riskScore,
    blockingFlags,
    warningFlags,
  };
}

function buildEmptyDifficultyAudit(difficulty: typeof contentDifficulties[number]) {
  return {
    difficulty,
    publishedCount: 0,
    serveablePublishedCount: 0,
    blockedPublishedCount: 0,
    warningPublishedCount: 0,
    draftCount: 0,
    serveableDraftCount: 0,
    blockedDraftCount: 0,
    warningDraftCount: 0,
    publishedGapCount: publishedDifficultyTarget,
  };
}

function getDifficultyGapCount(
  topic: ReturnType<typeof auditTopicInventory>,
  difficulty: typeof contentDifficulties[number]
) {
  return (
    topic.difficultyBreakdown.find((entry) => entry.difficulty === difficulty)?.publishedGapCount ?? 0
  );
}

function scoreTopicForBacklogFill(
  topic: ReturnType<typeof auditTopicInventory>,
  preferredTopicDifficulties: Array<typeof contentDifficulties[number]>
) {
  return preferredTopicDifficulties.reduce((score, difficulty, index) => {
    const weight = preferredTopicDifficulties.length - index + 1;
    return score + getDifficultyGapCount(topic, difficulty) * weight * 3;
  }, topic.priorityScore);
}

function selectTopicsForBacklogFill(
  topics: Array<ReturnType<typeof auditTopicInventory>>,
  {
    sectionKeys,
    priorities,
    preferredTopicDifficulties,
    maxTopicCount,
  }: {
    sectionKeys: string[];
    priorities: string[];
    preferredTopicDifficulties: Array<typeof contentDifficulties[number]>;
    maxTopicCount: number;
  }
) {
  return [...topics]
    .sort((left, right) => {
      if (left.needsWork !== right.needsWork) {
        return left.needsWork ? -1 : 1;
      }

      const leftScore = scoreTopicForBacklogFill(left, preferredTopicDifficulties);
      const rightScore = scoreTopicForBacklogFill(right, preferredTopicDifficulties);

      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      if (left.sectionKey !== right.sectionKey) {
        return left.sectionKey.localeCompare(right.sectionKey);
      }

      return left.topicName.localeCompare(right.topicName);
    })
    .filter((topic) => {
      if (!topic.needsWork) {
        return false;
      }

      if (!sectionKeys.includes(topic.sectionKey)) {
        return false;
      }

      if (priorities.length > 0 && !priorities.includes(topic.reviewPriority)) {
        return false;
      }

      return true;
    })
    .slice(0, maxTopicCount);
}

function auditTopicInventory(
  topic: {
    id: string;
    sectionKey: string;
    topicSlug: string;
    topicName: string;
  },
  questionRows: Array<{
    sectionKey: string;
    topicName: string;
    difficulty: string;
    status: string;
    prompt: string;
    passage: string | null;
    choices: Record<"A" | "B" | "C" | "D", string>;
    correctAnswer: string;
    explanation: string;
  }>
) {
  const difficultyBreakdownMap = new Map(
    contentDifficulties.map((difficulty) => [difficulty, buildEmptyDifficultyAudit(difficulty)])
  );

  let draftCount = 0;
  let rawPublishedCount = 0;
  let rejectedCount = 0;
  let serveablePublishedCount = 0;
  let serveableDraftCount = 0;
  let blockedPublishedCount = 0;
  let blockedDraftCount = 0;
  let warningPublishedCount = 0;
  let warningDraftCount = 0;

  for (const row of questionRows) {
    const difficultyKey = contentDifficulties.find((difficulty) => difficulty === row.difficulty.trim().toLowerCase());
    const difficultyAudit = difficultyKey ? difficultyBreakdownMap.get(difficultyKey) : null;

    if (row.status === "rejected") {
      rejectedCount += 1;
      continue;
    }

    const qualityReview = reviewQuestionQuality({
      id: `${topic.id}:${row.difficulty}:${row.status}`,
      section: row.sectionKey,
      topic: row.topicName,
      difficulty: row.difficulty,
      passage: row.passage,
      question_text: row.prompt,
      choices: row.choices,
      correct_answer: row.correctAnswer,
      explanation: row.explanation,
    });

    if (row.status === "published") {
      rawPublishedCount += 1;
      if (difficultyAudit) {
        difficultyAudit.publishedCount += 1;
      }

      if (qualityReview.shouldServe) {
        serveablePublishedCount += 1;
        if (difficultyAudit) {
          difficultyAudit.serveablePublishedCount += 1;
        }
      } else {
        blockedPublishedCount += 1;
        if (difficultyAudit) {
          difficultyAudit.blockedPublishedCount += 1;
        }
      }

      if (qualityReview.warningFlags.length > 0) {
        warningPublishedCount += 1;
        if (difficultyAudit) {
          difficultyAudit.warningPublishedCount += 1;
        }
      }

      continue;
    }

    draftCount += 1;
    if (difficultyAudit) {
      difficultyAudit.draftCount += 1;
    }

    if (qualityReview.shouldServe) {
      serveableDraftCount += 1;
      if (difficultyAudit) {
        difficultyAudit.serveableDraftCount += 1;
      }
    } else {
      blockedDraftCount += 1;
      if (difficultyAudit) {
        difficultyAudit.blockedDraftCount += 1;
      }
    }

    if (qualityReview.warningFlags.length > 0) {
      warningDraftCount += 1;
      if (difficultyAudit) {
        difficultyAudit.warningDraftCount += 1;
      }
    }
  }

  const difficultyBreakdown = contentDifficulties.map((difficulty) => {
    const difficultyAudit = difficultyBreakdownMap.get(difficulty);

    if (!difficultyAudit) {
      return buildEmptyDifficultyAudit(difficulty);
    }

    return {
      ...difficultyAudit,
      publishedGapCount: Math.max(0, publishedDifficultyTarget - difficultyAudit.serveablePublishedCount),
    };
  });

  const mediumGap =
    difficultyBreakdown.find((difficulty) => difficulty.difficulty === "medium")?.publishedGapCount ?? 0;
  const hardGap =
    difficultyBreakdown.find((difficulty) => difficulty.difficulty === "hard")?.publishedGapCount ?? 0;
  const publishedGapCount = Math.max(0, publishedTarget - serveablePublishedCount);
  const highestDifficultyGap = Math.max(...difficultyBreakdown.map((difficulty) => difficulty.publishedGapCount));
  const needsWork =
    publishedGapCount > 0 || difficultyBreakdown.some((difficulty) => difficulty.publishedGapCount > 0);
  const reviewPriority =
    publishedGapCount >= 5 || hardGap >= 2 || mediumGap >= 2
      ? "critical"
      : publishedGapCount > 0 || blockedPublishedCount > 0
        ? "rebuild"
        : warningPublishedCount > 0
          ? "watch"
          : "healthy";
  const focusDifficulty =
    [...difficultyBreakdown]
      .sort((left, right) => {
        if (right.publishedGapCount !== left.publishedGapCount) {
          return right.publishedGapCount - left.publishedGapCount;
        }

        const priorityOrder: Record<(typeof contentDifficulties)[number], number> = {
          hard: 3,
          medium: 2,
          easy: 1,
        };

        return priorityOrder[right.difficulty] - priorityOrder[left.difficulty];
      })[0]?.publishedGapCount > 0
      ? [...difficultyBreakdown].sort((left, right) => {
          if (right.publishedGapCount !== left.publishedGapCount) {
            return right.publishedGapCount - left.publishedGapCount;
          }

          const priorityOrder: Record<(typeof contentDifficulties)[number], number> = {
            hard: 3,
            medium: 2,
            easy: 1,
          };

          return priorityOrder[right.difficulty] - priorityOrder[left.difficulty];
        })[0]?.difficulty
      : "balanced";

  return {
    sectionKey: topic.sectionKey,
    topicSlug: topic.topicSlug,
    topicName: topic.topicName,
    draftCount,
    rawPublishedCount,
    rejectedCount,
    targetCount: publishedTarget,
    targetPerDifficulty: publishedDifficultyTarget,
    serveablePublishedCount,
    serveableDraftCount,
    blockedPublishedCount,
    blockedDraftCount,
    warningPublishedCount,
    warningDraftCount,
    publishedGapCount,
    needsWork,
    reviewPriority,
    focusDifficulty,
    recommendedPerDifficulty: needsWork
      ? Math.min(3, Math.max(1, Math.max(highestDifficultyGap, Math.ceil(publishedGapCount / contentDifficulties.length))))
      : 1,
    priorityScore:
      publishedGapCount * 4 +
      mediumGap * 2 +
      hardGap * 3 +
      blockedPublishedCount * 2 +
      warningPublishedCount +
      blockedDraftCount,
    difficultyBreakdown,
  };
}

function extractJsonSummary(stdout: string) {
  const lines = stdout.trim().split("\n");
  const startIndex = lines.findIndex((line) => line.trim().startsWith("{"));

  if (startIndex === -1) {
    throw new Error("Generation script did not return JSON.");
  }

  return JSON.parse(lines.slice(startIndex).join("\n"));
}

async function loadAuditedTopics() {
  const [topicResult, questionResult] = await Promise.all([
    client.query(
      `
        select
          t.id,
          t.section_key as "sectionKey",
          t.slug as "topicSlug",
          t.name as "topicName"
        from act_topics t
        where t.is_active = true
        order by t.section_key, t.display_order
      `
    ),
    client.query(
      `
        select
          q.section_key as "sectionKey",
          q.topic_id as "topicId",
          t.slug as "topicSlug",
          t.name as "topicName",
          q.difficulty,
          q.status,
          q.prompt,
          q.passage,
          q.choices,
          q.correct_answer as "correctAnswer",
          q.explanation
        from questions q
        inner join act_topics t on q.topic_id = t.id
        where t.is_active = true
      `
    ),
  ]);

  const questionsByTopicId = questionResult.rows.reduce(
    (map, row) => {
      const currentRows = map.get(row.topicId) ?? [];
      currentRows.push(row);
      map.set(row.topicId, currentRows);
      return map;
    },
    new Map<string, typeof questionResult.rows>()
  );

  return topicResult.rows.map((topic) =>
    auditTopicInventory(topic, questionsByTopicId.get(topic.id) ?? [])
  );
}

async function generateTopic(topic: {
  sectionKey: string;
  topicSlug: string;
  topicName: string;
  recommendedPerDifficulty: number;
  focusDifficulty: string;
  publishedGapCount: number;
}) {
  const child = await execFileAsync(
    "node",
    [
      "generate-questions.mjs",
      `--section=${topic.sectionKey}`,
      `--topic=${topic.topicSlug}`,
      `--per-difficulty=${topic.recommendedPerDifficulty}`,
      `--status=${status}`,
      `--provider=${generationProvider}`,
      `--model=${generationModel}`,
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
    sectionKey: topic.sectionKey,
    topicSlug: topic.topicSlug,
    topicName: topic.topicName,
    perDifficulty: topic.recommendedPerDifficulty,
    focusDifficulty: topic.focusDifficulty,
    publishedGapCount: topic.publishedGapCount,
    summary: extractJsonSummary(child.stdout),
  };
}

async function run() {
  await client.connect();

  try {
    const auditedTopics = await loadAuditedTopics();
    const selectedTopics = selectTopicsForBacklogFill(auditedTopics, {
      sectionKeys: sections,
      priorities: priorities as Array<"critical" | "rebuild" | "watch" | "healthy">,
      preferredTopicDifficulties: preferredDifficulties as Array<"easy" | "medium" | "hard">,
      maxTopicCount: maxTopics,
    });

    if (selectedTopics.length === 0) {
      console.log(
        JSON.stringify(
          {
            status,
            provider: generationProvider,
            model: generationModel,
            selectedTopicCount: 0,
            message: "No matching backlog topics need work.",
          },
          null,
          2
        )
      );
      return;
    }

    const summary = {
      status,
      provider: generationProvider,
      model: generationModel,
      dryRun,
      selectedTopicCount: selectedTopics.length,
      selectedTopics: selectedTopics.map((topic) => ({
        sectionKey: topic.sectionKey,
        topicSlug: topic.topicSlug,
        topicName: topic.topicName,
        reviewPriority: topic.reviewPriority,
        focusDifficulty: topic.focusDifficulty,
        publishedGapCount: topic.publishedGapCount,
        perDifficulty: topic.recommendedPerDifficulty,
      })),
      results: [] as Array<Awaited<ReturnType<typeof generateTopic>>>,
      failures: [] as Array<{ topic: string; error: string }>,
    };

    if (dryRun) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    for (const topic of selectedTopics) {
      console.log(
        `Generating ${topic.sectionKey}/${topic.topicSlug} with perDifficulty=${topic.recommendedPerDifficulty} (${topic.focusDifficulty}).`
      );

      try {
        const result = await generateTopic(topic);
        summary.results.push(result);
      } catch (error) {
        summary.failures.push({
          topic: `${topic.sectionKey}/${topic.topicSlug}`,
          error: error instanceof Error ? error.message : "unknown generation error",
        });
      }

      if (topicSleepMs > 0) {
        await sleep(topicSleepMs);
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
