import { createHash } from "crypto";
import { Client } from "pg";
import { z } from "zod";

const SECTION_KEYS = ["english", "math", "reading", "science"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const ANSWER_CHOICES = ["A", "B", "C", "D"];
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const databaseUrl = process.env.DATABASE_URL;
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY is required.");
}

const args = parseArgs(process.argv.slice(2));
const perDifficulty = Math.max(1, Number(args["per-difficulty"] || 3));
const requestedStatus = (args.status || "published").trim().toLowerCase();
const sectionFilter = args.section?.trim().toLowerCase();
const topicFilter = args.topic?.trim().toLowerCase();
const topicLimit = args["limit-topics"] ? Math.max(1, Number(args["limit-topics"])) : null;
const delayMs = Math.max(0, Number(args["delay-ms"] || 800));

if (sectionFilter && !SECTION_KEYS.includes(sectionFilter)) {
  throw new Error(`Invalid --section value: ${sectionFilter}`);
}

if (!["draft", "published"].includes(requestedStatus)) {
  throw new Error(`Invalid --status value: ${requestedStatus}`);
}

const generatedQuestionSchema = z.object({
  difficulty: z.enum(DIFFICULTIES),
  passage: z.string().nullable().optional(),
  prompt: z.string().min(20),
  choices: z.object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1),
  }),
  correctAnswer: z.enum(ANSWER_CHOICES),
  explanation: z.string().min(30),
});

const generatedBatchSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(perDifficulty * DIFFICULTIES.length),
});

const client = new Client({
  connectionString: databaseUrl,
});

function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith("--"))
      .map((arg) => {
        const [rawKey, ...rest] = arg.slice(2).split("=");
        return [rawKey, rest.join("=") || "true"];
      })
  );
}

