import { createHash } from "crypto";
import { Client } from "pg";
import { z } from "zod";
import {
  isGroqModelUnavailableError,
  resolveGroqFallbackModel,
} from "./lib/groq-models.ts";
import {
  buildMissingDifficultySequence,
  buildPromptDifficultyBlueprint,
  decideChildDisposition,
  formatDifficultyReviewerAssessment,
  planQuestionSetDifficultyCounts,
  toCanonicalChild,
} from "./lib/content-generation-planning.ts";
import {
  buildProviderCandidates,
  buildVerifierProviderOrder,
  resolveFallbackProviders,
  resolveGenerationModel,
  resolveGenerationProvider,
  resolveReviewModel,
  resolveReviewProvider,
} from "./lib/content-generation-providers.mjs";
import {
  ProviderRequestError,
  ProviderRunStoppedError,
  classifyProviderFailure,
  createProviderRunState,
  executeProviderOperation,
  parseRetryAfterMs,
  summarizeProviderAvailability,
} from "./lib/content-generation-resilience.mjs";
import { reviewQuestionQuality } from "./lib/question-utils.ts";

const SECTION_KEYS = ["english", "math", "reading", "science"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const ANSWER_CHOICES = ["A", "B", "C", "D"];
const SET_KIND_BY_SECTION = {
  reading: "reading_passage",
  science: "science_stimulus",
};
const SET_DEFAULT_CHILD_COUNT = {
  reading: 6,
  science: 6,
};
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const GENERATION_SYSTEM_PROMPT = `
You are Aced's ACT item writer.

Your task is to generate original, ACT-authentic multiple-choice questions that are publishable without manual rescue.

You must write like a professional standardized-test item writer, not like a worksheet generator or content farm.

Core quality standard:
Every item must feel like a serious ACT-prep product could publish it without embarrassment.

Originality and benchmarking:
Match the authenticity, polish, and difficulty control of top-tier ACT prep materials, but write fully original items.
Do not copy, paraphrase, mirror, or closely imitate any published ACT or commercial-prep question, passage, explanation, numeric setup, or answer structure.
Use external prep only as a quality benchmark, never as source material.

Output rules:
- Return valid JSON only.
- No markdown.
- No commentary outside the JSON.
- Use plain text only.
- No LaTeX.
- Exactly 4 answer choices: A, B, C, D.
- Exactly 1 answer must be correct.
- The explanation must match the keyed answer exactly.
- Do not mention internal reasoning.

Before finalizing each item, silently verify:
- It matches the requested section and topic exactly.
- Its difficulty label is accurate.
- Exactly one answer is unambiguously correct.
- The distractors are plausible but clearly wrong.
- The explanation supports the keyed answer and does not contradict it.
- The item feels ACT-authentic, not like a classroom drill.
- The item is meaningfully different from others in the batch.

If any check fails, rewrite the item before outputting it.

Automatic rejection standards:
Do not output any item that:
- is a one-step plug-in or direct recall item labeled medium or hard
- has a passage that nearly states the answer verbatim
- contains two answer choices that could both reasonably be defended
- has a weak, generic, or self-contradictory explanation
- is mismatched to the topic label
- is structurally repetitive with another item in the same batch
- has answer choices that differ in obvious plausibility, tone, or length
- uses "closest" or approximation logic without explicitly asking for it
- would likely be flagged by a human editor as too easy, too generic, too short, too direct, or too sloppy

Difficulty standard:
- Easy: credible ACT warm-up, never childish, trivial, or elementary.
- Medium: standard ACT difficulty, usually requiring at least one non-obvious reasoning step, closer passage discrimination, or stronger distractor filtering.
- Hard: upper-range ACT, requiring tighter reasoning, stronger distractors, or more complex setup without becoming artificial.

Do not lower the quality bar just to satisfy requested counts.
If a requested difficulty is harder to write well, spend more effort improving the item before outputting it.

Write fewer strong items rather than many weak ones.
Quality is more important than quantity.
`.trim();
const REVIEW_SYSTEM_PROMPT = `
You are Aced's ACT content reviewer.

You are not writing new questions. You are evaluating generated ACT questions for publication quality.

Your standard is strict:
Only approve items that feel publishable without manual rescue.

For each item, judge:
- correctness
- single-best-answer integrity
- ACT authenticity
- topic fidelity
- difficulty accuracy
- distractor quality
- explanation consistency
- passage quality and relevance
- originality
- overall publishability

Benchmark quality against top-tier ACT prep materials for authenticity, difficulty control, clarity, and polish.
Also flag any item that feels derivative, too similar to a common published pattern, or insufficiently original.

Reject any item that is:
- too easy for its label
- generic or textbook-like
- passage-answer paraphrase
- not truly ACT-authentic
- weakly matched to the topic
- ambiguous
- explanation/key inconsistent
- poorly constructed
- not strong enough for publication
- derivative in setup, wording, passage logic, or answer structure

Required review order:
1. Re-solve the question independently from the passage or stimulus before trusting the keyed answer.
2. Determine what the correct answer should be without relying on the provided answer key where practical.
3. Check every answer choice individually.
4. Confirm exactly one answer is defensibly correct.
5. Confirm the keyed answer matches the independently derived answer.
6. Confirm the explanation agrees with the passage or stimulus data.
7. Confirm no distractor is equivalent to the correct answer.
8. Confirm the wording does not overstate what the evidence supports.
9. Confirm the item still matches the requested ACT section and topic.
10. Only then return keep.

For Reading and Science, all evidence judgments must come from the supplied shared passage or stimulus.

Do not repair the item unless explicitly asked.
Evaluate it as submitted.

Return valid JSON only.
No markdown.
No commentary outside the JSON.
`.trim();

const databaseUrl = process.env.DATABASE_URL;
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const groqApiKey = process.env.GROQ_API_KEY || "";
const openRouterApiKey = process.env.OPENROUTER_API_KEY || "";
const ollamaBaseUrl =
  process.env.OLLAMA_API_BASE_URL || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const args = parseArgs(process.argv.slice(2));
const rereviewQuestionIds = parseUuidListArg(args["rereview-question-ids"]);
const reviewedByUserId = args["reviewed-by-user-id"]?.trim() || null;
const perDifficulty = Math.max(1, Number(args["per-difficulty"] || 3));
const requestedDifficultyCounts = parseRequestedDifficultyCounts(args["difficulty-plan"]) || {
  easy: perDifficulty,
  medium: perDifficulty,
  hard: perDifficulty,
};
const isRereviewMode = rereviewQuestionIds.length > 0;
const requestedStatus = (args.status || "draft").trim().toLowerCase();
const sectionFilter = args.section?.trim().toLowerCase();
const topicFilter = args.topic?.trim().toLowerCase();
const topicLimit = args["limit-topics"] ? Math.max(1, Number(args["limit-topics"])) : null;
const delayMs = Math.max(0, Number(args["delay-ms"] || 800));
const jsonOnly = args.json === "true" || args.json === "1";
const fastRetryMode = args["fast-retry"] === "true" || args["fast-retry"] === "1";
const generationProvider = resolveGenerationProvider(args.provider);
const generationModel = resolveGenerationModel(generationProvider, args.model);
const reviewProvider = resolveReviewProvider(args["review-provider"], generationProvider);
const reviewModel = resolveReviewModel(reviewProvider, args["review-model"], generationModel);
const runProviderState = createProviderRunState(
  Array.from(
    new Set(
      [
        generationProvider,
        reviewProvider,
        ...resolveFallbackProviders(generationProvider),
        ...resolveFallbackProviders(reviewProvider),
      ].filter(Boolean)
    )
  )
);

if (sectionFilter && !SECTION_KEYS.includes(sectionFilter)) {
  throw new Error(`Invalid --section value: ${sectionFilter}`);
}

if (!["draft", "published"].includes(requestedStatus)) {
  throw new Error(`Invalid --status value: ${requestedStatus}`);
}

if (!isRereviewMode && generationProvider === "gemini" && !geminiApiKey) {
  throw new Error("GEMINI_API_KEY is required when using the Gemini generation provider.");
}

if (!isRereviewMode && generationProvider === "groq" && !groqApiKey) {
  throw new Error("GROQ_API_KEY is required when using the Groq generation provider.");
}

if (!isRereviewMode && generationProvider === "openrouter" && !openRouterApiKey) {
  throw new Error("OPENROUTER_API_KEY is required when using the OpenRouter generation provider.");
}

const generatedQuestionSchema = z.object({
  section: z.string().min(1),
  topic: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES),
  passage: z.string().nullable().optional(),
  question_text: z.string().min(20),
  choices: z.object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1),
  }),
  correct_answer: z.enum(ANSWER_CHOICES),
  explanation: z.string().min(30),
});

const generatedSetQuestionSchema = z.object({
  section: z.string().min(1),
  topic: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES),
  question_text: z.string().min(20),
  choices: z.object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1),
  }),
  correct_answer: z.enum(ANSWER_CHOICES),
  explanation: z.string().min(30),
});

const generatedSetMetadataSchema = z
  .object({
    stimulusType: z.string().min(1).nullable().optional(),
    dataSummary: z.string().min(1).nullable().optional(),
    xAxisLabel: z.string().min(1).nullable().optional(),
    yAxisLabel: z.string().min(1).nullable().optional(),
    seriesLabels: z.array(z.string().min(1)).max(8).nullable().optional(),
    viewpointLabels: z.array(z.string().min(1)).max(6).nullable().optional(),
  })
  .strict();

const reviewedQuestionSchema = z.object({
  item_index: z.number().int().nonnegative(),
  verdict: z.enum(["keep", "revise", "reject"]),
  confidence: z.enum(["high", "medium", "low"]),
  correctness: z.enum(["correct", "incorrect", "unclear"]),
  topic_fidelity: z.enum(["strong", "partial", "weak"]),
  difficulty_accuracy: z.enum(["accurate", "too_easy", "too_hard", "unclear"]),
  single_best_answer: z.enum(["yes", "no", "unclear"]),
  explanation_consistency: z.enum(["consistent", "inconsistent", "unclear"]),
  originality: z.enum(["strong", "borderline", "weak"]),
  unique_correct_answer: z.enum(["yes", "no", "unclear"]),
  answer_key_verified: z.enum(["yes", "no", "unclear"]),
  explanation_verified: z.enum(["yes", "no", "unclear"]),
  choices_distinct: z.enum(["yes", "no", "unclear"]),
  evidence_supported: z.enum(["yes", "no", "unclear"]),
  section_appropriate: z.enum(["yes", "no", "unclear"]),
  main_issues: z.array(z.string().min(1)).max(6),
  suggested_difficulty: z.union([z.enum(DIFFICULTIES), z.null()]),
  editorial_note: z.string().min(1),
});

const correctnessVerifierSchema = z.object({
  correctness_verified: z.enum(["yes", "no", "unclear"]),
  unique_correct_answer: z.enum(["yes", "no", "unclear"]),
  answer_key_verified: z.enum(["yes", "no", "unclear"]),
  explanation_verified: z.enum(["yes", "no", "unclear"]),
  choices_distinct: z.enum(["yes", "no", "unclear"]),
  evidence_supported: z.enum(["yes", "no", "unclear"]),
  recommended_disposition: z.enum(["keep", "revise", "reject"]),
  main_issues: z.array(z.string().min(1)).max(6),
  note: z.string().min(1),
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

function parseRequestedDifficultyCounts(rawPlan) {
  if (!rawPlan) {
    return null;
  }

  const counts = {
    easy: 0,
    medium: 0,
    hard: 0,
  };

  for (const entry of String(rawPlan)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    const [rawDifficulty, rawCount] = entry.split(":");
    const difficulty = rawDifficulty?.trim().toLowerCase();
    const count = Number(rawCount);

    if (!DIFFICULTIES.includes(difficulty) || !Number.isInteger(count) || count < 0) {
      throw new Error(`Invalid --difficulty-plan value: ${rawPlan}`);
    }

    counts[difficulty] = count;
  }

  const totalRequested = DIFFICULTIES.reduce((sum, difficulty) => sum + counts[difficulty], 0);

  if (totalRequested < 1) {
    throw new Error("The --difficulty-plan must request at least one question.");
  }

  return counts;
}

function parseUuidListArg(rawValue) {
  if (!rawValue) {
    return [];
  }

  return String(rawValue)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[0-9a-f-]{36}$/i.test(value));
}

function resolveOpenRouterBaseUrl() {
  const configured = process.env.OPENROUTER_BASE_URL || process.env.OPENROUTER_API_BASE_URL;

  if (!configured) {
    return DEFAULT_OPENROUTER_BASE_URL;
  }

  return configured.replace(/\/$/, "");
}

function resolveGeminiBaseUrl() {
  const configured = process.env.GEMINI_API_BASE_URL || process.env.GEMINI_BASE_URL;

  if (!configured) {
    return DEFAULT_GEMINI_BASE_URL;
  }

  return configured.replace(/\/openai\/?$/, "").replace(/\/$/, "");
}

function resolveGroqBaseUrl() {
  const configured = process.env.GROQ_BASE_URL || process.env.GROQ_API_BASE_URL;

  if (!configured) {
    return DEFAULT_GROQ_BASE_URL;
  }

  return configured.replace(/\/$/, "");
}

function resolveOllamaBaseUrl() {
  return ollamaBaseUrl.replace(/\/$/, "");
}

function supportsGroqJsonSchema(model) {
  return [
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "moonshotai/kimi-k2-instruct-0905",
    "meta-llama/llama-4-scout-17b-16e-instruct",
  ].includes(model);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseModelJson(text) {
  const trimmed = text.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  const parseCandidates = [withoutFence];
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    parseCandidates.push(withoutFence.slice(firstBrace, lastBrace + 1));
  }

  let lastError = null;

  for (const candidate of parseCandidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "Unknown JSON parse failure.";
  throw new Error(`Malformed JSON response: ${message}`);
}

function normalizeChoiceLetter(value) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  const directMatch = trimmed.match(/^[A-D]$/i);

  if (directMatch) {
    return directMatch[0].toUpperCase();
  }

  const labeledMatch = trimmed.match(/\b(?:choice|answer)?\s*([A-D])(?:[).:\s]|$)/i);
  return labeledMatch?.[1]?.toUpperCase() ?? trimmed;
}

function normalizeGeneratedQuestionRecord(question) {
  if (!question || typeof question !== "object") {
    return question;
  }

  const record = question;
  const explanation =
    typeof record.explanation === "string"
      ? record.explanation
      : typeof record.rationale === "string"
        ? record.rationale
        : typeof record.solution === "string"
          ? record.solution
          : record.explanation;

  return {
    section: record.section,
    topic: record.topic,
    difficulty: record.difficulty,
    passage: record.passage ?? null,
    question_text:
      typeof record.question_text === "string"
        ? record.question_text
        : typeof record.prompt === "string"
          ? record.prompt
          : typeof record.question === "string"
            ? record.question
            : record.question_text,
    choices: record.choices,
    correct_answer: normalizeChoiceLetter(
      record.correct_answer ?? record.correctAnswer ?? record.answer ?? record.answer_letter
    ),
    explanation,
  };
}

