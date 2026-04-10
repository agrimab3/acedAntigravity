import { createHash } from "crypto";
import { Client } from "pg";
import { z } from "zod";
import { reviewQuestionQuality } from "./lib/question-utils.ts";

const SECTION_KEYS = ["english", "math", "reading", "science"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const ANSWER_CHOICES = ["A", "B", "C", "D"];
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const SUPPORTED_PROVIDERS = ["gemini", "groq"];
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

Do not repair the item unless explicitly asked.
Evaluate it as submitted.

Return valid JSON only.
No markdown.
No commentary outside the JSON.
`.trim();

const databaseUrl = process.env.DATABASE_URL;
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const groqApiKey = process.env.GROQ_API_KEY || "";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const args = parseArgs(process.argv.slice(2));
const perDifficulty = Math.max(1, Number(args["per-difficulty"] || 3));
const requestedStatus = (args.status || "draft").trim().toLowerCase();
const sectionFilter = args.section?.trim().toLowerCase();
const topicFilter = args.topic?.trim().toLowerCase();
const topicLimit = args["limit-topics"] ? Math.max(1, Number(args["limit-topics"])) : null;
const delayMs = Math.max(0, Number(args["delay-ms"] || 800));
const jsonOnly = args.json === "true" || args.json === "1";
const generationProvider = resolveGenerationProvider(args.provider);
const generationModel = resolveGenerationModel(generationProvider, args.model);
const reviewProvider = resolveReviewProvider(args["review-provider"], generationProvider);
const reviewModel = resolveReviewModel(reviewProvider, args["review-model"], generationModel);

if (sectionFilter && !SECTION_KEYS.includes(sectionFilter)) {
  throw new Error(`Invalid --section value: ${sectionFilter}`);
}

if (!["draft", "published"].includes(requestedStatus)) {
  throw new Error(`Invalid --status value: ${requestedStatus}`);
}

if (generationProvider === "gemini" && !geminiApiKey) {
  throw new Error("GEMINI_API_KEY is required when using the Gemini generation provider.");
}

if (generationProvider === "groq" && !groqApiKey) {
  throw new Error("GROQ_API_KEY is required when using the Groq generation provider.");
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
  main_issues: z.array(z.string().min(1)).max(6),
  suggested_difficulty: z.union([z.enum(DIFFICULTIES), z.null()]),
  editorial_note: z.string().min(1),
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

function resolveGenerationProvider(rawProvider) {
  const configured =
    rawProvider ||
    process.env.QUESTION_GENERATION_PROVIDER ||
    process.env.CONTENT_GENERATION_PROVIDER ||
    (groqApiKey ? "groq" : "gemini");

  const normalized = configured.trim().toLowerCase();

  if (!SUPPORTED_PROVIDERS.includes(normalized)) {
    throw new Error(`Unsupported generation provider: ${normalized}`);
  }

  return normalized;
}

function resolveReviewProvider(rawProvider, fallbackProvider) {
  const configured =
    rawProvider ||
    process.env.QUESTION_REVIEW_PROVIDER ||
    process.env.CONTENT_REVIEW_PROVIDER ||
    fallbackProvider;

  const normalized = configured.trim().toLowerCase();

  if (!SUPPORTED_PROVIDERS.includes(normalized)) {
    throw new Error(`Unsupported review provider: ${normalized}`);
  }

  return normalized;
}

function resolveGenerationModel(provider, rawModel) {
  if (rawModel?.trim()) {
    return rawModel.trim();
  }

  if (provider === "groq") {
    return (
      process.env.GROQ_GENERATION_MODEL ||
      process.env.GROQ_MODEL ||
      "llama-3.3-70b-versatile"
    );
  }

  return process.env.GEMINI_GENERATION_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
}

function resolveReviewModel(provider, rawModel, fallbackModel) {
  if (rawModel?.trim()) {
    return rawModel.trim();
  }

  if (provider === "groq") {
    return (
      process.env.GROQ_REVIEW_MODEL ||
      process.env.GROQ_GENERATION_MODEL ||
      process.env.GROQ_MODEL ||
      fallbackModel
    );
  }

  return (
    process.env.GEMINI_REVIEW_MODEL ||
    process.env.GEMINI_GENERATION_MODEL ||
    process.env.GEMINI_MODEL ||
    fallbackModel
  );
}

function resolveFallbackProvider(primaryProvider) {
  if (primaryProvider === "groq" && geminiApiKey) {
    return "gemini";
  }

  return null;
}

function resolveFallbackModel(primaryProvider, mode, fallbackModel) {
  const fallbackProvider = resolveFallbackProvider(primaryProvider);

  if (!fallbackProvider) {
    return null;
  }

  if (mode === "review") {
    return resolveReviewModel(fallbackProvider, null, fallbackModel);
  }

  return resolveGenerationModel(fallbackProvider, null);
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

function extractRetryDelayMs(message) {
  const match = message.match(/Please retry in\s+([\d.]+)s/i);

  if (!match) {
    return null;
  }

  return Math.ceil(Number(match[1]) * 1000);
}

function isRetryableStructuredOutputError(message) {
  return /unterminated string in json|unexpected end of json input|malformed json response|json at position/i.test(
    message
  );
}

function isRetryableGeminiError(message) {
  return /quota exceeded|retry in|429/i.test(message) || isRetryableStructuredOutputError(message);
}

function isRetryableGroqError(message) {
  return (
    /rate limit|rate_limit|too many requests|429|capacity_exceeded|498/i.test(message) ||
    isRetryableStructuredOutputError(message)
  );
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
- Do not create near-duplicate stems, passages, explanations, or answer-choice patterns.
- Do not create an item that a human editor would likely reject as too easy, too generic, too short, too direct, or too arguable.
- Do not output placeholder-quality items.
- If an item feels weak, rewrite it before including it.
- Do not create answer choices that are equivalent in meaning or value.
- Do not create explanations that mention a different answer letter than the keyed correct answer.

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
- suggested_difficulty: easy, medium, hard, null

Rules:
- Be strict.
- Reject items that are weak even if technically answerable.
- Reject items that feel like worksheet drills rather than ACT items.
- Reject items whose passage simply gives away the answer.
- Reject medium or hard math items that are just direct substitution, direct evaluation, formula recall, or routine solving.
- Reject English items with more than one reasonably defensible revision.
- Reject Reading items whose passage does not genuinely support inference, tone, organization, or evidence-based interpretation.
- Reject any item with a broken explanation or missing correct option.
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
    throw new Error(`Gemini request failed: ${message}`);
  }

  const text =
    payload?.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

async function requestGroqJson({ model, systemPrompt, userPrompt, schema, temperature = 0.35 }) {
  const groqSupportsJsonSchema = supportsGroqJsonSchema(model);
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
    throw new Error(`Groq request failed: ${message}`);
  }

  const text = payload?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    throw new Error("Groq returned an empty response.");
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
  if (provider === "groq") {
    return requestGroqJson({
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

async function generateBatchForDifficulty(
  topic,
  requestedDifficulty,
  requestedCount,
  attempt = 1,
  provider = generationProvider,
  model = generationModel,
  hasFallenBack = false
) {
  try {
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
    const text = await requestStructuredJson({
      provider,
      model,
      systemPrompt: GENERATION_SYSTEM_PROMPT,
      userPrompt: prompt,
      schema,
      temperature: 0.7,
    });
    const parsedPayload = parseModelJson(text);

    return buildGeneratedBatchSchema({
      requestedCount,
      requestedDifficulty,
    }).parse(parsedPayload).questions;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown generation error";

    const isRetryable =
      provider === "groq"
        ? isRetryableGroqError(message)
        : isRetryableGeminiError(message);

    if (attempt < 3 && isRetryable) {
      const retryDelayMs =
        extractRetryDelayMs(message) ?? (provider === "groq" ? 20000 : 35000);
      console.warn(
        `${provider} rate limited for ${topic.section_key}/${topic.slug}/${requestedDifficulty}; retrying in ${Math.ceil(
          retryDelayMs / 1000
        )}s (attempt ${attempt + 1}/3).`
      );
      await sleep(retryDelayMs + 1000);
      return generateBatchForDifficulty(
        topic,
        requestedDifficulty,
        requestedCount,
        attempt + 1,
        provider,
        model,
        hasFallenBack
      );
    }

    const fallbackProvider = resolveFallbackProvider(provider);
    const fallbackModel = resolveFallbackModel(provider, "generation", model);

    if (isRetryable && fallbackProvider && fallbackModel && !hasFallenBack) {
      console.warn(
        `${provider} stayed rate limited for ${topic.section_key}/${topic.slug}/${requestedDifficulty}; falling back to ${fallbackProvider}/${fallbackModel}.`
      );
      return generateBatchForDifficulty(
        topic,
        requestedDifficulty,
        requestedCount,
        1,
        fallbackProvider,
        fallbackModel,
        true
      );
    }

    throw error;
  }
}

async function generateBatchForTopic(topic) {
  const generatedQuestions = [];

  for (const difficulty of DIFFICULTIES) {
    const batch = await generateBatchForDifficulty(topic, difficulty, perDifficulty);
    generatedQuestions.push(...batch);
  }

  return generatedQuestions;
}

async function reviewGeneratedQuestion(
  topic,
  question,
  attempt = 1,
  provider = reviewProvider,
  model = reviewModel,
  hasFallenBack = false
) {
  try {
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
        "main_issues",
        "suggested_difficulty",
        "editorial_note",
      ],
      additionalProperties: false,
    };
    const prompt = buildReviewPrompt(topic, question);
    const text = await requestStructuredJson({
      provider,
      model,
      systemPrompt: REVIEW_SYSTEM_PROMPT,
      userPrompt: prompt,
      schema,
      temperature: 0.2,
    });
    const parsedPayload = parseModelJson(text);

    return reviewedQuestionSchema.parse(parsedPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown review error";
    const isRetryable =
      provider === "groq"
        ? isRetryableGroqError(message)
        : isRetryableGeminiError(message);

    if (attempt < 2 && isRetryable) {
      const retryDelayMs =
        extractRetryDelayMs(message) ?? (provider === "groq" ? 12000 : 20000);
      console.warn(
        `${provider} review rate limited for ${topic.section_key}/${topic.slug}; retrying in ${Math.ceil(
          retryDelayMs / 1000
        )}s (attempt ${attempt + 1}/2).`
      );
      await sleep(retryDelayMs + 1000);
      return reviewGeneratedQuestion(topic, question, attempt + 1, provider, model, hasFallenBack);
    }

    const fallbackProvider = resolveFallbackProvider(provider);
    const fallbackModel = resolveFallbackModel(provider, "review", model);

    if (isRetryable && fallbackProvider && fallbackModel && !hasFallenBack) {
      console.warn(
        `${provider} review stayed rate limited for ${topic.section_key}/${topic.slug}; falling back to ${fallbackProvider}/${fallbackModel}.`
      );
      return reviewGeneratedQuestion(
        topic,
        question,
        1,
        fallbackProvider,
        fallbackModel,
        true
      );
    }

    throw error;
  }
}

function sanitizeQuestion(sectionKey, topic, question) {
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
    generationModel,
    generationProvider,
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

    let reviewerResult;

    try {
      reviewerResult = await reviewGeneratedQuestion(topic, {
        difficulty: normalizedQuestion.difficulty,
        passage: normalizedQuestion.passage,
        question_text: normalizedQuestion.prompt,
        choices: normalizedQuestion.choices,
        correct_answer: normalizedQuestion.correctAnswer,
        explanation: normalizedQuestion.explanation,
      });
    } catch (error) {
      reviewErrors += 1;
      skipped += 1;
      console.warn(
        `Skipping ${topic.section_key}/${topic.slug} question after reviewer failure: ${
          error instanceof Error ? error.message : "unknown reviewer error"
        }`
      );
      continue;
    }

    if (reviewerResult.verdict !== "keep" || reviewerResult.suggested_difficulty !== null) {
      skipped += 1;

      if (reviewerResult.verdict === "revise" || reviewerResult.suggested_difficulty !== null) {
        reviewRevised += 1;
      } else if (reviewerResult.verdict === "reject") {
        reviewRejected += 1;
      }

      console.warn(
        `Skipping ${topic.section_key}/${topic.slug} question after AI review: ${reviewerResult.verdict} (${[
          reviewerResult.suggested_difficulty !== null
            ? `difficulty:${reviewerResult.suggested_difficulty}`
            : null,
          ...reviewerResult.main_issues,
        ]
          .filter(Boolean)
          .join(", ")})`
      );
      continue;
    }

    reviewKept += 1;

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
        normalizedQuestion.sectionKey,
        normalizedQuestion.topicId,
        normalizedQuestion.difficulty,
        normalizedQuestion.prompt,
        normalizedQuestion.passage,
        normalizedQuestion.fingerprint,
        JSON.stringify(normalizedQuestion.choices),
        normalizedQuestion.correctAnswer,
        normalizedQuestion.explanation,
        normalizedQuestion.generationProvider,
        normalizedQuestion.generationModel,
        requestedStatus,
        `AI pre-review: keep. ${reviewerResult.editorial_note}`,
      ]
    );

    if (result.rowCount > 0) {
      knownFingerprints.add(normalizedQuestion.fingerprint);
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

async function main() {
  await client.connect();

  try {
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
      skipped: 0,
      reviewKept: 0,
      reviewRevised: 0,
      reviewRejected: 0,
      reviewErrors: 0,
      failures: [],
    };

    console.log(
      `Generating ACT inventory for ${topics.length} topic(s) with ${perDifficulty} question(s) per difficulty.`
    );

    for (const topic of topics) {
      console.log(`\nGenerating ${topic.section_key}/${topic.slug}...`);

      try {
        const generatedQuestions = await generateBatchForTopic(topic);
        const {
          inserted,
          skipped,
          reviewKept,
          reviewRevised,
          reviewRejected,
          reviewErrors,
        } = await insertQuestions(topic, generatedQuestions);
        summary.topicsProcessed += 1;
        summary.inserted += inserted;
        summary.skipped += skipped;
        summary.reviewKept += reviewKept;
        summary.reviewRevised += reviewRevised;
        summary.reviewRejected += reviewRejected;
        summary.reviewErrors += reviewErrors;

        console.log(
          `Inserted ${inserted} question(s); reviewer kept ${reviewKept}, revised ${reviewRevised}, rejected ${reviewRejected}, errored ${reviewErrors}; skipped ${skipped} total for ${topic.section_key}/${topic.slug}.`
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