function resolveGeminiBaseUrl() {
  const configured = process.env.GEMINI_API_BASE_URL || process.env.GEMINI_BASE_URL;

  if (!configured) {
    return DEFAULT_GEMINI_BASE_URL;
  }

  return configured.replace(/\/openai\/?$/, "").replace(/\/$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function buildFingerprint({ sectionKey, topicSlug, difficulty, passage, prompt, choices }) {
  const canonicalChoices = ANSWER_CHOICES.map((choice) => `${choice}:${normalizeText(choices[choice])}`)
    .join("|");

  return createHash("sha256")
    .update(
      [
        sectionKey,
        topicSlug,
        difficulty,
        normalizeText(passage || ""),
        normalizeText(prompt),
        canonicalChoices,
      ].join("||")
    )
    .digest("hex");
}

function getSectionSpecificInstructions(sectionKey) {
  switch (sectionKey) {
    case "english":
      return [
        "Write ACT English items about revision, grammar, punctuation, sentence structure, and rhetorical effectiveness.",
        "Use a sentence or short excerpt when helpful. Set passage to null unless the question truly needs a short excerpt block.",
        "Keep the prompt phrased like an ACT editing question, not a trivia question.",
      ].join("\n");
    case "math":
      return [
        "Write ACT Math items that are solvable from the information given.",
        "Use plain text math. Do not use LaTeX.",
        "Set passage to null unless a brief word-problem setup is necessary.",
      ].join("\n");
    case "reading":
      return [
        "Every ACT Reading item must include a short passage in the passage field.",
        "The prompt should ask about the passage's meaning, evidence, tone, organization, or inference.",
        "Make the passage realistic and concise enough for a single question.",
      ].join("\n");
    case "science":
      return [
        "Every ACT Science item must include a short experiment summary, data summary, or conflicting-viewpoints setup in the passage field.",
        "The prompt should ask for the best conclusion, data interpretation, comparison, or experimental implication.",
        "Use plain text instead of tables when necessary.",
      ].join("\n");
    default:
      return "";
  }
}

function buildPrompt({ sectionKey, topicName }) {
  return `
Generate ${perDifficulty * DIFFICULTIES.length} original ACT-style multiple-choice questions for:
- Section: ${sectionKey}
- Topic: ${topicName}

Required difficulty mix:
- easy: ${perDifficulty}
- medium: ${perDifficulty}
- hard: ${perDifficulty}

Global rules:
- Return only structured JSON that matches the schema.
- Each question must have exactly four answer choices: A, B, C, and D.
- Exactly one answer must be correct.
- Use plain text only. No markdown fences. No LaTeX.
- Avoid near-duplicate prompts, recycled answer choices, and repeated wording within this batch.
- Explanations must briefly justify the correct answer and mention why the best distractor(s) fail.
- Keep the content ACT-authentic and skill-focused, not trivia-like.
- Vary the tested skill inside the topic so the batch is not repetitive.

Section-specific rules:
${getSectionSpecificInstructions(sectionKey)}
`.trim();
}

function buildQuestionBatchSchema() {
  return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: perDifficulty * DIFFICULTIES.length,
        maxItems: perDifficulty * DIFFICULTIES.length,
        items: {
          type: "object",
          properties: {
            difficulty: {
              type: "string",
              enum: DIFFICULTIES,
            },
            passage: {
              type: ["string", "null"],
            },
            prompt: {
              type: "string",
            },
            choices: {
              type: "object",
              properties: {
                A: { type: "string" },
                B: { type: "string" },
                C: { type: "string" },
                D: { type: "string" },
              },
              required: ANSWER_CHOICES,
              additionalProperties: false,
            },
            correctAnswer: {
              type: "string",
              enum: ANSWER_CHOICES,
            },
            explanation: {
              type: "string",
            },
          },
          required: ["difficulty", "passage", "prompt", "choices", "correctAnswer", "explanation"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  };
}

async function generateBatchForTopic(topic) {
  const response = await fetch(`${resolveGeminiBaseUrl()}/models/${geminiModel}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text:
              "You are Anti's ACT content engine. Write original ACT-style questions with precise explanations and no malformed output.",
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(topic) }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseJsonSchema: buildQuestionBatchSchema(),
      },
    }),
  });

  const rawBody = await response.text();
  let payload;

  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.promptFeedback?.blockReason ||
      rawBody ||
      `HTTP ${response.status}`;
    throw new Error(`Gemini generation failed: ${message}`);
  }

  const text =
    payload?.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new Error("Gemini returned an empty generation response.");
  }

  return generatedBatchSchema.parse(JSON.parse(text)).questions;
}

function sanitizeQuestion(sectionKey, topic, question) {
  const prompt = question.prompt.trim();
  const passage = question.passage?.trim() || null;
  const explanation = question.explanation.trim();
  const choices = Object.fromEntries(
    ANSWER_CHOICES.map((choice) => [choice, question.choices[choice].trim()])
  );

  const uniqueChoiceCount = new Set(
    ANSWER_CHOICES.map((choice) => normalizeText(choices[choice]))
  ).size;

  if (uniqueChoiceCount !== ANSWER_CHOICES.length) {
    throw new Error("Question contains duplicate answer choices.");
  }

  if (sectionKey === "reading" && !passage) {
    throw new Error("Reading question missing passage.");
  }

  if (sectionKey === "science" && !passage) {
    throw new Error("Science question missing passage/setup.");
  }

  return {
    sectionKey,
    topicId: topic.id,
    topicName: topic.name,
    topicSlug: topic.slug,
    difficulty: question.difficulty,
    prompt,
    passage,
    choices,
    correctAnswer: question.correctAnswer,
    explanation,
    fingerprint: buildFingerprint({
      sectionKey,
      topicSlug: topic.slug,
      difficulty: question.difficulty,
      passage,
      prompt,
      choices,
    }),
  };
}

async function getTopics() {
  const filters = [];
  const values = [];

  if (sectionFilter) {
    values.push(sectionFilter);
    filters.push(`t.section_key = $${values.length}`);
  }

  if (topicFilter) {
    values.push(topicFilter);
    filters.push(`(lower(t.slug) = $${values.length} OR lower(t.name) = $${values.length})`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const limitClause = topicLimit ? `LIMIT ${topicLimit}` : "";

  const result = await client.query(
    `
      SELECT t.id, t.section_key, t.slug, t.name
      FROM act_topics t
      ${whereClause}
      ORDER BY t.section_key, t.display_order
      ${limitClause}
    `,
    values
  );

  return result.rows;
}

async function insertQuestions(topic, generatedQuestions) {
  const existingRows = await client.query(
    `
      SELECT fingerprint
      FROM questions
      WHERE topic_id = $1
        AND fingerprint IS NOT NULL
    `,
    [topic.id]
  );

  const knownFingerprints = new Set(existingRows.rows.map((row) => row.fingerprint));
  let inserted = 0;
  let skipped = 0;

  for (const generatedQuestion of generatedQuestions) {
    let normalizedQuestion;

    try {
      normalizedQuestion = sanitizeQuestion(topic.section_key, topic, generatedQuestion);
    } catch (error) {
      skipped += 1;
      console.warn(
        `Skipping invalid ${topic.section_key}/${topic.slug} question: ${
          error instanceof Error ? error.message : "unknown validation error"
        }`
      );
      continue;
    }

    if (knownFingerprints.has(normalizedQuestion.fingerprint)) {
      skipped += 1;
      continue;
    }

    const result = await client.query(
      `
        INSERT INTO questions (
          section_key,
          topic_id,
          difficulty,
          question_type,
          prompt,
          passage,
          fingerprint,
          choices,
          correct_answer,
          explanation,
          source,
          status
        )
        VALUES ($1, $2, $3, 'multiple_choice', $4, $5, $6, $7::jsonb, $8, $9, 'gemini', $10)
        ON CONFLICT (fingerprint) DO NOTHING
        RETURNING id
      `,
      [
        normalizedQuestion.sectionKey,
        normalizedQuestion.topicId,
        normalizedQuestion.difficulty,
        normalizedQuestion.prompt,
        normalizedQuestion.passage,
        normalizedQuestion.fingerprint,
        JSON.stringify(normalizedQuestion.choices),
        normalizedQuestion.correctAnswer,
        normalizedQuestion.explanation,
        requestedStatus,
      ]
    );

    if (result.rowCount > 0) {
      knownFingerprints.add(normalizedQuestion.fingerprint);
      inserted += 1;
    } else {
      skipped += 1;
    }
  }

  return { inserted, skipped };
}

async function main() {
  await client.connect();

  try {
    const topics = await getTopics();

    if (topics.length === 0) {
      console.log("No matching topics found.");
      return;
    }

    const summary = {
      topicsProcessed: 0,
      inserted: 0,
      skipped: 0,
      failures: [],
    };

    console.log(
      `Generating ACT inventory for ${topics.length} topic(s) with ${perDifficulty} question(s) per difficulty.`
    );

    for (const topic of topics) {
      console.log(`\nGenerating ${topic.section_key}/${topic.slug}...`);

      try {
        const generatedQuestions = await generateBatchForTopic(topic);
        const { inserted, skipped } = await insertQuestions(topic, generatedQuestions);
        summary.topicsProcessed += 1;
        summary.inserted += inserted;
        summary.skipped += skipped;

        console.log(
          `Inserted ${inserted} question(s) and skipped ${skipped} duplicate/invalid question(s) for ${topic.section_key}/${topic.slug}.`
        );

        if (delayMs > 0) {
          await sleep(delayMs);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        summary.failures.push({ topic: `${topic.section_key}/${topic.slug}`, error: message });
        console.error(`Failed ${topic.section_key}/${topic.slug}: ${message}`);
      }
    }

    console.log("\nGeneration summary:");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