function normalizeGeneratedSetQuestionRecord(question) {
  if (!question || typeof question !== "object") {
    return question;
  }

  const record = question;
  const explanation =
    typeof record.explanation === "string"
      ? record.explanation
      : typeof record.rationale === "string"
        ? record.rationale
        : typeof record.solution === "string"
          ? record.solution
          : record.explanation;

  return {
    section: record.section,
    topic: record.topic,
    difficulty: record.difficulty,
    question_text:
      typeof record.question_text === "string"
        ? record.question_text
        : typeof record.prompt === "string"
          ? record.prompt
          : typeof record.question === "string"
            ? record.question
            : record.question_text,
    choices: record.choices,
    correct_answer: normalizeChoiceLetter(
      record.correct_answer ?? record.correctAnswer ?? record.answer ?? record.answer_letter
    ),
    explanation,
  };
}

function normalizeGeneratedPayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.questions)) {
    return payload;
  }

  return {
    ...payload,
    questions: payload.questions.map((question) => normalizeGeneratedQuestionRecord(question)),
  };
}

function normalizeGeneratedSetPayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.questions)) {
    return payload;
  }

  const record = payload;
  return {
    ...record,
    content:
      typeof record.content === "string"
        ? record.content
        : typeof record.passage === "string"
          ? record.passage
          : record.content,
    title:
      typeof record.title === "string"
        ? record.title
        : typeof record.heading === "string"
          ? record.heading
          : typeof record.name === "string"
            ? record.name
            : record.title ?? null,
    metadata: normalizeGeneratedSetMetadata(record.metadata),
    questions: payload.questions.map((question) => normalizeGeneratedSetQuestionRecord(question)),
  };
}

function normalizeGeneratedSetMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata;

  return {
    stimulusType:
      typeof record.stimulusType === "string" ? record.stimulusType.trim() || null : null,
    dataSummary:
      typeof record.dataSummary === "string" ? record.dataSummary.trim() || null : null,
    xAxisLabel:
      typeof record.xAxisLabel === "string" ? record.xAxisLabel.trim() || null : null,
    yAxisLabel:
      typeof record.yAxisLabel === "string" ? record.yAxisLabel.trim() || null : null,
    seriesLabels: Array.isArray(record.seriesLabels)
      ? record.seriesLabels
          .filter((value) => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      : null,
    viewpointLabels: Array.isArray(record.viewpointLabels)
      ? record.viewpointLabels
          .filter((value) => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      : null,
  };
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseNumericEquivalent(value) {
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

function areEquivalentChoices(left, right) {
  const normalizedLeft = normalizeText(left).replace(/[.,;:!?]+$/g, "");
  const normalizedRight = normalizeText(right).replace(/[.,;:!?]+$/g, "");

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
    case "math":
      return [
        "Write ACT Math items, not worksheet drills.",
        "Medium and hard items must require more than direct substitution, direct evaluation, routine formula recall, or immediate solving.",
        "Prefer items involving structure, interpretation, comparison, constraints, modeling, composition, piecewise reasoning, or multi-step setup.",
        "If the item can be solved instantly by plugging into one formula or one expression, it is not medium or hard.",
        "Use passage = null unless a short real-world setup is needed.",
        "Avoid tiny stems with purely numeric answer choices unless the reasoning burden is genuinely ACT-level.",
        "Distractors should reflect realistic mathematical mistakes, not random numbers.",
        "After solving a math item, verify that the keyed answer is exactly supported by the algebra, arithmetic, or function reasoning in the explanation.",
        "If the computed answer is not one of the listed choices, discard the item and rewrite it instead of rescuing it.",
        "For any math item involving equations, roots, or function inputs and outputs, test the keyed answer directly before finalizing the item.",
        "Never write an explanation that says the answer should have been different, that no listed choice matches, or that one option is merely the closest.",
      ].join("\n");
    case "english":
      return [
        "Every English item must be revision-in-context.",
        "Include a short passage in the passage field.",
        "Mark the revisable text using [underline]...[/underline].",
        "The question must ask for the best revision, transition, placement, wording, or structural improvement in context.",
        "Exactly one answer must be clearly best in context.",
        "Do not create isolated grammar drills dressed up as ACT questions.",
        "Medium and hard items must involve a real editorial decision, not just obvious error spotting.",
        "Grammar, clarity, logic, tone, and cohesion should interact the way they do on ACT English.",
      ].join("\n");
    case "reading":
      return [
        "Every Reading item must include a passage.",
        "The passage must be rich enough to support inference, tone, evidence, organization, or meaning questions.",
        "Do not write passages that simply define a concept and then ask what the concept means.",
        "Do not write questions whose answer is almost directly paraphrased from one sentence in the passage.",
        "Literary Narrative must be actual narrative prose with a speaker, character, scene, memory, or interaction.",
        "Social Science must feel like a real social-science, civic, historical, or cultural passage, not a dictionary entry.",
        "Humanities must feel interpretive, artistic, historical, philosophical, or cultural.",
        "Natural Science must feel explanatory and passage-based, not trivia-based.",
      ].join("\n");
    case "science":
      return [
        "Every Science item must include an experiment summary, data summary, or conflicting-viewpoints setup.",
        "The question must require interpretation of the setup, not outside trivia.",
        "Hard items should require comparison, variable tracking, inference, or ruling out tempting but unsupported conclusions.",
        "If the student could answer without using the setup, reject and rewrite the item.",
        "Use concise but information-rich setups.",
      ].join("\n");
    default:
      return "";
  }
}

function getTopicSpecificInstructions(sectionKey, topicSlug) {
  const topicKey = `${sectionKey}:${topicSlug}`;

  const instructions = {
    "english:production-of-writing": [
      "Focus on organization, transitions, rhetorical purpose, and whether a sentence supports the paragraph's goal.",
      "Ask for the best revision, sentence placement, addition, deletion, or transition choice.",
    ],
    "english:knowledge-of-language": [
      "Focus on style, tone, precision, concision, and maintaining consistency with the surrounding passage.",
      "Avoid grammar-only questions here; prioritize effective wording and rhetorical clarity.",
    ],
    "english:conventions-of-standard-english": [
      "Focus on grammar, usage, punctuation, pronoun agreement, verb tense, modifier placement, and sentence-level correctness.",
      "These should feel like official ACT English convention questions, not broad rhetorical revision tasks.",
    ],
    "english:organization-and-flow": [
      "Focus on paragraph order, sentence placement, logical sequencing, and whether an idea belongs where it appears.",
      "The best answer should improve coherence and flow, not sentence-level grammar.",
      "Use passage-based revision prompts such as where a sentence should move, whether it should stay, or which order is most logical.",
      "Do not ask students to move a sentence to the position where it already appears, and do not make deletion the right answer unless the sentence is clearly off-topic.",
      "Make the correct placement or revision clearly better than the distractors.",
    ],
    "english:transitions-and-cohesion": [
      "Focus on transition words, contrast, cause-effect, continuation, and how sentences or paragraphs connect.",
      "Make the relationship between ideas explicit so the student's job is choosing the most coherent bridge.",
      "Use a short passage and mark the target sentence or phrase with [underline]...[/underline] when relevant.",
      "If the question asks for a transition, the underlined text in the passage should be the exact transition slot or sentence being revised.",
    ],
    "english:precision-and-concision": [
      "Focus on cutting redundancy, choosing precise wording, and preserving meaning with the clearest phrasing.",
      "Avoid grammar-only fixes unless they also improve precision and concision.",
      "The student should usually choose the best replacement for an underlined phrase in context.",
      "Keep the answer choices close in meaning so only one is both concise and precise in context.",
      "Always include an underlined phrase in the passage and make every answer choice a direct replacement for that exact phrase.",
      "Avoid synonym-vocabulary quizzes; the student must improve clarity and economy within the sentence's meaning.",
    ],
    "english:style-and-tone": [
      "Focus on matching tone, maintaining voice, and selecting wording that fits the passage's purpose and audience.",
      "Do not drift into punctuation mechanics here.",
      "Use revision questions where the student selects the phrase or sentence that best fits the tone of the surrounding passage.",
      "Avoid making the unchanged original wording obviously correct just because the other options are exaggerated or silly.",
    ],
    "english:punctuation": [
      "Test punctuation through revision in context, not isolated punctuation drills.",
      "Use commas, semicolons, colons, dashes, apostrophes, and end punctuation only where context creates one clearly best answer.",
      "Avoid choices where more than one punctuation option could reasonably work in context.",
    ],
    "english:grammar-and-usage": [
      "Focus on subject-verb agreement, pronoun agreement, verb tense, modifier placement, idiomatic usage, and sentence clarity in context.",
      "Every item must be a revision item with [underline] tags in the passage.",
      "Make the wrong choices realistic and grammatically tempting when possible.",
      "If more than one answer is acceptable English, reject and rewrite the item.",
    ],
    "english:sentence-structure": [
      "Focus on clause relationships, modifiers, subordination, coordination, sentence boundaries, and structural clarity.",
      "Medium and hard items should require understanding the logic of the sentence, not just spotting a surface error.",
      "Ensure exactly one revision is best in both grammar and meaning.",
    ],
    "math:number-and-quantity": [
      "Focus on integers, rational and irrational numbers, ratios, units, magnitude, exponents, and numeric properties.",
      "Do not substitute pure geometry questions here.",
    ],
    "math:algebra": [
      "Avoid plain solve for x drills for medium and hard.",
      "Prefer systems, structure, equivalent forms, quadratic reasoning, constraints, or interpretation of algebraic relationships.",
      "Distractors should reflect realistic algebra mistakes.",
    ],
    "math:functions": [
      "Focus on interpreting, comparing, transforming, composing, or reasoning about functions.",
      "Avoid direct one-step evaluation such as What is f(4).",
      "Avoid direct composition drills unless there is meaningful additional reasoning.",
      "Medium and hard items should involve function meaning, piecewise interpretation, constraints, comparison of outputs, or symbolic structure.",
      "If a function item requires solving for x, substitute the keyed x-value back into the function relationship before finalizing the choices or explanation.",
      "If a function item asks for a value, compute that value exactly and make sure the matching choice appears verbatim in the answer set.",
      "Do not output a function question if the explanation discovers a contradiction, an extraneous solution, two valid answers, or no valid listed answer.",
    ],
    "math:geometry": [
      "Avoid simple area, perimeter, angle-sum, or radius-from-diameter recall as medium or hard.",
      "Prefer geometric relationships, coordinate geometry, similar figures, composite figures, transformations, or multi-step constraints.",
      "Do not rely on a single obvious formula substitution for medium or hard.",
    ],
    "math:statistics-and-probability": [
      "Focus on averages, distributions, percent, counting, probability, and interpreting summary statistics or data tables.",
      "Do not generate pure algebra drills here.",
    ],
    "math:integrating-essential-skills": [
      "Mix algebra, arithmetic, proportional reasoning, estimation, expressions, and interpretation.",
      "Easy items may be direct but should still feel test-ready.",
      "Medium and hard items must combine skills or require structure, not just one isolated operation.",
      "Avoid plain two-step equations as medium or hard.",
    ],
    "math:modeling": [
      "The central task must be choosing, building, or interpreting the model.",
      "The setup should require translating a verbal scenario into an equation, function, inequality, rate relationship, or representation.",
      "Avoid items where the model is already essentially written in the prompt.",
      "Strong distractors should reflect realistic modeling mistakes.",
    ],
    "math:ratios-and-proportions": [
      "Focus on rates, scale factors, proportional reasoning, unit rates, and comparing quantities across contexts.",
      "These should feel like applied ratio problems, not abstract function notation questions.",
    ],
    "math:linear-equations": [
      "Focus on solving or interpreting linear equations and inequalities, including slope-intercept style relationships.",
      "Make the linear structure central to the solution path.",
    ],
    "math:quadratics-and-polynomials": [
      "Focus on factoring, roots, quadratic relationships, polynomial expressions, and how graph features connect to algebraic form.",
      "Do not reduce these to basic arithmetic word problems.",
    ],
    "math:coordinate-geometry": [
      "Focus on points, slope, midpoint, distance, lines, and geometry grounded on the coordinate plane.",
      "The student should need coordinate reasoning, not just memorized area formulas.",
    ],
    "math:data-analysis": [
      "Focus on interpreting tables, charts, distributions, percent change, median, mean, or outliers.",
      "The data itself should matter to the reasoning, not just decorate an algebra problem.",
    ],
    "math:applied-word-problems": [
      "Use multi-step real-world scenarios that blend arithmetic, algebra, and proportional reasoning.",
      "These should feel like ACT problems where the challenge is setting up the right path through the situation.",
    ],
    "reading:literary-narrative": [
      "Use a narrator or character in a specific moment, memory, or interaction.",
      "Include sensory detail, emotional texture, or subtle relationship cues.",
      "Ask about tone, implication, motivation, effect of a detail, or narrative perspective.",
      "Do not use abstract exposition pretending to be literary.",
    ],
    "reading:social-science": [
      "Use a passage about social behavior, institutions, policy, culture, economics, education, or civic life.",
      "Ask about implication, interpretation, framing, evidence, or argument.",
      "Do not use encyclopedia-style definitions followed by direct recall questions.",
    ],
    "reading:humanities": [
      "Use a nonfiction passage about art, music, literature, philosophy, architecture, or cultural criticism.",
      "Questions should focus on interpretation, author attitude, or the role of specific details in the argument.",
    ],
    "reading:natural-science": [
      "Use explanatory science prose with clear relationships, mechanisms, or findings.",
      "Ask about evidence, inference, organization, or meaning in context.",
      "Do not turn the passage into a trivia fact card.",
    ],
    "reading:main-idea-and-purpose": [
      "Use any ACT Reading passage type, but make the question target the passage's central claim, purpose, or overall direction.",
      "The correct answer should capture the big picture rather than a narrow detail.",
    ],
    "reading:inference": [
      "Use evidence-rich passages where the student must infer what is implied but not stated directly.",
      "Wrong answers should be plausible overreaches or distortions of the text.",
    ],
    "reading:evidence-integration": [
      "Focus on how multiple lines or details work together to support a conclusion, comparison, or claim.",
      "Require the student to synthesize, not just locate a single sentence.",
    ],
    "reading:tone-and-point-of-view": [
      "Focus on narrator or author attitude, stance, perspective, or how viewpoint shapes interpretation.",
      "Keep the answer choices tone-sensitive and text-grounded.",
    ],
    "science:data-representation": [
      "Use a short setup that summarizes a table, graph, or data trend in words and includes concrete numbers or variable changes.",
      "Questions should ask for a trend, comparison, interpolation, or direct data-based conclusion.",
    ],
    "science:research-summaries": [
      "Use a short experiment or study summary with variables, procedure, and results.",
      "Questions should ask about experimental design, controls, predicted outcomes, or what the results support.",
    ],
    "science:conflicting-viewpoints": [
      "Use at least two named viewpoints such as Scientist 1 and Scientist 2 or Student 1 and Student 2.",
      "Questions should compare positions, assumptions, points of agreement, or how each viewpoint would respond to evidence.",
      "The passage must clearly label the viewpoints in a way the validator can detect, such as Scientist 1/Scientist 2, Student 1/Student 2, Researcher 1/Researcher 2, or Viewpoint 1/Viewpoint 2.",
      "Format the setup so each viewpoint gets its own clearly separated claim or paragraph, making the disagreement unmistakable.",
      "Favor question stems that ask which viewpoint agrees, disagrees, or would most likely predict a result, rather than general science trivia.",
    ],
    "science:charts-and-graphs": [
      "Focus tightly on reading plotted values, graph direction, axis interpretation, or comparing chart elements.",
      "The student should succeed by interpreting visualized data relationships.",
    ],
    "science:experimental-design": [
      "Focus on controls, variables, setup, procedure, or what change would strengthen or weaken an experiment.",
      "Questions should feel like ACT Science reasoning about how the study is constructed.",
    ],
    "science:variable-relationships": [
      "Focus on how one variable changes in response to another across trials, tables, or trend summaries.",
      "Make the relationship pattern itself central to the answer.",
    ],
    "science:compare-hypotheses": [
      "Focus on how two explanations differ, what evidence would support one over the other, or where they would agree.",
      "Use direct ACT-style comparisons rather than general science trivia.",
    ],
  };

  return (instructions[topicKey] || []).join("\n");
}

function buildGeneratedBatchSchema({ requestedCount, requestedDifficulty }) {
  return z.object({
    questions: z.array(generatedQuestionSchema).min(1).max(requestedCount).superRefine((questions, ctx) => {
      questions.forEach((question, index) => {
        if (question.difficulty !== requestedDifficulty) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Question ${index} returned ${question.difficulty} instead of ${requestedDifficulty}.`,
          });
        }
      });
    }),
  });
}

function buildGeneratedSetSchema({
  sectionKey,
  requestedDifficultyCounts,
  minQuestionCount,
  maxQuestionCount,
}) {
  return z.object({
    section: z.string().min(1),
    topic: z.string().min(1),
    kind: z.literal(SET_KIND_BY_SECTION[sectionKey]),
    title: z.string().nullable().optional(),
    content: z.string().min(120),
    metadata: generatedSetMetadataSchema.nullable().optional(),
    questions: z
      .array(generatedSetQuestionSchema)
      .min(minQuestionCount)
      .max(maxQuestionCount)
      .superRefine((questions, ctx) => {
        const counts = {
          easy: 0,
          medium: 0,
          hard: 0,
        };

        questions.forEach((question, index) => {
          if (question.section !== sectionKey) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Question ${index} returned ${question.section} instead of ${sectionKey}.`,
            });
          }

          counts[question.difficulty] += 1;
        });

        DIFFICULTIES.forEach((difficulty) => {
          if (counts[difficulty] !== requestedDifficultyCounts[difficulty]) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Set returned ${counts[difficulty]} ${difficulty} question(s) instead of ${requestedDifficultyCounts[difficulty]}.`,
            });
          }
        });
      }),
  });
}

function buildDifficultyCalibrationInstructions(sectionKey) {
  if (sectionKey === "science") {
    return `
Difficulty calibration:
- Easy: direct lookup, straightforward comparison, or one-step interpretation from the stimulus.
- Medium: percent or rate comparison, interpolation, trend interpretation, or combining two pieces of information.
- Hard: multi-step reasoning across rows or variables, evaluating competing conclusions, extrapolation only when assumptions are explicit, identifying what added evidence would support a claim, or comparing rates/relationships rather than reading one value.
- Do not call a direct lookup medium or hard just because the wording is longer.
- Do not fake hard difficulty by adding verbose phrasing to an easy task.
`.trim();
  }

  if (sectionKey === "reading") {
    return `
Difficulty calibration:
- Easy: explicit detail or straightforward meaning grounded in one clear passage location.
- Medium: inference, function, relationship, or context reasoning that requires stronger evidence filtering.
- Hard: synthesis across multiple passage portions, subtle inference, author purpose or structure, or weighing competing evidence.
- Do not label a direct detail question as medium or hard unless the reasoning truly becomes less direct.
- Do not fake hard difficulty with ornate wording or vague abstraction.
`.trim();
  }

  return "";
}

function buildPrompt({ sectionKey, topicName, slug, requestedDifficulty, requestedCount }) {
  return `
Generate ${requestedCount} original ACT-style multiple-choice questions.

Section: ${sectionKey}
Topic: ${topicName}

Required difficulty mix:
- easy: ${requestedDifficulty === "easy" ? requestedCount : 0}
- medium: ${requestedDifficulty === "medium" ? requestedCount : 0}
- hard: ${requestedDifficulty === "hard" ? requestedCount : 0}

Return a JSON object only with a single "questions" array matching the required schema.

Each item inside "questions" must contain exactly these fields:
- section
- topic
- difficulty
- passage
- question_text
- choices
- correct_answer
- explanation

Schema rules:
- section must equal the requested section
- topic must equal the requested topic
- difficulty must be exactly: ${requestedDifficulty}
- passage must be a string or null
- choices must be an object with exactly four keys: A, B, C, D
- correct_answer must be exactly one of: A, B, C, D

Global quality rules:
- Each item must be original within this batch.
- Each item must have exactly 4 answer choices: A, B, C, D.
- Exactly one answer must be correct.
- The explanation must justify the correct answer and briefly explain why the strongest distractor(s) fail.
- For math, the explanation must reproduce a valid solution path that lands exactly on the keyed answer choice.
- For math, silently verify the keyed answer by substitution or direct evaluation before including the item.
- Do not create near-duplicate stems, passages, explanations, or answer-choice patterns.
- Do not create an item that a human editor would likely reject as too easy, too generic, too short, too direct, or too arguable.
- Do not output placeholder-quality items.
- If an item feels weak, rewrite it before including it.
- Do not create answer choices that are equivalent in meaning or value.
- Do not create explanations that mention a different answer letter than the keyed correct answer.
- Do not create any item whose explanation says the correct answer is missing from the choices, that the options contain a mistake, or that the closest choice should be used instead.

Batch diversity rules:
- Vary the tested subskill within the topic.
- Vary passage style, stem wording, distractor logic, and answer placement.
- Avoid repeating the same numeric structure, the same rhetorical move, or the same explanation template.

Section-specific rules:
${getSectionSpecificInstructions(sectionKey)}

Topic-specific rules:
${getTopicSpecificInstructions(sectionKey, slug)}
`.trim();
}

function buildSetPrompt({
  sectionKey,
  topicName,
  slug,
  requestedDifficultyCounts,
}) {
  const requestedQuestionCount = DIFFICULTIES.reduce(
    (sum, difficulty) => sum + requestedDifficultyCounts[difficulty],
    0
  );
  const kind = SET_KIND_BY_SECTION[sectionKey];
  const difficultyBlueprint = buildPromptDifficultyBlueprint(requestedDifficultyCounts)
    .map(
      (difficulty, index) =>
        `- child ${index + 1}: ${difficulty}${sectionKey === "science"
          ? difficulty === "easy"
            ? " — direct lookup, straightforward comparison, or one-step interpretation"
            : difficulty === "medium"
              ? " — percent/change/rate comparison, interpolation, or combining two data points"
              : " — multi-step reasoning, competing conclusions, explicit extrapolation assumptions, or evidence support"
          : difficulty === "easy"
            ? " — explicit detail or straightforward meaning"
            : difficulty === "medium"
              ? " — inference, function, relationship, or context reasoning"
              : " — synthesis, subtle inference, author purpose, structure, or competing evidence"}`
    )
    .join("\n");

  return `
Generate 1 original ACT-style ${sectionKey === "reading" ? "Reading passage set" : "Science stimulus set"}.

Section: ${sectionKey}
Topic: ${topicName}
Set kind: ${kind}

Required child question counts:
- easy: ${requestedDifficultyCounts.easy}
- medium: ${requestedDifficultyCounts.medium}
- hard: ${requestedDifficultyCounts.hard}
- total: ${requestedQuestionCount}

Return one JSON object only with exactly these top-level fields:
- section
- topic
- kind
- title
- content
- metadata
- questions

Top-level rules:
- section must equal the requested section
- topic must equal the requested topic
- kind must equal ${kind}
- title may be a short string or null
- content must contain the full shared passage or stimulus text
- metadata may be null or a plain object
- questions must be an array of exactly ${requestedQuestionCount} child questions

Child question fields:
- section
- topic
- difficulty
- question_text
- choices
- correct_answer
- explanation

Critical originality rules:
- The shared passage or stimulus must be fully original.
- Do not copy, paraphrase, or closely imitate any official ACT passage, science setup, or commercial-prep material.
- Do not quote copyrighted prep-book text.
- Make the structure ACT-authentic, but the wording and content must be original.

Set quality rules:
- Every child question must depend on the shared content.
- Do not write generic questions that could be answered without reading the shared content.
- Do not repeat the same tested move across multiple child questions.
- Vary the subskill, stem shape, and distractor logic across children.
- Do not include duplicate stems or near-duplicate stems within the same set.
- Keep the set coherent: all child questions must clearly belong to the same shared content.

Reading set rules:
- Write one passage that can support multiple evidence, inference, tone, purpose, or organization questions.
- The passage must be rich enough that the child questions require real passage interpretation.
- Do not write a passage that simply defines a term and then asks direct recall questions.

Science set rules:
- Write one shared experiment, data summary, research summary, or conflicting-viewpoints stimulus.
- Child questions must be answerable from the provided setup and not from outside trivia.
- Plain-text descriptions are acceptable; rendered charts are not required.
- If useful, metadata may be null or may include only these keys: stimulusType, dataSummary, xAxisLabel, yAxisLabel, seriesLabels, viewpointLabels.
- Do not add any metadata keys beyond that fixed list.

Distribution rules:
- Include exactly ${requestedDifficultyCounts.easy} easy child question(s), ${requestedDifficultyCounts.medium} medium child question(s), and ${requestedDifficultyCounts.hard} hard child question(s).
- The difficulty labels must be accurate for each child.
- Use this exact child-level difficulty blueprint:
${difficultyBlueprint}
- Make difficulty differ by reasoning depth, not by harder vocabulary or longer wording alone.

${buildDifficultyCalibrationInstructions(sectionKey)}

Section-specific rules:
${getSectionSpecificInstructions(sectionKey)}

Topic-specific rules:
${getTopicSpecificInstructions(sectionKey, slug)}
`.trim();
}

function buildQuestionBatchSchema(sectionKey, requestedDifficulty, requestedCount) {
  const passageSchema = sectionKey === "reading" || sectionKey === "science"
    ? { type: "string" }
    : { type: ["string", "null"] };

  return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: requestedCount,
        items: {
          type: "object",
          properties: {
            section: {
              type: "string",
              const: sectionKey,
            },
            topic: {
              type: "string",
            },
            difficulty: {
              type: "string",
              enum: [requestedDifficulty],
            },
            passage: passageSchema,
            question_text: {
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
            correct_answer: {
              type: "string",
              enum: ANSWER_CHOICES,
            },
            explanation: {
              type: "string",
            },
          },
          required: [
            "section",
            "topic",
            "difficulty",
            "passage",
            "question_text",
            "choices",
            "correct_answer",
            "explanation",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  };
}

function buildQuestionSetJsonSchema(sectionKey, requestedDifficultyCounts) {
  const requestedQuestionCount = DIFFICULTIES.reduce(
    (sum, difficulty) => sum + requestedDifficultyCounts[difficulty],
    0
  );

  return {
    type: "object",
    properties: {
      section: {
        type: "string",
        const: sectionKey,
      },
      topic: {
        type: "string",
      },
      kind: {
        type: "string",
        const: SET_KIND_BY_SECTION[sectionKey],
      },
      title: {
        type: ["string", "null"],
      },
      content: {
        type: "string",
      },
      metadata: {
        type: ["object", "null"],
        properties: {
          stimulusType: {
            type: ["string", "null"],
          },
          dataSummary: {
            type: ["string", "null"],
          },
          xAxisLabel: {
            type: ["string", "null"],
          },
          yAxisLabel: {
            type: ["string", "null"],
          },
          seriesLabels: {
            type: ["array", "null"],
            items: {
              type: "string",
            },
          },
          viewpointLabels: {
            type: ["array", "null"],
            items: {
              type: "string",
            },
          },
        },
        required: [
          "stimulusType",
          "dataSummary",
          "xAxisLabel",
          "yAxisLabel",
          "seriesLabels",
          "viewpointLabels",
        ],
        additionalProperties: false,
      },
      questions: {
        type: "array",
        minItems: requestedQuestionCount,
        maxItems: requestedQuestionCount,
        items: {
          type: "object",
          properties: {
            section: {
              type: "string",
              const: sectionKey,
            },
            topic: {
              type: "string",
            },
            difficulty: {
              type: "string",
              enum: DIFFICULTIES,
            },
            question_text: {
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
            correct_answer: {
              type: "string",
              enum: ANSWER_CHOICES,
            },
            explanation: {
              type: "string",
            },
          },
          required: [
            "section",
            "topic",
            "difficulty",
            "question_text",
            "choices",
            "correct_answer",
            "explanation",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["section", "topic", "kind", "title", "content", "metadata", "questions"],
    additionalProperties: false,
  };
}

function assertStrictJsonSchemaObjects(schema, path = "$") {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return;
  }

  const typeValues = Array.isArray(schema.type)
    ? schema.type
    : typeof schema.type === "string"
      ? [schema.type]
      : [];

  if (typeValues.includes("object")) {
    if (schema.additionalProperties !== false) {
      throw new Error(
        `Strict JSON schema violation at ${path}: additionalProperties:false must be set on every object.`
      );
    }

    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      assertStrictJsonSchemaObjects(propertySchema, `${path}/properties/${key}`);
    }
  }

  if (typeValues.includes("array") && schema.items) {
    assertStrictJsonSchemaObjects(schema.items, `${path}/items`);
  }

  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((entry, index) =>
      assertStrictJsonSchemaObjects(entry, `${path}/anyOf/${index}`)
    );
  }

  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    schema.oneOf.forEach((entry, index) =>
      assertStrictJsonSchemaObjects(entry, `${path}/oneOf/${index}`)
    );
  }
}

function buildReviewPrompt(topic, question) {
  return `
Review the following ACT-style items for publication quality.

Requested section: ${topic.section_key}
Requested topic: ${topic.name}

For each item, return an object with exactly these fields:
- item_index
- verdict
- confidence
- correctness
- topic_fidelity
- difficulty_accuracy
- single_best_answer
- explanation_consistency
- originality
- unique_correct_answer
- answer_key_verified
- explanation_verified
- choices_distinct
- evidence_supported
- section_appropriate
- main_issues
- suggested_difficulty
- editorial_note

Allowed values:
- verdict: keep, revise, reject
- confidence: high, medium, low
- correctness: correct, incorrect, unclear
- topic_fidelity: strong, partial, weak
- difficulty_accuracy: accurate, too_easy, too_hard, unclear
- single_best_answer: yes, no, unclear
- explanation_consistency: consistent, inconsistent, unclear
- originality: strong, borderline, weak
- unique_correct_answer: yes, no, unclear
- answer_key_verified: yes, no, unclear
- explanation_verified: yes, no, unclear
- choices_distinct: yes, no, unclear
- evidence_supported: yes, no, unclear
- section_appropriate: yes, no, unclear
- suggested_difficulty: easy, medium, hard, null

Rules:
- Be strict.
- Follow this order exactly: independently solve, determine the correct answer, inspect each choice, confirm exactly one defensible answer, confirm the keyed answer, confirm the explanation, confirm no equivalent distractor, confirm the wording does not overstate the evidence, confirm section/topic fit, then decide verdict.
- Reject items that are weak even if technically answerable.
- Reject items that feel like worksheet drills rather than ACT items.
- Reject items whose passage simply gives away the answer.
- Reject medium or hard math items that are just direct substitution, direct evaluation, formula recall, or routine solving.
- Reject English items with more than one reasonably defensible revision.
- Reject Reading items whose passage does not genuinely support inference, tone, organization, or evidence-based interpretation.
- Reject any item with a broken explanation or missing correct option.
- For Reading and Science, use only the supplied shared passage or stimulus as evidence.
- If no answer is fully supported, verdict must be reject.
- If more than one answer is defensibly correct, verdict must be reject or revise.
- If the keyed answer is not the uniquely supported answer, verdict must be reject or revise.
- If the wording overstates what the evidence supports, verdict must not be keep.
- Use main_issues as a concise array of the biggest problems only.
- Keep editorial_note to one sentence.
- There is exactly 1 item in this request, so return a single JSON object for item_index 0.

Items to review:
${JSON.stringify([
  {
    section: topic.section_key,
    topic: topic.name,
    difficulty: question.difficulty,
    passage: question.passage,
    question_text: question.question_text,
    choices: question.choices,
    correct_answer: question.correct_answer,
    explanation: question.explanation,
  },
])}
`.trim();
}

function buildCorrectnessVerificationPrompt(topic, question) {
  return `
Verify only the objective correctness of this ACT-style item.

Requested section: ${topic.section_key}
Requested topic: ${topic.name}

Return one JSON object with exactly these fields:
- correctness_verified
- unique_correct_answer
- answer_key_verified
- explanation_verified
- choices_distinct
- evidence_supported
- recommended_disposition
- main_issues
- note

Allowed values:
- correctness_verified: yes, no, unclear
- unique_correct_answer: yes, no, unclear
- answer_key_verified: yes, no, unclear
- explanation_verified: yes, no, unclear
- choices_distinct: yes, no, unclear
- evidence_supported: yes, no, unclear
- recommended_disposition: keep, revise, reject

Verification order:
1. Independently solve the item from the supplied passage or stimulus where practical.
2. Determine whether exactly one answer is defensibly correct.
3. Check whether the keyed answer matches that independently supported answer.
4. Check whether the explanation matches the data and the keyed answer.
5. Check whether any distractor is equivalent to the correct answer.
6. Check whether the wording overstates what the evidence supports.

Disposition rules:
- no valid answer -> reject
- more than one valid answer -> reject
- keyed answer wrong -> reject or revise
- explanation contradicts the evidence -> reject or revise
- wording that overstates the evidence -> revise
- if the evidence is insufficient to verify correctness confidently -> revise

For Reading and Science, use only the supplied shared passage or stimulus as evidence.
Do not assess style, originality, or broad publishability here.

Item:
${JSON.stringify({
  section: topic.section_key,
  topic: topic.name,
  difficulty: question.difficulty,
  passage: question.passage,
  question_text: question.question_text,
  choices: question.choices,
  correct_answer: question.correct_answer,
  explanation: question.explanation,
})}
`.trim();
}

async function requestGeminiJson({ model, systemPrompt, userPrompt, schema, temperature = 0.35 }) {
  const response = await fetch(`${resolveGeminiBaseUrl()}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
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
    throw new ProviderRequestError(`Gemini request failed: ${message}`, {
      provider: "gemini",
      statusCode: response.status,
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      classification: classifyProviderFailure({
        message,
        statusCode: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      }),
    });
  }

  const text =
    payload?.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new ProviderRequestError("Gemini returned an empty response.", {
      provider: "gemini",
      classification: classifyProviderFailure({ message: "empty response" }),
    });
  }

  return text;
}

async function requestGroqJson({
  model,
  systemPrompt,
  userPrompt,
  schema,
  temperature = 0.35,
  allowModelFallback = true,
}) {
  const groqSupportsJsonSchema = supportsGroqJsonSchema(model);
  if (groqSupportsJsonSchema) {
    assertStrictJsonSchemaObjects(schema);
  }
  const response = await fetch(`${resolveGroqBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_completion_tokens: 4096,
      messages: [
        {
          role: "system",
          content: groqSupportsJsonSchema
            ? systemPrompt
            : `${systemPrompt}\n\nReturn one valid JSON object only, with no markdown or commentary, matching this schema exactly: ${JSON.stringify(
                schema
              )}`,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      response_format: groqSupportsJsonSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: "aced_structured_response",
              strict: true,
              schema,
            },
          }
        : {
            type: "json_object",
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
    const message = payload?.error?.message || rawBody || `HTTP ${response.status}`;

    if (allowModelFallback && isGroqModelUnavailableError(message)) {
      const fallbackModel = resolveGroqFallbackModel(model);

      if (fallbackModel !== model) {
        console.warn(
          `Groq model ${model} is unavailable; retrying once with fallback model ${fallbackModel}.`
        );
        return requestGroqJson({
          model: fallbackModel,
          systemPrompt,
          userPrompt,
          schema,
          temperature,
          allowModelFallback: false,
        });
      }
    }

    throw new ProviderRequestError(`Groq request failed: ${message}`, {
      provider: "groq",
      statusCode: response.status,
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      classification: classifyProviderFailure({
        message,
        statusCode: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      }),
    });
  }

  const text = payload?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    throw new ProviderRequestError("Groq returned an empty response.", {
      provider: "groq",
      classification: classifyProviderFailure({ message: "empty response" }),
    });
  }

  return text;
}

async function requestOpenRouterJson({ model, systemPrompt, userPrompt, schema, temperature = 0.35 }) {
  assertStrictJsonSchemaObjects(schema);
  const response = await fetch(`${resolveOpenRouterBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterApiKey}`,
      "HTTP-Referer": "https://aced.app",
      "X-Title": "Aced Content Generation",
      "X-OpenRouter-Metadata": "enabled",
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "aced_structured_response",
          strict: true,
          schema,
        },
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
    const message = payload?.error?.message || rawBody || `HTTP ${response.status}`;
    throw new ProviderRequestError(`OpenRouter request failed: ${message}`, {
      provider: "openrouter",
      statusCode: response.status,
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      classification: classifyProviderFailure({
        message,
        statusCode: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      }),
    });
  }

  const text = payload?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    throw new ProviderRequestError("OpenRouter returned an empty response.", {
      provider: "openrouter",
      classification: classifyProviderFailure({ message: "empty response" }),
    });
  }

  return text;
}

async function requestOllamaJson({ model, systemPrompt, userPrompt, schema, temperature = 0.35 }) {
  const response = await fetch(`${resolveOllamaBaseUrl()}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: schema,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      options: {
        temperature,
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
    const message = payload?.error || rawBody || `HTTP ${response.status}`;
    throw new ProviderRequestError(`Ollama request failed: ${message}`, {
      provider: "ollama",
      statusCode: response.status,
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      classification: classifyProviderFailure({
        message,
        statusCode: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      }),
    });
  }

  const text = payload?.message?.content?.trim() || "";

  if (!text) {
    throw new ProviderRequestError("Ollama returned an empty response.", {
      provider: "ollama",
      classification: classifyProviderFailure({ message: "empty response" }),
    });
  }

  return text;
}

async function requestStructuredJson({
  provider,
  model,
  systemPrompt,
  userPrompt,
  schema,
  temperature,
}) {
  if (provider === "ollama") {
    return requestOllamaJson({
      model,
      systemPrompt,
      userPrompt,
      schema,
      temperature,
    });
  }

  if (provider === "groq") {
    return requestGroqJson({
      model,
      systemPrompt,
      userPrompt,
      schema,
      temperature,
    });
  }

  if (provider === "openrouter") {
    return requestOpenRouterJson({
      model,
      systemPrompt,
      userPrompt,
      schema,
      temperature,
    });
  }

  return requestGeminiJson({
    model,
    systemPrompt,
    userPrompt,
    schema,
    temperature,
  });
}

function buildOperationCandidates(mode, provider, model, options = {}) {
  const fallbackProviders = options.fallbackProviders ?? resolveFallbackProviders(provider);
  const candidates = buildProviderCandidates({
    mode,
    primaryProvider: provider,
    primaryModel: model,
    fallbackProviders,
  });

  return {
    primary: candidates[0] ?? { provider, model },
    fallback: candidates[1] ?? null,
    fallbacks: candidates.slice(2),
    candidates,
  };
}

async function generateBatchForDifficulty(
  topic,
  requestedDifficulty,
  requestedCount,
  provider = generationProvider,
  model = generationModel
) {
  const schema = buildQuestionBatchSchema(
    topic.section_key,
    requestedDifficulty,
    requestedCount
  );
  const prompt = buildPrompt({
    sectionKey: topic.section_key,
    topicName: topic.name,
    slug: topic.slug,
    requestedDifficulty,
    requestedCount,
  });
  const { primary, fallback, fallbacks } = buildOperationCandidates("generation", provider, model);
  const operationResult = await executeProviderOperation({
    runState: runProviderState,
    operation: `generation:${topic.section_key}/${topic.slug}/${requestedDifficulty}`,
    primary,
    fallback,
    fallbacks,
    maxRetries: fastRetryMode ? 1 : 3,
    defaultRetryDelayMs: primary.provider === "groq" ? 20000 : 35000,
    wait: sleep,
    perform: async (candidate) => {
      const text = await requestStructuredJson({
        provider: candidate.provider,
        model: candidate.model,
        systemPrompt: GENERATION_SYSTEM_PROMPT,
        userPrompt: prompt,
        schema,
        temperature: 0.7,
      });
      const parsedPayload = normalizeGeneratedPayload(parseModelJson(text));

      return {
        questions: buildGeneratedBatchSchema({
          requestedCount,
          requestedDifficulty,
        }).parse(parsedPayload).questions,
      };
    },
  });

  return {
    questions: operationResult.questions,
    provider: operationResult.provider,
    model: operationResult.model,
  };
}

async function generateQuestionSet(
  topic,
  requestedDifficultyCounts,
  provider = generationProvider,
  model = generationModel
) {
  const schema = buildQuestionSetJsonSchema(topic.section_key, requestedDifficultyCounts);
  const prompt = buildSetPrompt({
    sectionKey: topic.section_key,
    topicName: topic.name,
    slug: topic.slug,
    requestedDifficultyCounts,
  });
  const requestedQuestionCount = DIFFICULTIES.reduce(
    (sum, difficulty) => sum + requestedDifficultyCounts[difficulty],
    0
  );
  const { primary, fallback, fallbacks } = buildOperationCandidates("generation", provider, model);
  const operationResult = await executeProviderOperation({
    runState: runProviderState,
    operation: `generation:${topic.section_key}/${topic.slug}/set`,
    primary,
    fallback,
    fallbacks,
    maxRetries: fastRetryMode ? 1 : 3,
    defaultRetryDelayMs: primary.provider === "groq" ? 20000 : 35000,
    wait: sleep,
    perform: async (candidate) => {
      const text = await requestStructuredJson({
        provider: candidate.provider,
        model: candidate.model,
        systemPrompt: GENERATION_SYSTEM_PROMPT,
        userPrompt: prompt,
        schema,
        temperature: 0.7,
      });
      const parsedPayload = normalizeGeneratedSetPayload(parseModelJson(text));

      return {
        generatedSet: buildGeneratedSetSchema({
          sectionKey: topic.section_key,
          requestedDifficultyCounts,
          minQuestionCount: requestedQuestionCount,
          maxQuestionCount: requestedQuestionCount,
        }).parse(parsedPayload),
      };
    },
  });

  return {
    generatedSet: operationResult.generatedSet,
    provider: operationResult.provider,
    model: operationResult.model,
  };
}

function buildSetChildSchema(sectionKey, requestedDifficulty) {
  return z.object({
    section: z.string().min(1),
    topic: z.string().min(1),
    difficulty: z.literal(requestedDifficulty),
    question_text: z.string().min(20),
    choices: z.object({
      A: z.string().min(1),
      B: z.string().min(1),
      C: z.string().min(1),
      D: z.string().min(1),
    }),
    correct_answer: z.enum(ANSWER_CHOICES),
    explanation: z.string().min(30),
  }).superRefine((question, ctx) => {
    if (question.section !== sectionKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Child question returned ${question.section} instead of ${sectionKey}.`,
      });
    }
  });
}

function buildSetChildGenerationPrompt({
  topic,
  sharedContent,
  requestedDifficulty,
  existingPrompts,
}) {
  const avoidPromptLines =
    existingPrompts.length > 0
      ? `Avoid duplicating or closely mirroring these existing child stems:\n${existingPrompts
          .map((prompt, index) => `- ${index + 1}. ${prompt}`)
          .join("\n")}`
      : "Avoid duplicating any existing child stem for this set.";

  return `
Generate 1 original ACT-style ${topic.section_key === "reading" ? "Reading" : "Science"} child question that depends on the shared ${topic.section_key === "reading" ? "passage" : "stimulus"} below.

Section: ${topic.section_key}
Topic: ${topic.name}
Requested child difficulty: ${requestedDifficulty}

Shared content:
${sharedContent}

Return one JSON object only with exactly these fields:
- section
- topic
- difficulty
- question_text
- choices
- correct_answer
- explanation

Rules:
- section must equal ${topic.section_key}
- topic must equal ${topic.name}
- difficulty must equal ${requestedDifficulty}
- The question must genuinely require the shared content.
- Keep the same shared content; do not rewrite or replace the passage/stimulus.
- ${avoidPromptLines}
- Make the difficulty accurate for ${requestedDifficulty}.
- Make the child meaningfully different from the existing children in subskill, stem shape, and distractor logic.
- Use ACT-authentic reasoning depth, not longer wording, to reach the target difficulty.

${buildDifficultyCalibrationInstructions(topic.section_key)}

Section-specific rules:
${getSectionSpecificInstructions(topic.section_key)}

Topic-specific rules:
${getTopicSpecificInstructions(topic.section_key, topic.slug)}
`.trim();
}

function buildSetChildRevisionPrompt({
  topic,
  sharedContent,
  requestedDifficulty,
  child,
  reviewerResult,
}) {
  return `
Revise this ACT-style ${topic.section_key === "reading" ? "Reading" : "Science"} child question so it truly matches the requested difficulty while preserving the same shared ${topic.section_key === "reading" ? "passage" : "stimulus"}.

Section: ${topic.section_key}
Topic: ${topic.name}
Requested child difficulty: ${requestedDifficulty}
Current child difficulty label: ${child.difficulty}
Reviewer difficulty assessment: ${reviewerResult.difficulty_accuracy}
Reviewer suggested difficulty: ${reviewerResult.suggested_difficulty ?? "null"}
Reviewer issues: ${reviewerResult.main_issues.join("; ") || "none provided"}
Reviewer note: ${reviewerResult.editorial_note}

Shared content:
${sharedContent}

Current child question:
${JSON.stringify({
  section: child.sectionKey,
  topic: topic.name,
  difficulty: child.difficulty,
  question_text: child.prompt,
  choices: child.choices,
  correct_answer: child.correctAnswer,
  explanation: child.explanation,
})}

Return one JSON object only with exactly these fields:
- section
- topic
- difficulty
- question_text
- choices
- correct_answer
- explanation

Rules:
- Keep the same shared content and same ACT section/topic.
- difficulty must equal ${requestedDifficulty}.
- Fix the reviewer-noted difficulty issue by changing reasoning depth, not by padding the wording.
- Preserve correctness, single-best-answer integrity, and explanation quality.
- Do not repeat the same flaw the reviewer identified.
- If the original question is direct lookup or too worksheet-like, increase reasoning depth appropriately for ${requestedDifficulty}.

${buildDifficultyCalibrationInstructions(topic.section_key)}
`.trim();
}

function formatDifficultyDebugLabel({
  requestedDifficulty,
  generatedDifficulty,
  reviewerResult,
}) {
  const reviewerAssessment = formatDifficultyReviewerAssessment({
    difficultyAccuracy: reviewerResult.difficulty_accuracy,
    suggestedDifficulty: reviewerResult.suggested_difficulty,
  });

  return `requested=${requestedDifficulty} · generated=${generatedDifficulty} · reviewer_assessment=${reviewerAssessment}`;
}

function incrementReviewCounters(counters, reviewerResult, stage = "primary") {
  if (stage === "error") {
    counters.reviewErrors += 1;
    counters.skipped += 1;
    return;
  }

  if (stage === "verifier") {
    counters.skipped += 1;
    if (reviewerResult?.recommended_disposition === "reject") {
      counters.reviewRejected += 1;
    } else {
      counters.reviewRevised += 1;
    }
    return;
  }

  counters.skipped += 1;

  if (reviewerResult.verdict === "reject") {
    counters.reviewRejected += 1;
  } else {
    counters.reviewRevised += 1;
  }
}

function toCanonicalSetChildCandidate(candidate, { topic, originalChild, requestedDifficulty }) {
  return toCanonicalChild(candidate, {
    originalChild: originalChild
      ? {
          section: topic.section_key,
          topic: topic.name,
          difficulty: originalChild.difficulty,
          question_text: originalChild.prompt,
          choices: originalChild.choices,
          correct_answer: originalChild.correctAnswer,
          explanation: originalChild.explanation,
        }
      : null,
    section: topic.section_key,
    topic: topic.name,
    requestedDifficulty,
  });
}

async function generateReplacementSetChild(
  topic,
  {
    sharedContent,
    requestedDifficulty,
    existingPrompts,
  },
  provider = generationProvider,
  model = generationModel
) {
  const schema = buildSetChildSchema(topic.section_key, requestedDifficulty);
  const prompt = buildSetChildGenerationPrompt({
    topic,
    sharedContent,
    requestedDifficulty,
    existingPrompts,
  });
  const { primary, fallback, fallbacks } = buildOperationCandidates("generation", provider, model);
  const operationResult = await executeProviderOperation({
    runState: runProviderState,
    operation: `generation:${topic.section_key}/${topic.slug}/replacement/${requestedDifficulty}`,
    primary,
    fallback,
    fallbacks,
    maxRetries: fastRetryMode ? 1 : 2,
    defaultRetryDelayMs: primary.provider === "groq" ? 20000 : 35000,
    wait: sleep,
    perform: async (candidate) => {
      const text = await requestStructuredJson({
        provider: candidate.provider,
        model: candidate.model,
        systemPrompt: GENERATION_SYSTEM_PROMPT,
        userPrompt: prompt,
        schema,
        temperature: 0.7,
      });
      const parsedPayload = parseModelJson(text);

      return {
        question: schema.parse(parsedPayload),
      };
    },
  });

  return {
    question: operationResult.question,
    provider: operationResult.provider,
    model: operationResult.model,
  };
}

async function reviseSetChildForDifficulty(
  topic,
  {
    child,
    sharedContent,
    requestedDifficulty,
    reviewerResult,
  },
  provider = generationProvider,
  model = generationModel
) {
  const responseSchema = z.object({
    section: z.string().min(1).optional(),
    topic: z.string().min(1).optional(),
    difficulty: z.enum(DIFFICULTIES).optional(),
    question_text: z.string().min(20).optional(),
    choices: z.object({
      A: z.string().min(1),
      B: z.string().min(1),
      C: z.string().min(1),
      D: z.string().min(1),
    }).optional(),
    correct_answer: z.enum(ANSWER_CHOICES).optional(),
    explanation: z.string().min(30).optional(),
  }).strict();
  const prompt = buildSetChildRevisionPrompt({
    topic,
    sharedContent,
    requestedDifficulty,
    child,
    reviewerResult,
  });
  const { primary, fallback, fallbacks } = buildOperationCandidates("generation", provider, model);
  const operationResult = await executeProviderOperation({
    runState: runProviderState,
    operation: `generation:${topic.section_key}/${topic.slug}/revise/${requestedDifficulty}`,
    primary,
    fallback,
    fallbacks,
    maxRetries: fastRetryMode ? 1 : 2,
    defaultRetryDelayMs: primary.provider === "groq" ? 20000 : 35000,
    wait: sleep,
    perform: async (candidate) => {
      const text = await requestStructuredJson({
        provider: candidate.provider,
        model: candidate.model,
        systemPrompt: GENERATION_SYSTEM_PROMPT,
        userPrompt: prompt,
        schema: responseSchema,
        temperature: 0.65,
      });
      const parsedPayload = parseModelJson(text);

      return {
        question: toCanonicalSetChildCandidate(responseSchema.parse(parsedPayload), {
          topic,
          originalChild: child,
          requestedDifficulty,
        }),
      };
    },
  });

  return {
    question: operationResult.question,
    provider: operationResult.provider,
    model: operationResult.model,
  };
}

async function generateBatchForTopic(topic) {
  const generatedQuestions = [];
  const generatedSets = [];
  const failures = [];

  if (topic.section_key === "reading" || topic.section_key === "science") {
    const setDifficultyPlans = planQuestionSetDifficultyCounts(topic.section_key, {
      easy: requestedDifficultyCounts.easy,
      medium: requestedDifficultyCounts.medium,
      hard: requestedDifficultyCounts.hard,
    });

    for (const difficultyCounts of setDifficultyPlans) {
      try {
        const generatedSetResult = await generateQuestionSet(topic, difficultyCounts);
        generatedSets.push({
          ...generatedSetResult.generatedSet,
          _generationProvider: generatedSetResult.provider,
          _generationModel: generatedSetResult.model,
          requestedDifficultyCounts: difficultyCounts,
        });
      } catch (error) {
        if (error instanceof ProviderRunStoppedError) {
          throw error;
        }

        const message = error instanceof Error ? error.message : "unknown generation error";
        failures.push({
          topic: `${topic.section_key}/${topic.slug}/set`,
          error: message,
        });
        console.warn(
          `Skipping ${topic.section_key}/${topic.slug}/set after generation failure: ${message}`
        );
      }
    }

    return { generatedQuestions, generatedSets, failures };
  }

  for (const difficulty of DIFFICULTIES) {
    const requestedCount = requestedDifficultyCounts[difficulty];

    if (requestedCount < 1) {
      continue;
    }

    const candidateCount = Math.min(
      6,
      Math.max(requestedCount, requestedCount + (requestedCount === 1 ? 2 : 1))
    );

    try {
      const batchResult = await generateBatchForDifficulty(topic, difficulty, candidateCount);
      generatedQuestions.push(
        ...batchResult.questions.map((question) => ({
          ...question,
          _generationProvider: batchResult.provider,
          _generationModel: batchResult.model,
        }))
      );
    } catch (error) {
      if (error instanceof ProviderRunStoppedError) {
        error.progress = {
          inserted,
          skipped,
          reviewKept,
          reviewRevised,
          reviewRejected,
          reviewErrors,
        };
        throw error;
      }

      const message = error instanceof Error ? error.message : "unknown generation error";
      failures.push({
        topic: `${topic.section_key}/${topic.slug}/${difficulty}`,
        error: message,
      });
      console.warn(
        `Skipping ${topic.section_key}/${topic.slug}/${difficulty} after generation failure: ${message}`
      );
    }
  }

  return { generatedQuestions, generatedSets, failures };
}

async function reviewGeneratedQuestion(
  topic,
  question,
  provider = reviewProvider,
  model = reviewModel
) {
  const schema = {
    type: "object",
    properties: {
      item_index: {
        type: "integer",
        minimum: 0,
      },
      verdict: {
        type: "string",
        enum: ["keep", "revise", "reject"],
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
      },
      correctness: {
        type: "string",
        enum: ["correct", "incorrect", "unclear"],
      },
      topic_fidelity: {
        type: "string",
        enum: ["strong", "partial", "weak"],
      },
      difficulty_accuracy: {
        type: "string",
        enum: ["accurate", "too_easy", "too_hard", "unclear"],
      },
      single_best_answer: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      explanation_consistency: {
        type: "string",
        enum: ["consistent", "inconsistent", "unclear"],
      },
      originality: {
        type: "string",
        enum: ["strong", "borderline", "weak"],
      },
      unique_correct_answer: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      answer_key_verified: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      explanation_verified: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      choices_distinct: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      evidence_supported: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      section_appropriate: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      main_issues: {
        type: "array",
        items: { type: "string" },
      },
      suggested_difficulty: {
        type: ["string", "null"],
        enum: [...DIFFICULTIES, null],
      },
      editorial_note: {
        type: "string",
      },
    },
    required: [
      "item_index",
      "verdict",
      "confidence",
      "correctness",
      "topic_fidelity",
      "difficulty_accuracy",
      "single_best_answer",
      "explanation_consistency",
      "originality",
      "unique_correct_answer",
      "answer_key_verified",
      "explanation_verified",
      "choices_distinct",
      "evidence_supported",
      "section_appropriate",
      "main_issues",
      "suggested_difficulty",
      "editorial_note",
    ],
    additionalProperties: false,
  };
  const prompt = buildReviewPrompt(topic, question);
  const { primary, fallback, fallbacks } = buildOperationCandidates("review", provider, model);
  const operationResult = await executeProviderOperation({
    runState: runProviderState,
    operation: `review:${topic.section_key}/${topic.slug}`,
    primary,
    fallback,
    fallbacks,
    maxRetries: fastRetryMode ? 1 : 2,
    defaultRetryDelayMs: primary.provider === "groq" ? 12000 : 20000,
    wait: sleep,
    perform: async (candidate) => {
      const text = await requestStructuredJson({
        provider: candidate.provider,
        model: candidate.model,
        systemPrompt: REVIEW_SYSTEM_PROMPT,
        userPrompt: prompt,
        schema,
        temperature: 0.2,
      });
      const parsedPayload = parseModelJson(text);

      return {
        reviewerResult: reviewedQuestionSchema.parse(parsedPayload),
      };
    },
  });

  return {
    reviewerResult: operationResult.reviewerResult,
    provider: operationResult.provider,
    model: operationResult.model,
  };
}

async function verifyGeneratedQuestionCorrectness(
  topic,
  question,
  provider = reviewProvider,
  model = reviewModel,
  generationSourceProvider = null
) {
  const schema = {
    type: "object",
    properties: {
      correctness_verified: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      unique_correct_answer: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      answer_key_verified: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      explanation_verified: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      choices_distinct: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      evidence_supported: {
        type: "string",
        enum: ["yes", "no", "unclear"],
      },
      recommended_disposition: {
        type: "string",
        enum: ["keep", "revise", "reject"],
      },
      main_issues: {
        type: "array",
        items: { type: "string" },
      },
      note: {
        type: "string",
      },
    },
    required: [
      "correctness_verified",
      "unique_correct_answer",
      "answer_key_verified",
      "explanation_verified",
      "choices_distinct",
      "evidence_supported",
      "recommended_disposition",
      "main_issues",
      "note",
    ],
    additionalProperties: false,
  };
  const prompt = buildCorrectnessVerificationPrompt(topic, question);
  const verifierProviderOrder = buildVerifierProviderOrder(generationSourceProvider, provider);
  const primaryProvider = verifierProviderOrder[0] ?? provider;
  const primaryModel = resolveReviewModel(
    primaryProvider,
    primaryProvider === provider ? model : null,
    primaryProvider === provider ? model : null
  );
  const { primary, fallback, fallbacks, candidates } = buildOperationCandidates("review", primaryProvider, primaryModel, {
    fallbackProviders: verifierProviderOrder.slice(1),
  });
  const attemptedProviders = new Set();
  let operationResult;

  try {
    operationResult = await executeProviderOperation({
      runState: runProviderState,
      operation: `verify:${topic.section_key}/${topic.slug}`,
      primary,
      fallback,
      fallbacks,
      maxRetries: fastRetryMode ? 1 : 2,
      defaultRetryDelayMs: primary.provider === "groq" ? 12000 : 20000,
      wait: sleep,
      onEvent: (event) => {
        if (event.state === "attempting" && !attemptedProviders.has(event.provider)) {
          const isSourceProvider = generationSourceProvider && event.provider === generationSourceProvider;

          if (attemptedProviders.size === 0) {
            console.warn(`Correctness verifier attempting ${event.provider} (${event.model}).`);
          } else if (isSourceProvider) {
            console.warn(`Verifier independence degraded; falling back to ${event.provider} (${event.model}).`);
          } else {
            console.warn(`Correctness verifier falling back to ${event.provider} (${event.model}).`);
          }

          attemptedProviders.add(event.provider);
          return;
        }

        if (event.state === "retrying") {
          console.warn(`${event.provider} temporary failure: ${event.message}`);
          return;
        }

        if (event.state === "fallback-success" || event.state === "success" || event.state === "recovered") {
          console.warn(`Correctness verifier succeeded with ${event.provider} (${event.model}).`);
        }
      },
      perform: async (candidate) => {
        const text = await requestStructuredJson({
          provider: candidate.provider,
          model: candidate.model,
          systemPrompt: REVIEW_SYSTEM_PROMPT,
          userPrompt: prompt,
          schema,
          temperature: 0.1,
        });
        const parsedPayload = parseModelJson(text);

        return {
          verifierResult: correctnessVerifierSchema.parse(parsedPayload),
        };
      },
    });
  } catch (error) {
    if (error instanceof ProviderRunStoppedError) {
      const candidateSummary = candidates.map((candidate) => `${candidate.provider} (${candidate.model})`).join(" -> ");
      console.warn(`All verifier providers unavailable; pausing run. Candidates: ${candidateSummary}`);
    }

    throw error;
  }

  if (operationResult.provider !== generationSourceProvider) {
    console.warn(
      `Correctness verifier using ${operationResult.provider} for provider independence.`
    );
  }

  return {
    verifierResult: operationResult.verifierResult,
    provider: operationResult.provider,
    model: operationResult.model,
  };
}

function sanitizeQuestion(sectionKey, topic, question, sourceMetadata = {}) {
  if (question.section.trim().toLowerCase() !== sectionKey) {
    throw new Error("Generated section does not match the requested section.");
  }

  if (question.topic.trim() !== topic.name) {
    throw new Error("Generated topic does not match the requested topic.");
  }

  const prompt = question.question_text.trim();
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

  for (let index = 0; index < ANSWER_CHOICES.length; index += 1) {
    for (let innerIndex = index + 1; innerIndex < ANSWER_CHOICES.length; innerIndex += 1) {
      const left = choices[ANSWER_CHOICES[index]];
      const right = choices[ANSWER_CHOICES[innerIndex]];

      if (areEquivalentChoices(left, right)) {
        throw new Error("Question contains equivalent answer choices.");
      }
    }
  }

  if (sectionKey === "reading" && !passage) {
    throw new Error("Reading question missing passage.");
  }

  if (sectionKey === "science" && !passage) {
    throw new Error("Science question missing passage/setup.");
  }

  if (sectionKey === "english" && !passage) {
    throw new Error("English question missing passage/setup.");
  }

  const combinedText = `${passage || ""} ${prompt} ${explanation}`.toLowerCase();
  const explicitApproximationPrompt = /\b(closest|nearest|approximately|approximate|about|round)\b/i.test(
    prompt
  );

  if (
    /\b(however, given the options|it seems there was a mistake|considering the provided options)\b/i.test(
      explanation
    )
  ) {
    throw new Error("Explanation sounds like a broken or rescued item.");
  }

  if (
    /\b(not among the choices|not one of the choices|none of the choices|no listed answer|missing from the choices|missing from the answer choices)\b/i.test(
      explanation
    )
  ) {
    throw new Error("Explanation admits the correct answer is missing from the choices.");
  }

  if (
    /\b(closest|approximately|approximate)\b/i.test(explanation) &&
    !explicitApproximationPrompt
  ) {
    throw new Error("Explanation relies on unsignaled approximation language.");
  }

  if (
    sectionKey === "english" &&
    /\b(identify|what is the function|which punctuation mark|what is the subject|define|part of speech)\b/.test(
      combinedText
    )
  ) {
    throw new Error("English question reads like a terminology quiz instead of ACT revision.");
  }

  if (
    sectionKey === "english" &&
    /underlin/.test(combinedText) &&
    !/\[underline\].*?\[\/underline\]|__(.*?)__|<u>.*?<\/u>/i.test(passage || "")
  ) {
    throw new Error("English question refers to underlined text without markup.");
  }

  if (
    topic.slug === "algebra" &&
    /\b(circle|triangle|radius|diameter|circumference|angle sum|perimeter|area of a circle)\b/.test(
      combinedText
    )
  ) {
    throw new Error("Algebra question drifted into geometry.");
  }

  if (
    topic.slug === "literary-narrative" &&
    !/\b(he|she|they|i|we|said|thought|looked|walked|felt|remembered)\b/.test(combinedText)
  ) {
    throw new Error("Literary Narrative passage does not read like narrative prose.");
  }

  if (
    topic.slug === "social-science" &&
    !/\b(society|government|community|economy|economics|psychology|history|citizens|voters|policy|researchers|study|public|culture|labor|market|behavior|historical|anthropology|civics)\b/.test(
      combinedText
    )
  ) {
    throw new Error("Social Science passage does not reflect social-science content.");
  }

  if (
    sectionKey === "math" &&
    /\b(obvious|clearly|simply|just)\b/.test(combinedText)
  ) {
    throw new Error("Math item reads too simplistically for ACT style.");
  }

  if (
    topic.slug === "humanities" &&
    !/\b(art|music|literature|poetry|novel|painting|architecture|philosophy|culture|artist|composer)\b/.test(
      combinedText
    )
  ) {
    throw new Error("Humanities passage does not reflect humanities content.");
  }

  if (
    topic.slug === "natural-science" &&
    !/\b(scientists|species|cells|planet|chemical|physics|biology|ecosystem|climate|atom|energy)\b/.test(
      combinedText
    )
  ) {
    throw new Error("Natural Science passage does not reflect science content.");
  }

  if (
    topic.slug === "data-representation" &&
    !/\b(graph|table|figure|increased|decreased|trend|percent|temperature|rate|average)\b/.test(
      combinedText
    )
  ) {
    throw new Error("Data Representation item lacks clear data language.");
  }

  if (
    topic.slug === "research-summaries" &&
    !/\b(experiment|procedure|sample|trial|researchers|results|control|group|measured|study)\b/.test(
      combinedText
    )
  ) {
    throw new Error("Research Summaries item lacks experiment language.");
  }

  if (
    topic.slug === "conflicting-viewpoints" &&
    !/\b(scientist [12ab]|student [12ab]|researcher [12ab]|viewpoint [12ab])\b/.test(
      combinedText
    )
  ) {
    throw new Error("Conflicting Viewpoints item lacks clearly named viewpoints.");
  }

  const qualityReview = reviewQuestionQuality({
    id: `${topic.id}:${question.difficulty}:${prompt.slice(0, 32)}`,
    section: sectionKey,
    topic: topic.name,
    difficulty: question.difficulty,
    passage,
    question_text: prompt,
    choices,
    correct_answer: question.correct_answer,
    explanation,
  });

  if (qualityReview.blockingFlags.length > 0) {
    throw new Error(
      `Quality review blocked the question: ${qualityReview.blockingFlags
        .map((flag) => flag.code)
        .join(", ")}`
    );
  }

  if (
    qualityReview.warningFlags.some((flag) => flag.code.includes("drift")) ||
    ((question.difficulty === "medium" || question.difficulty === "hard") &&
      qualityReview.warningFlags.length > 0)
  ) {
    throw new Error(
      `Quality review rejected the question for risk: ${qualityReview.warningFlags
        .map((flag) => flag.code)
        .join(", ")}`
    );
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
    correctAnswer: question.correct_answer,
    explanation,
    qualityReview,
    generationModel: sourceMetadata.generationModel ?? generationModel,
    generationProvider: sourceMetadata.generationProvider ?? generationProvider,
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

function sanitizeQuestionSet(sectionKey, topic, generatedSet, requestedDifficultyCounts = null) {
  if (sectionKey !== "reading" && sectionKey !== "science") {
    throw new Error("Question sets are only supported for Reading and Science.");
  }

  if (generatedSet.section.trim().toLowerCase() !== sectionKey) {
    throw new Error("Generated set section does not match the requested section.");
  }

  if (generatedSet.topic.trim() !== topic.name) {
    throw new Error("Generated set topic does not match the requested topic.");
  }

  if (generatedSet.kind !== SET_KIND_BY_SECTION[sectionKey]) {
    throw new Error("Generated set kind does not match the requested section.");
  }

  const content = generatedSet.content.trim();
  if (content.length < 120) {
    throw new Error("Generated set content is too short to support a coherent shared set.");
  }

  const title = typeof generatedSet.title === "string" ? generatedSet.title.trim() || null : null;
  const metadata =
    generatedSet.metadata && typeof generatedSet.metadata === "object" ? generatedSet.metadata : null;
  const normalizedChildren = generatedSet.questions.map((question) =>
    sanitizeQuestion(sectionKey, topic, {
      ...question,
      passage: content,
    })
  );

  if (normalizedChildren.length < 3) {
    throw new Error("Generated set did not produce the minimum useful child-question count.");
  }

  const seenPrompts = new Set();
  normalizedChildren.forEach((child) => {
    const promptKey = normalizeText(child.prompt);
    if (seenPrompts.has(promptKey)) {
      throw new Error("Generated set contains duplicate child question stems.");
    }
    seenPrompts.add(promptKey);
  });

  return {
    sectionKey,
    topicId: topic.id,
    topicName: topic.name,
    topicSlug: topic.slug,
    kind: generatedSet.kind,
    title,
    content,
    metadata,
    requestedDifficultyCounts,
    questions: normalizedChildren.map((child) => ({
      ...child,
      passage: null,
      sharedContent: content,
    })),
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

  filters.unshift("t.is_active = true");
  const whereClause = `WHERE ${filters.join(" AND ")}`;
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

function hasHardPrimaryCorrectnessFailure(reviewerResult) {
  return (
    reviewerResult.correctness === "incorrect" ||
    reviewerResult.single_best_answer === "no" ||
    reviewerResult.unique_correct_answer === "no" ||
    reviewerResult.answer_key_verified === "no" ||
    reviewerResult.explanation_consistency === "inconsistent" ||
    reviewerResult.explanation_verified === "no" ||
    reviewerResult.choices_distinct === "no" ||
    reviewerResult.evidence_supported === "no" ||
    reviewerResult.section_appropriate === "no"
  );
}

function hasVerifierHardFailure(verifierResult) {
  return (
    verifierResult.correctness_verified === "no" ||
    verifierResult.unique_correct_answer === "no" ||
    verifierResult.answer_key_verified === "no" ||
    verifierResult.explanation_verified === "no" ||
    verifierResult.choices_distinct === "no" ||
    verifierResult.evidence_supported === "no" ||
    verifierResult.recommended_disposition !== "keep"
  );
}

function buildShadowReview(normalizedQuestion, reviewerResult, verifierResult) {
  const deterministic = normalizedQuestion.qualityReview;
  const primaryKeep =
    reviewerResult.verdict === "keep" &&
    reviewerResult.suggested_difficulty === null &&
    !hasHardPrimaryCorrectnessFailure(reviewerResult);
  const verifierAgrees =
    verifierResult &&
    verifierResult.recommended_disposition === "keep" &&
    verifierResult.correctness_verified === "yes" &&
    verifierResult.unique_correct_answer === "yes" &&
    verifierResult.answer_key_verified === "yes" &&
    verifierResult.explanation_verified === "yes" &&
    verifierResult.choices_distinct === "yes" &&
    verifierResult.evidence_supported === "yes";
  const autoPublishEligible =
    deterministic.autoPublishEligible &&
    primaryKeep &&
    verifierAgrees &&
    reviewerResult.correctness === "correct" &&
    reviewerResult.single_best_answer === "yes" &&
    reviewerResult.unique_correct_answer === "yes" &&
    reviewerResult.answer_key_verified === "yes" &&
    reviewerResult.explanation_consistency === "consistent" &&
    reviewerResult.explanation_verified === "yes" &&
    reviewerResult.choices_distinct === "yes" &&
    reviewerResult.evidence_supported === "yes" &&
    reviewerResult.section_appropriate === "yes";
  const disagreement =
    reviewerResult.verdict === "keep" &&
    reviewerResult.suggested_difficulty === null &&
    verifierResult &&
    !verifierAgrees &&
    !hasVerifierHardFailure(verifierResult);

  return {
    autoPublishEligible,
    disagreement,
    deterministicAutoPublishEligible: deterministic.autoPublishEligible,
    primaryKeep,
    verifierAgrees: Boolean(verifierAgrees),
  };
}

function buildReviewNotes({
  normalizedQuestion,
  reviewerResult,
  verifierResult,
  shadowReview,
}) {
  const lines = [`AI pre-review: ${reviewerResult.verdict}. ${reviewerResult.editorial_note}`];
  const shadowPayload = {
    autoPublishEligible: shadowReview.autoPublishEligible,
    deterministicAutoPublishEligible: shadowReview.deterministicAutoPublishEligible,
    primaryKeep: shadowReview.primaryKeep,
    verifierAgrees: shadowReview.verifierAgrees,
    disagreement: shadowReview.disagreement,
    deterministicFindings: normalizedQuestion.qualityReview.findings,
    primary: {
      correctness: reviewerResult.correctness,
      singleBestAnswer: reviewerResult.single_best_answer,
      uniqueCorrectAnswer: reviewerResult.unique_correct_answer,
      answerKeyVerified: reviewerResult.answer_key_verified,
      explanationVerified: reviewerResult.explanation_verified,
      choicesDistinct: reviewerResult.choices_distinct,
      evidenceSupported: reviewerResult.evidence_supported,
      sectionAppropriate: reviewerResult.section_appropriate,
    },
    verifier: verifierResult
      ? {
          correctnessVerified: verifierResult.correctness_verified,
          uniqueCorrectAnswer: verifierResult.unique_correct_answer,
          answerKeyVerified: verifierResult.answer_key_verified,
          explanationVerified: verifierResult.explanation_verified,
          choicesDistinct: verifierResult.choices_distinct,
          evidenceSupported: verifierResult.evidence_supported,
          recommendedDisposition: verifierResult.recommended_disposition,
        }
      : null,
  };

  if (verifierResult) {
    lines.push(`Correctness verifier: ${verifierResult.note}`);
  }

  lines.push(`[shadow-review] ${JSON.stringify(shadowPayload)}`);
  return lines.join("\n");
}

function createReviewCounters() {
  return {
    inserted: 0,
    skipped: 0,
    reviewKept: 0,
    reviewRevised: 0,
    reviewRejected: 0,
    reviewErrors: 0,
  };
}

function mergeReviewCounters(target, source) {
  target.inserted += Number(source.inserted ?? 0);
  target.skipped += Number(source.skipped ?? 0);
  target.reviewKept += Number(source.reviewKept ?? 0);
  target.reviewRevised += Number(source.reviewRevised ?? 0);
  target.reviewRejected += Number(source.reviewRejected ?? 0);
  target.reviewErrors += Number(source.reviewErrors ?? 0);
}

function buildQuestionReviewPayload(question) {
  return {
    difficulty: question.difficulty,
    passage: question.passage ?? question.sharedContent ?? null,
    question_text: question.prompt,
    choices: question.choices,
    correct_answer: question.correctAnswer,
    explanation: question.explanation,
  };
}

async function runReviewPipelineForQuestion({
  topic,
  normalizedQuestion,
  requestedDifficulty = normalizedQuestion.difficulty,
  contextLabel,
  onDifficultyRepair,
}) {
  const counters = createReviewCounters();
  let reviewerResult;
  let verifierResult = null;
  let disposition = "reject";
  let reviewProviderUsed = null;

  try {
    const reviewOperation = await reviewGeneratedQuestion(topic, buildQuestionReviewPayload(normalizedQuestion));
    reviewerResult = reviewOperation.reviewerResult;
    reviewProviderUsed = reviewOperation.provider;
  } catch (error) {
    if (error instanceof ProviderRunStoppedError) {
      error.progress = counters;
      throw error;
    }

    counters.reviewErrors += 1;
    counters.skipped += 1;
    console.warn(
      `Skipping ${contextLabel} after reviewer failure: ${
        error instanceof Error ? error.message : "unknown reviewer error"
      }`
    );
    return { approved: false, counters, normalizedQuestion };
  }

  disposition = decideChildDisposition({
    reviewerVerdict: reviewerResult.verdict,
    requestedDifficulty,
    generatedDifficulty: normalizedQuestion.difficulty,
    difficultyAccuracy: reviewerResult.difficulty_accuracy,
    suggestedDifficulty: reviewerResult.suggested_difficulty,
    hasHardFailure: hasHardPrimaryCorrectnessFailure(reviewerResult),
  });

  if (disposition === "revise") {
    if (onDifficultyRepair) {
      counters.reviewRevised += 1;
      console.warn(
        `Review disposition for ${contextLabel}: ${formatDifficultyDebugLabel({
          requestedDifficulty,
          generatedDifficulty: normalizedQuestion.difficulty,
          reviewerResult,
        })} · verdict=revise · action=revise`
      );

      let repairedQuestion = null;

      try {
        repairedQuestion = await onDifficultyRepair(reviewerResult);
      } catch (error) {
        counters.skipped += 1;
        console.warn(
          `Revision failed for ${contextLabel}: ${formatDifficultyDebugLabel({
            requestedDifficulty,
            generatedDifficulty: normalizedQuestion.difficulty,
            reviewerResult,
          })} · verdict=revise · action=replace · revision=failed · ${
            error instanceof Error ? error.message : "unknown revision error"
          }`
        );
        return { approved: false, counters, normalizedQuestion, reviewerResult, disposition: "replace" };
      }

      if (repairedQuestion) {
        const repairedResult = await runReviewPipelineForQuestion({
          topic,
          normalizedQuestion: repairedQuestion,
          requestedDifficulty,
          contextLabel: `${contextLabel}/revised`,
          onDifficultyRepair: null,
        });
        mergeReviewCounters(counters, repairedResult.counters);
        console.warn(
          `Revision completed for ${contextLabel}: ${formatDifficultyDebugLabel({
            requestedDifficulty,
            generatedDifficulty: normalizedQuestion.difficulty,
            reviewerResult,
          })} · verdict=revise · action=${repairedResult.approved ? "accept" : "replace"} · revision=${
            repairedResult.approved ? "accepted" : "failed"
          }`
        );
        return repairedResult.approved
          ? {
              approved: true,
              counters,
              normalizedQuestion: repairedResult.normalizedQuestion,
              reviewerResult: repairedResult.reviewerResult,
              verifierResult: repairedResult.verifierResult,
              reviewerNote: repairedResult.reviewerNote,
              disposition: "accept",
            }
          : {
              approved: false,
              counters,
              normalizedQuestion: repairedResult.normalizedQuestion ?? normalizedQuestion,
              reviewerResult,
              disposition: "replace",
            };
      }
    }

    incrementReviewCounters(counters, reviewerResult);
    console.warn(
      `Skipping ${contextLabel} after AI review: ${reviewerResult.verdict} (${formatDifficultyDebugLabel({
        requestedDifficulty,
        generatedDifficulty: normalizedQuestion.difficulty,
        reviewerResult,
      })} · action=replace${reviewerResult.main_issues.length > 0 ? ` · ${reviewerResult.main_issues.join(", ")}` : ""})`
    );
    return { approved: false, counters, normalizedQuestion, reviewerResult, disposition: "replace" };
  }

  if (disposition !== "accept") {
    incrementReviewCounters(counters, reviewerResult);
    console.warn(
      `Skipping ${contextLabel} after AI review: ${reviewerResult.verdict} (${formatDifficultyDebugLabel({
        requestedDifficulty,
        generatedDifficulty: normalizedQuestion.difficulty,
        reviewerResult,
      })} · action=reject${reviewerResult.main_issues.length > 0 ? ` · ${reviewerResult.main_issues.join(", ")}` : ""})`
    );
    return { approved: false, counters, normalizedQuestion, reviewerResult, disposition };
  }

  console.warn(
    `Review disposition for ${contextLabel}: ${formatDifficultyDebugLabel({
      requestedDifficulty,
      generatedDifficulty: normalizedQuestion.difficulty,
      reviewerResult,
    })} · verdict=keep · action=accept`
  );

  try {
    const verificationOperation = await verifyGeneratedQuestionCorrectness(
      topic,
      buildQuestionReviewPayload(normalizedQuestion),
      reviewProvider,
      reviewModel,
      normalizedQuestion.generationProvider ?? reviewProviderUsed
    );
    verifierResult = verificationOperation.verifierResult;
  } catch (error) {
    if (error instanceof ProviderRunStoppedError) {
      error.progress = counters;
      throw error;
    }

    counters.reviewErrors += 1;
    counters.skipped += 1;
    console.warn(
      `Skipping ${contextLabel} after correctness verifier failure: ${
        error instanceof Error ? error.message : "unknown correctness verifier error"
      }`
    );
    return { approved: false, counters, normalizedQuestion, reviewerResult, disposition: "replace" };
  }

  if (hasVerifierHardFailure(verifierResult)) {
    incrementReviewCounters(counters, verifierResult, "verifier");
    console.warn(
      `Skipping ${contextLabel} after correctness verification: ${verifierResult.recommended_disposition} (${formatDifficultyDebugLabel({
        requestedDifficulty,
        generatedDifficulty: normalizedQuestion.difficulty,
        reviewerResult,
      })} · action=reject${verifierResult.main_issues.length > 0 ? ` · ${verifierResult.main_issues.join(", ")}` : ""})`
    );
    return { approved: false, counters, normalizedQuestion, reviewerResult, verifierResult, disposition: "reject" };
  }

  counters.reviewKept += 1;
  const shadowReview = buildShadowReview(normalizedQuestion, reviewerResult, verifierResult);

  return {
    approved: true,
    counters,
    normalizedQuestion,
    reviewerResult,
    verifierResult,
    reviewerNote: buildReviewNotes({
      normalizedQuestion,
      reviewerResult,
      verifierResult,
      shadowReview,
    }),
    disposition: "accept",
  };
}

function getRequestedChildCountForTopic() {
  return DIFFICULTIES.reduce((sum, difficulty) => sum + requestedDifficultyCounts[difficulty], 0);
}

function getPlannedSetCountForTopic(sectionKey) {
  if (sectionKey !== "reading" && sectionKey !== "science") {
    return 0;
  }

  return Math.max(1, Math.ceil(getRequestedChildCountForTopic() / (SET_DEFAULT_CHILD_COUNT[sectionKey] ?? 6)));
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
  let reviewKept = 0;
  let reviewRevised = 0;
  let reviewRejected = 0;
  let reviewErrors = 0;

  for (const generatedQuestion of generatedQuestions) {
    let normalizedQuestion;

    try {
      normalizedQuestion = sanitizeQuestion(topic.section_key, topic, generatedQuestion, {
        generationProvider: generatedQuestion._generationProvider,
        generationModel: generatedQuestion._generationModel,
      });
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

    let reviewedQuestion;

    try {
      reviewedQuestion = await runReviewPipelineForQuestion({
        topic,
        normalizedQuestion,
        contextLabel: `${topic.section_key}/${topic.slug} question`,
        onDifficultyRepair: null,
      });
    } catch (error) {
      if (error instanceof ProviderRunStoppedError) {
        const progress = error.progress ?? {};
        error.progress = {
          inserted,
          skipped: skipped + Number(progress.skipped ?? 0),
          reviewKept: reviewKept + Number(progress.reviewKept ?? 0),
          reviewRevised: reviewRevised + Number(progress.reviewRevised ?? 0),
          reviewRejected: reviewRejected + Number(progress.reviewRejected ?? 0),
          reviewErrors: reviewErrors + Number(progress.reviewErrors ?? 0),
        };
      }

      throw error;
    }

    inserted += 0;
    skipped += reviewedQuestion.counters.skipped;
    reviewKept += reviewedQuestion.counters.reviewKept;
    reviewRevised += reviewedQuestion.counters.reviewRevised;
    reviewRejected += reviewedQuestion.counters.reviewRejected;
    reviewErrors += reviewedQuestion.counters.reviewErrors;

    if (!reviewedQuestion.approved) {
      continue;
    }

    const approvedQuestion = reviewedQuestion.normalizedQuestion;

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
          generation_model,
          status,
          review_notes
        )
        VALUES ($1, $2, $3, 'multiple_choice', $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (fingerprint) DO NOTHING
        RETURNING id
      `,
      [
        approvedQuestion.sectionKey,
        approvedQuestion.topicId,
        approvedQuestion.difficulty,
        approvedQuestion.prompt,
        approvedQuestion.passage,
        approvedQuestion.fingerprint,
        JSON.stringify(approvedQuestion.choices),
        approvedQuestion.correctAnswer,
        approvedQuestion.explanation,
        approvedQuestion.generationProvider,
        approvedQuestion.generationModel,
        requestedStatus,
        reviewedQuestion.reviewerNote,
      ]
    );

    if (result.rowCount > 0) {
      knownFingerprints.add(approvedQuestion.fingerprint);
      inserted += 1;
    } else {
      skipped += 1;
    }
  }

  return {
    inserted,
    skipped,
    reviewKept,
    reviewRevised,
    reviewRejected,
    reviewErrors,
  };
}

async function insertQuestionSets(topic, generatedSets) {
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
  let reviewKept = 0;
  let reviewRevised = 0;
  let reviewRejected = 0;
  let reviewErrors = 0;
  let setsInserted = 0;
  const maxReplacementAttemptsPerMissingChild = 2;

  for (const generatedSet of generatedSets) {
    let normalizedSet;

    try {
      normalizedSet = sanitizeQuestionSet(topic.section_key, topic, generatedSet, generatedSet.requestedDifficultyCounts ?? null);
    } catch (error) {
      skipped += Array.isArray(generatedSet.questions) ? generatedSet.questions.length : 1;
      console.warn(
        `Skipping invalid ${topic.section_key}/${topic.slug} set: ${
          error instanceof Error ? error.message : "unknown set validation error"
        }`
      );
      continue;
    }

    const uniqueChildren = normalizedSet.questions.filter((question) => !knownFingerprints.has(question.fingerprint));

    if (uniqueChildren.length < 3) {
      skipped += normalizedSet.questions.length;
      console.warn(
        `Skipping ${topic.section_key}/${topic.slug} set after duplicate filtering: fewer than 3 unique child questions remain.`
      );
      continue;
    }

    const approvedChildren = [];
    const existingPrompts = new Set(uniqueChildren.map((child) => child.prompt));

    for (const child of uniqueChildren) {
      try {
        const reviewedChild = await runReviewPipelineForQuestion({
          topic,
          normalizedQuestion: child,
          requestedDifficulty: child.difficulty,
          contextLabel: `${topic.section_key}/${topic.slug} child`,
          onDifficultyRepair: async (reviewerResult) => {
            const revisedRawChild = await reviseSetChildForDifficulty(topic, {
              child,
              sharedContent: child.sharedContent,
              requestedDifficulty: child.difficulty,
              reviewerResult,
            });

            return sanitizeQuestion(
              topic.section_key,
              topic,
              {
                ...revisedRawChild.question,
                passage: child.sharedContent,
              },
              {
                generationProvider: revisedRawChild.provider,
                generationModel: revisedRawChild.model,
              }
            );
          },
        });

        skipped += reviewedChild.counters.skipped;
        reviewKept += reviewedChild.counters.reviewKept;
        reviewRevised += reviewedChild.counters.reviewRevised;
        reviewRejected += reviewedChild.counters.reviewRejected;
        reviewErrors += reviewedChild.counters.reviewErrors;

        if (reviewedChild.approved) {
          approvedChildren.push({
            ...reviewedChild.normalizedQuestion,
            passage: null,
            sharedContent: child.sharedContent,
            reviewerNote: reviewedChild.reviewerNote,
          });
          existingPrompts.add(reviewedChild.normalizedQuestion.prompt);
        }
      } catch (error) {
        if (error instanceof ProviderRunStoppedError) {
          const progress = error.progress ?? {};
          error.progress = {
            inserted,
            skipped: skipped + Number(progress.skipped ?? 0),
            reviewKept: reviewKept + Number(progress.reviewKept ?? 0),
            reviewRevised: reviewRevised + Number(progress.reviewRevised ?? 0),
            reviewRejected: reviewRejected + Number(progress.reviewRejected ?? 0),
            reviewErrors: reviewErrors + Number(progress.reviewErrors ?? 0),
            setsInserted,
          };
          throw error;
        }
      }
    }

    const missingDifficulties = buildMissingDifficultySequence(
      normalizedSet.requestedDifficultyCounts ??
        DIFFICULTIES.reduce((counts, difficulty) => {
          counts[difficulty] = normalizedSet.questions.filter((child) => child.difficulty === difficulty).length;
          return counts;
        }, { easy: 0, medium: 0, hard: 0 }),
      approvedChildren.map((child) => child.difficulty)
    );

    for (const missingDifficulty of missingDifficulties) {
      let replacementApproved = false;

      for (let attempt = 1; attempt <= maxReplacementAttemptsPerMissingChild; attempt += 1) {
        try {
          const replacementRawChild = await generateReplacementSetChild(topic, {
            sharedContent: normalizedSet.content,
            requestedDifficulty: missingDifficulty,
            existingPrompts: Array.from(existingPrompts),
          });
          const replacementCandidate = toCanonicalSetChildCandidate(replacementRawChild.question, {
            topic,
            originalChild: null,
            requestedDifficulty: missingDifficulty,
          });
          const replacementChild = sanitizeQuestion(
            topic.section_key,
            topic,
            {
              ...replacementCandidate,
              passage: normalizedSet.content,
            },
            {
              generationProvider: replacementRawChild.provider,
              generationModel: replacementRawChild.model,
            }
          );

          if (
            knownFingerprints.has(replacementChild.fingerprint) ||
            approvedChildren.some((child) => child.fingerprint === replacementChild.fingerprint) ||
            existingPrompts.has(replacementChild.prompt)
          ) {
            skipped += 1;
            console.warn(
              `Skipping ${topic.section_key}/${topic.slug} replacement child after duplicate filtering: requested=${missingDifficulty} · attempt=${attempt}`
            );
            continue;
          }

          const reviewedReplacement = await runReviewPipelineForQuestion({
            topic,
            normalizedQuestion: replacementChild,
            requestedDifficulty: missingDifficulty,
            contextLabel: `${topic.section_key}/${topic.slug} replacement child attempt ${attempt}`,
            onDifficultyRepair: async (reviewerResult) => {
              const revisedRawChild = await reviseSetChildForDifficulty(topic, {
                child: {
                  ...replacementChild,
                  sharedContent: normalizedSet.content,
                },
                sharedContent: normalizedSet.content,
                requestedDifficulty: missingDifficulty,
                reviewerResult,
              });

              return sanitizeQuestion(
                topic.section_key,
                topic,
                {
                  ...revisedRawChild.question,
                  passage: normalizedSet.content,
                },
                {
                  generationProvider: revisedRawChild.provider,
                  generationModel: revisedRawChild.model,
                }
              );
            },
          });

          skipped += reviewedReplacement.counters.skipped;
          reviewKept += reviewedReplacement.counters.reviewKept;
          reviewRevised += reviewedReplacement.counters.reviewRevised;
          reviewRejected += reviewedReplacement.counters.reviewRejected;
          reviewErrors += reviewedReplacement.counters.reviewErrors;

          if (!reviewedReplacement.approved) {
            continue;
          }

          approvedChildren.push({
            ...reviewedReplacement.normalizedQuestion,
            passage: null,
            sharedContent: normalizedSet.content,
            reviewerNote: reviewedReplacement.reviewerNote,
          });
          existingPrompts.add(reviewedReplacement.normalizedQuestion.prompt);
          replacementApproved = true;
          break;
        } catch (error) {
          if (error instanceof ProviderRunStoppedError) {
            const progress = error.progress ?? {};
            error.progress = {
              inserted,
              skipped: skipped + Number(progress.skipped ?? 0),
              reviewKept: reviewKept + Number(progress.reviewKept ?? 0),
              reviewRevised: reviewRevised + Number(progress.reviewRevised ?? 0),
              reviewRejected: reviewRejected + Number(progress.reviewRejected ?? 0),
              reviewErrors: reviewErrors + Number(progress.reviewErrors ?? 0),
              setsInserted,
            };
            throw error;
          }

          reviewErrors += 1;
          skipped += 1;
          console.warn(
            `Skipping ${topic.section_key}/${topic.slug} replacement child after generation failure: requested=${missingDifficulty} · attempt=${attempt} · ${
              error instanceof Error ? error.message : "unknown replacement error"
            }`
          );
        }
      }

      if (!replacementApproved) {
        console.warn(
          `Skipping ${topic.section_key}/${topic.slug} set after replacement attempts: requested=${missingDifficulty} could not be approved against the same shared stimulus.`
        );
      }
    }

    if (approvedChildren.length < 3) {
      console.warn(
        `Skipping ${topic.section_key}/${topic.slug} set after review: fewer than 3 approved child questions remain.`
      );
      continue;
    }

    try {
      await client.query("BEGIN");
      let insertedForSet = 0;

      const setInsert = await client.query(
        `
          INSERT INTO question_sets (
            section_key,
            topic_id,
            kind,
            title,
            content,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          RETURNING id
        `,
        [
          normalizedSet.sectionKey,
          normalizedSet.topicId,
          normalizedSet.kind,
          normalizedSet.title,
          normalizedSet.content,
          JSON.stringify(normalizedSet.metadata),
        ]
      );

      const questionSetId = setInsert.rows[0]?.id;

      if (!questionSetId) {
        throw new Error("Question set insert did not return an id.");
      }

      for (const child of approvedChildren) {
        const result = await client.query(
          `
            INSERT INTO questions (
              section_key,
              topic_id,
              question_set_id,
              difficulty,
              question_type,
              prompt,
              passage,
              fingerprint,
              choices,
              correct_answer,
              explanation,
              source,
              generation_model,
              status,
              review_notes
            )
            VALUES ($1, $2, $3, $4, 'multiple_choice', $5, NULL, $6, $7::jsonb, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (fingerprint) DO NOTHING
            RETURNING id
          `,
          [
            child.sectionKey,
            child.topicId,
            questionSetId,
            child.difficulty,
            child.prompt,
            child.fingerprint,
            JSON.stringify(child.choices),
            child.correctAnswer,
            child.explanation,
            child.generationProvider,
            child.generationModel,
            requestedStatus,
            child.reviewerNote,
          ]
        );

        if (result.rowCount > 0) {
          knownFingerprints.add(child.fingerprint);
          inserted += 1;
          insertedForSet += 1;
        } else {
          skipped += 1;
        }
      }

      if (insertedForSet < 3) {
        throw new Error("Fewer than 3 child questions were inserted for the generated set.");
      }

      if (insertedForSet > 0) {
        setsInserted += 1;
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      skipped += approvedChildren.length;
      console.warn(
        `Rolling back ${topic.section_key}/${topic.slug} set insert: ${
          error instanceof Error ? error.message : "unknown transaction error"
        }`
      );
    }
  }

  return {
    inserted,
    skipped,
    reviewKept,
    reviewRevised,
    reviewRejected,
    reviewErrors,
    setsInserted,
  };
}

async function rereviewExistingDraftQuestions(questionIds) {
  const rows = await client.query(
    `
      SELECT
        q.id,
        q.section_key,
        q.topic_id,
        q.difficulty,
        q.prompt,
        q.passage,
        q.fingerprint,
        q.choices,
        q.correct_answer,
        q.explanation,
        q.source,
        q.generation_model,
        q.status,
        t.slug AS topic_slug,
        t.name AS topic_name,
        qs.content AS question_set_content
      FROM questions q
      INNER JOIN act_topics t ON t.id = q.topic_id
      LEFT JOIN question_sets qs ON qs.id = q.question_set_id
      WHERE q.id = ANY($1::uuid[])
      ORDER BY q.created_at DESC
    `,
    [questionIds]
  );

  const summary = {
    processed: 0,
    updated: 0,
    skipped: 0,
    blocked: 0,
    warning: 0,
    clean: 0,
    reviewKept: 0,
    reviewRevised: 0,
    reviewRejected: 0,
    reviewErrors: 0,
    failures: [],
  };

  for (const row of rows.rows) {
    if (row.status !== "draft") {
      summary.skipped += 1;
      summary.failures.push({
        topic: `${row.section_key}/${row.topic_slug}`,
        error: `Question ${row.id} is ${row.status}, not draft.`,
      });
      continue;
    }

    summary.processed += 1;
    const effectivePassage = row.passage ?? row.question_set_content ?? null;
    const normalizedQuestion = {
      id: row.id,
      sectionKey: row.section_key,
      topicId: row.topic_id,
      topicName: row.topic_name,
      topicSlug: row.topic_slug,
      difficulty: row.difficulty,
      prompt: row.prompt,
      passage: effectivePassage,
      choices: row.choices,
      correctAnswer: row.correct_answer,
      explanation: row.explanation,
      qualityReview: reviewQuestionQuality({
        id: row.id,
        section: row.section_key,
        topic: row.topic_name,
        difficulty: row.difficulty,
        passage: effectivePassage,
        question_text: row.prompt,
        choices: row.choices,
        correct_answer: row.correct_answer,
        explanation: row.explanation,
      }),
      generationProvider: row.source,
      generationModel: row.generation_model,
      fingerprint: row.fingerprint,
    };

    let reviewedQuestion;

    try {
      reviewedQuestion = await runReviewPipelineForQuestion({
        topic: {
          id: row.topic_id,
          section_key: row.section_key,
          slug: row.topic_slug,
          name: row.topic_name,
        },
        normalizedQuestion,
        requestedDifficulty: row.difficulty,
        contextLabel: `re-review ${row.section_key}/${row.topic_slug}/${row.id}`,
        onDifficultyRepair: null,
      });
    } catch (error) {
      if (error instanceof ProviderRunStoppedError) {
        throw error;
      }

      summary.reviewErrors += 1;
      summary.failures.push({
        topic: `${row.section_key}/${row.topic_slug}`,
        error: error instanceof Error ? error.message : "unknown re-review error",
      });
      continue;
    }

    summary.reviewKept += reviewedQuestion.counters.reviewKept;
    summary.reviewRevised += reviewedQuestion.counters.reviewRevised;
    summary.reviewRejected += reviewedQuestion.counters.reviewRejected;
    summary.reviewErrors += reviewedQuestion.counters.reviewErrors;

    const finalQuestion = reviewedQuestion.normalizedQuestion ?? normalizedQuestion;
    const reviewerResult = reviewedQuestion.reviewerResult;
    const verifierResult = reviewedQuestion.verifierResult ?? null;

    if (!reviewerResult) {
      summary.failures.push({
        topic: `${row.section_key}/${row.topic_slug}`,
        error: `Question ${row.id} could not be re-reviewed because no reviewer result was produced.`,
      });
      continue;
    }

    const shadowReview = buildShadowReview(finalQuestion, reviewerResult, verifierResult);
    const reviewNotes = buildReviewNotes({
      normalizedQuestion: finalQuestion,
      reviewerResult,
      verifierResult,
      shadowReview,
    });

    const updateResult = await client.query(
      `
        UPDATE questions
        SET
          status = 'draft',
          review_notes = $2,
          reviewed_at = NOW(),
          reviewed_by_user_id = $3,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `,
      [row.id, reviewNotes, reviewedByUserId]
    );

    if (updateResult.rowCount > 0) {
      summary.updated += 1;
      if (finalQuestion.qualityReview.blockingFlags.length > 0) {
        summary.blocked += 1;
      } else if (finalQuestion.qualityReview.warningFlags.length > 0 || !reviewedQuestion.approved) {
        summary.warning += 1;
      } else {
        summary.clean += 1;
      }
    }
  }

  return summary;
}

async function main() {
  await client.connect();

  try {
    if (isRereviewMode) {
      const summary = await rereviewExistingDraftQuestions(rereviewQuestionIds);
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const topics = await getTopics();

    if (topics.length === 0) {
      console.log("No matching topics found.");
      return;
    }

    const summary = {
      provider: generationProvider,
      model: generationModel,
      reviewProvider,
      reviewModel,
      topicsProcessed: 0,
      inserted: 0,
      setsInserted: 0,
      skipped: 0,
      reviewKept: 0,
      reviewRevised: 0,
      reviewRejected: 0,
      reviewErrors: 0,
      paused: false,
      runState: "completed",
      pauseReason: null,
      remainingPlannedChildCount: 0,
      providerAvailability: null,
      providerEvents: [],
      topics: [],
      failures: [],
    };

    console.log(
      `Generating ACT inventory for ${topics.length} topic(s) with difficulty plan easy:${requestedDifficultyCounts.easy}, medium:${requestedDifficultyCounts.medium}, hard:${requestedDifficultyCounts.hard}.`
    );

    for (const [topicIndex, topic] of topics.entries()) {
      console.log(`\nGenerating ${topic.section_key}/${topic.slug}...`);
      const requestedChildCount = getRequestedChildCountForTopic();
      const plannedSetCount = getPlannedSetCountForTopic(topic.section_key);

      try {
        const { generatedQuestions, generatedSets, failures } = await generateBatchForTopic(topic);
        const {
          inserted,
          setsInserted,
          skipped,
          reviewKept,
          reviewRevised,
          reviewRejected,
          reviewErrors,
        } =
          generatedSets.length > 0
            ? await insertQuestionSets(topic, generatedSets)
            : await insertQuestions(topic, generatedQuestions);
        summary.topicsProcessed += 1;
        summary.inserted += inserted;
        summary.setsInserted += setsInserted ?? 0;
        summary.skipped += skipped;
        summary.reviewKept += reviewKept;
        summary.reviewRevised += reviewRevised;
        summary.reviewRejected += reviewRejected;
        summary.reviewErrors += reviewErrors;
        summary.failures.push(...failures);
        summary.topics.push({
          sectionKey: topic.section_key,
          topicSlug: topic.slug,
          requestedChildCount,
          plannedSetCount,
          inserted,
          skipped,
          reviewKept,
          reviewRevised,
          reviewRejected,
          reviewErrors,
          remainingChildCount: Math.max(0, requestedChildCount - inserted),
          status: "completed",
          providerAvailability: summarizeProviderAvailability(runProviderState),
        });

        console.log(
          `Inserted ${inserted} question(s)${
            setsInserted ? ` across ${setsInserted} set(s)` : ""
          }; reviewer kept ${reviewKept}, revised ${reviewRevised}, rejected ${reviewRejected}, errored ${reviewErrors}; skipped ${skipped} total for ${topic.section_key}/${topic.slug}.`
        );

        if (delayMs > 0) {
          await sleep(delayMs);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        summary.failures.push({ topic: `${topic.section_key}/${topic.slug}`, error: message });
        console.error(`Failed ${topic.section_key}/${topic.slug}: ${message}`);

        if (error instanceof ProviderRunStoppedError) {
          const partialProgress = error.progress ?? {};
          const partialInserted = Number(partialProgress.inserted ?? 0);
          const partialSkipped = Number(partialProgress.skipped ?? 0);
          const partialReviewKept = Number(partialProgress.reviewKept ?? 0);
          const partialReviewRevised = Number(partialProgress.reviewRevised ?? 0);
          const partialReviewRejected = Number(partialProgress.reviewRejected ?? 0);
          const partialReviewErrors = Number(partialProgress.reviewErrors ?? 0);
          const partialSetsInserted = Number(partialProgress.setsInserted ?? 0);
          summary.paused = true;
          summary.runState = "paused_due_to_provider";
          summary.pauseReason = error.classification?.kind ?? "providers-unavailable";
          summary.providerAvailability = summarizeProviderAvailability(runProviderState);
          summary.providerEvents = runProviderState.events;
          summary.inserted += partialInserted;
          summary.skipped += partialSkipped;
          summary.reviewKept += partialReviewKept;
          summary.reviewRevised += partialReviewRevised;
          summary.reviewRejected += partialReviewRejected;
          summary.reviewErrors += partialReviewErrors;
          summary.setsInserted += partialSetsInserted;
          summary.remainingPlannedChildCount += Math.max(0, requestedChildCount - partialInserted);
          summary.topics.push({
            sectionKey: topic.section_key,
            topicSlug: topic.slug,
            requestedChildCount,
            plannedSetCount,
            inserted: partialInserted,
            skipped: partialSkipped,
            reviewKept: partialReviewKept,
            reviewRevised: partialReviewRevised,
            reviewRejected: partialReviewRejected,
            reviewErrors: partialReviewErrors,
            remainingChildCount: Math.max(0, requestedChildCount - partialInserted),
            status: "paused_due_to_provider",
            providerFailure: {
              provider: error.provider,
              kind: error.classification?.kind ?? "providers-unavailable",
              message,
            },
            providerAvailability: summary.providerAvailability,
          });

          const remainingTopics = topics.slice(topicIndex + 1);
          for (const remainingTopic of remainingTopics) {
            const remainingRequestedChildCount = getRequestedChildCountForTopic();
            summary.remainingPlannedChildCount += remainingRequestedChildCount;
            summary.topics.push({
              sectionKey: remainingTopic.section_key,
              topicSlug: remainingTopic.slug,
              requestedChildCount: remainingRequestedChildCount,
              plannedSetCount: getPlannedSetCountForTopic(remainingTopic.section_key),
              inserted: 0,
              skipped: 0,
              reviewKept: 0,
              reviewRevised: 0,
              reviewRejected: 0,
              reviewErrors: 0,
              remainingChildCount: remainingRequestedChildCount,
              status: "not_started_due_to_provider_pause",
            });
          }
          break;
        }
      }
    }

    if (!summary.providerAvailability) {
      summary.providerAvailability = summarizeProviderAvailability(runProviderState);
    }

    if (summary.providerEvents.length === 0) {
      summary.providerEvents = runProviderState.events;
    }

    if (jsonOnly) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log("\nGeneration summary:");
      console.log(JSON.stringify(summary, null, 2));
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
