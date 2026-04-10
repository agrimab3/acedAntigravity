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
You are Aced's ACT item writer and quality gate.

Your job is to generate original, ACT-authentic multiple-choice questions that could survive editorial review for correctness, difficulty accuracy, topic fidelity, and distractor quality.

You must behave like both:
1. a professional ACT-style item writer, and
2. a strict reviewer who rejects weak items before outputting them.

Non-negotiable requirements:
- Output valid JSON only.
- No markdown.
- No commentary outside the JSON schema.
- Use plain text only. No LaTeX.
- Each item must have exactly 4 choices: A, B, C, D.
- Exactly one choice must be correct.
- The explanation must match the keyed correct answer exactly.
- Never output an item if two answer choices could both reasonably be defended.
- Never output an item if the explanation relies on approximation, "closest," or vague wording unless the question explicitly asks for an approximate value.
- Never output an item that is mislabeled in difficulty.
- Never output an item that matches the requested topic only loosely.

Before finalizing each item, internally verify all of the following:
- ACT authenticity: Would this feel plausible on a real ACT-style test?
- Topic fidelity: Does it truly test the requested topic, not a neighboring one?
- Difficulty accuracy: Does easy/medium/hard match the actual reasoning load?
- Single-best-answer integrity: Is exactly one option unambiguously correct?
- Distractor quality: Are wrong answers plausible but clearly wrong?
- Explanation integrity: Does the explanation justify the correct answer and identify why key distractor(s) fail?
- Batch diversity: Is this item meaningfully different from the others in setup, tested skill, wording, and answer pattern?

If any check fails, silently revise or regenerate the item before output.

Important writing principle:
Do not generate questions that are merely technically answerable. Generate questions that feel intentionally designed, authentic, and editorially publishable.

Difficulty standards:
- Easy: official ACT warm-up difficulty; still credible, still skill-based, never childish or giveaway.
- Medium: standard ACT difficulty; requires some reasoning, discrimination, or context use beyond direct recall.
- Hard: upper-range ACT; requires tighter reasoning, stronger distractor filtering, or a meaningful second step. Hard must not be a dressed-up easy item.

Automatic rejection rules:
- Reject and regenerate any item with any of these problems:
  - one-step plug-in or direct recall disguised as medium/hard
  - generic reading question with a passage that merely states the answer
  - English item with two grammatically plausible revisions
  - literary narrative topic using expository or informational writing
  - science item that is just a vocabulary check rather than data or reasoning
  - math item with all-numeric choices and a tiny stem that reads like a worksheet drill
  - explanation that contradicts the keyed answer
  - answer choices that are equivalent in meaning or value
  - passage-topic mismatch
  - difficulty inflation

Write with the restraint and precision of a test-prep editor, not a content farm.
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

function isRetryableGeminiError(message) {
  return /quota exceeded|retry in|429/i.test(message);
}

function isRetryableGroqError(message) {
  return /rate limit|rate_limit|too many requests|429|capacity_exceeded|498/i.test(message);
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
    case "english":
      return [
        "Every English item must be revision-in-context, not an isolated grammar quiz.",
        "Include a short passage or excerpt in the passage field.",
        "Mark the exact revisable text with [underline]...[/underline].",
        "The question must ask for the best revision, placement, transition, wording, or structural improvement in context.",
        "Medium and hard English items must create a real editorial decision, not just spot-the-error trivia.",
        "Exactly one answer must be clearly best in context.",
        "Reject any item where two choices are both grammatically acceptable unless only one clearly fits the rhetorical goal.",
        "Test the interaction of grammar, clarity, logic, tone, cohesion, and sentence flow the way ACT English does.",
        "Keep answer choices parallel in form whenever possible.",
      ].join("\n");
    case "math":
      return [
        "Write ACT Math items, not classroom drills.",
        "Use plain text math. Do not use LaTeX.",
        "Medium and hard math items must usually require at least 2 reasoning moves, or one non-obvious setup plus execution.",
        "Do not write medium or hard items that are just direct substitution, direct formula recall, simple angle-sum, direct evaluation of a function at one point, routine exponent solving, or immediate nth-term plug-ins.",
        "Prefer setups involving interpretation, structure, constraints, modeling, comparison, or multi-step reasoning.",
        "If the item can be solved almost instantly by pattern recognition alone, it is not medium or hard.",
        "Avoid tiny stems with four numeric answers unless the reasoning burden is genuinely ACT-level.",
        "Use a brief setup when needed to make the problem feel test-authentic.",
        "Set passage to null unless a brief word-problem setup is necessary.",
      ].join("\n");
    case "reading":
      return [
        "Every Reading item must include a passage that genuinely supports inference, tone, meaning, organization, or evidence-based interpretation.",
        "The passage must not simply state the answer in nearly identical wording.",
        "Medium and hard reading questions must require real discrimination, not basic paraphrase matching.",
        "Literary Narrative must use narrative prose with a speaker or character, scene, action, memory, mood, or interpersonal tension.",
        "Social Science must feel like a social-science excerpt, not a dictionary entry.",
        "Humanities must feel interpretive, cultural, historical, artistic, or philosophical.",
        "Natural Science must feel explanatory and scientific, but still passage-based rather than trivia-based.",
        "Do not use expository textbook blurbs for Literary Narrative.",
        "Do not ask generic main-idea questions unless the passage has enough texture to support real inference.",
      ].join("\n");
    case "science":
      return [
        "Every Science item must include an ACT-style setup: experiment summary, data summary, or conflicting viewpoints.",
        "The question must test interpretation, comparison, inference, variable relationships, or conclusion strength.",
        "Avoid pure vocabulary checks and pure common-sense questions.",
        "Hard science items should require comparing conditions, tracing a variable change, or ruling out a tempting but unsupported conclusion.",
        "Use concise but information-rich setups.",
        "If a student can answer without using the setup, reject the item.",
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
      "Focus on commas, semicolons, colons, dashes, apostrophes, and punctuation-driven sentence meaning.",
      "Use ACT-style sentence revision prompts rather than generic grammar trivia.",
      "Mark the revisable text with [underline]...[/underline] in the passage when the prompt refers to the underlined portion.",
    ],
    "english:grammar-and-usage": [
      "Focus on subject-verb agreement, pronoun agreement, verb tense, modifier placement, idiomatic usage, and sentence clarity in context.",
      "Every item must be a revision item with [underline] tags in the passage.",
      "Make the wrong choices realistic and grammatically tempting when possible.",
      "Do not create choices that are obviously wrong by surface inspection alone.",
      "If more than one answer is acceptable English, reject and rewrite the item.",
      "Do not drift into geometry, history, or general knowledge contexts that overshadow the grammar skill.",
    ],
    "english:sentence-structure": [
      "Focus on clause relationships, fragments, run-ons, parallel structure, and logical sentence combination.",
      "Keep the student's job centered on fixing structure, not only punctuation.",
      "Use passage-based choices that revise the underlined sentence or clause instead of asking students to label sentence parts.",
      "Always mark the exact clause or sentence to revise with [underline]...[/underline] in the passage.",
      "Avoid answer sets where more than one option would be grammatically acceptable; there must be one clearly best structural revision.",
    ],
    "math:number-and-quantity": [
      "Focus on integers, rational and irrational numbers, ratios, units, magnitude, exponents, and numeric properties.",
      "Do not substitute pure geometry questions here.",
    ],
    "math:algebra": [
      "Focus on solving equations, expressions, inequalities, linear relationships, and algebraic manipulation.",
      "Do not generate geometry-only questions about circles, triangles, or angle sums unless algebra is central to solving.",
    ],
    "math:functions": [
      "Focus on interpreting, combining, comparing, transforming, or reasoning about functions.",
      "Avoid direct one-step evaluation such as what is g(-2).",
      "Avoid simple composition plug-ins unless the setup adds genuine reasoning.",
      "Medium and hard items should involve structure, comparison, constraints, meaning of outputs, or multi-step interpretation.",
    ],
    "math:geometry": [
      "Focus on coordinate geometry, area, perimeter, volume, angles, triangles, circles, and geometric reasoning.",
      "Avoid simple area, perimeter, angle-sum, or radius-from-diameter recall as medium or hard.",
      "Prefer coordinate reasoning, geometric relationships, similar figures, composite figures, transformations, or multi-step constraints.",
      "Do not publish any geometry item whose solution is a single formula substitution unless labeled easy and still ACT-authentic.",
    ],
    "math:statistics-and-probability": [
      "Focus on averages, distributions, percent, counting, probability, and interpreting summary statistics or data tables.",
      "Do not generate pure algebra drills here.",
    ],
    "math:integrating-essential-skills": [
      "Mix algebra, arithmetic, proportional reasoning, data interpretation, and multi-step applied problem solving.",
      "These should feel like ACT integrated word problems rather than a single isolated skill drill.",
    ],
    "math:modeling": [
      "The central task must be choosing, building, or interpreting the model.",
      "The setup should require translating a verbal scenario into an equation, function, inequality, table, or rate relationship.",
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
      "Use a short scene, reflection, or memory with a narrator or character.",
      "Include concrete details, voice, and emotional texture.",
      "Questions should test tone, implication, character motivation, effect of a detail, narrative perspective, or relationship dynamics.",
      "Do not use informational or scientific exposition.",
      "Do not let the passage define a concept and then ask for that concept.",
    ],
    "reading:social-science": [
      "Use a passage about social behavior, institutions, policy, culture, economics, education, or civic life.",
      "Questions should test argument, implication, evidence, framing, or interpretation of social patterns.",
      "Do not write encyclopedia-style definitions followed by direct paraphrase questions.",
      "Make the passage explicitly social-science in content, using recognizable themes like public policy, communities, voting, labor, markets, behavior, culture, or historical change.",
    ],
    "reading:humanities": [
      "Use a nonfiction passage about art, music, literature, philosophy, architecture, or cultural criticism.",
      "Questions should focus on interpretation, author attitude, or the role of specific details in the argument.",
    ],
    "reading:natural-science": [
      "Use a popular-science reading passage about biology, chemistry, physics, Earth science, or astronomy.",
      "Keep it as ACT Reading, not ACT Science: focus on understanding what the author says, not computing data.",
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

function buildPrompt({ sectionKey, topicName, slug }) {
  return `
Generate ${perDifficulty * DIFFICULTIES.length} original ACT-style multiple-choice questions.

Section: ${sectionKey}
Topic: ${topicName}

Required difficulty distribution:
- easy: ${perDifficulty}
- medium: ${perDifficulty}
- hard: ${perDifficulty}

Output requirements:
- Return JSON only, matching the required schema exactly.
- Each question must be original within this batch.
- Each question must have exactly 4 choices: A, B, C, D.
- Exactly one answer must be correct.
- Use plain text only.
- No markdown.
- No LaTeX.
- No duplicate stems, recycled setups, repeated choice patterns, or repeated explanation wording.
- Do not include any item that feels weak, generic, or editorially questionable.

Editorial quality bar:
Every item must feel like it could be published on a serious ACT prep product without manual rescue.
If an item feels too direct, too short, too classroom-like, too generic, too obvious, or too arguable, do not output it.

Batch diversity requirements:
- Vary skill subtype within the topic.
- Vary stem structure.
- Vary distractor logic.
- Vary answer-position distribution across A, B, C, and D.
- Avoid repeated numeric patterns, repeated story setups, and repeated passage cadence.

Hard constraints:
- Do not create any item where the explanation and keyed answer disagree.
- Do not create any item where more than one answer could be defended.
- Do not create any item where the correct answer is obtained by a single obvious pattern if the label is medium or hard.
- Do not create any item that tests only terminology or trivia.
- Do not create any item whose passage simply hands the answer to the student.

Section-specific rules:
${getSectionSpecificInstructions(sectionKey)}

Topic-specific rules:
${getTopicSpecificInstructions(sectionKey, slug)}

Final internal quality gate before output:
For each item, confirm internally:
1. exact topic match
2. exact difficulty match
3. one unambiguous correct answer
4. strong distractors
5. explanation consistent with answer key
6. ACT-authentic style
If any item fails, regenerate it before returning the batch.

Do not fill the batch mechanically.
It is better to output fewer items than to output weak, broken, generic, or mislabeled items.
If necessary, spend more effort making each item editorially sound before returning the JSON.
`.trim();
}

function buildQuestionBatchSchema(sectionKey) {
  const passageSchema =
    sectionKey === "reading" || sectionKey === "science"
      ? { type: "string" }
      : { type: ["string", "null"] };

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
            passage: passageSchema,
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

async function generateBatchForTopic(topic, attempt = 1) {
  try {
    const text =
      generationProvider === "groq"
        ? await generateGroqBatchText(topic)
        : await generateGeminiBatchText(topic);

    return generatedBatchSchema.parse(JSON.parse(text)).questions;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown generation error";

    const isRetryable =
      generationProvider === "groq"
        ? isRetryableGroqError(message)
        : isRetryableGeminiError(message);

    if (attempt < 5 && isRetryable) {
      const retryDelayMs =
        extractRetryDelayMs(message) ?? (generationProvider === "groq" ? 20000 : 35000);
      console.warn(
        `${generationProvider} rate limited for ${topic.section_key}/${topic.slug}; retrying in ${Math.ceil(
          retryDelayMs / 1000
        )}s (attempt ${attempt + 1}/5).`
      );
      await sleep(retryDelayMs + 1000);
      return generateBatchForTopic(topic, attempt + 1);
    }

    throw error;
  }
}

async function generateGeminiBatchText(topic) {
  const response = await fetch(`${resolveGeminiBaseUrl()}/models/${generationModel}:generateContent`, {
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
              GENERATION_SYSTEM_PROMPT,
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildPrompt({
                sectionKey: topic.section_key,
                topicName: topic.name,
                slug: topic.slug,
              }),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseJsonSchema: buildQuestionBatchSchema(topic.section_key),
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

  return text;
}

async function generateGroqBatchText(topic) {
  const prompt = buildPrompt({
    sectionKey: topic.section_key,
    topicName: topic.name,
    slug: topic.slug,
  });
  const groqSupportsJsonSchema = supportsGroqJsonSchema(generationModel);
  const schema = buildQuestionBatchSchema(topic.section_key);
  const response = await fetch(`${resolveGroqBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model: generationModel,
      temperature: 0.7,
      max_completion_tokens: 4096,
      messages: [
        {
          role: "system",
          content:
            groqSupportsJsonSchema
              ? GENERATION_SYSTEM_PROMPT
              : `${GENERATION_SYSTEM_PROMPT}\n\nReturn one valid JSON object only, with no markdown or commentary, matching this schema exactly: ${JSON.stringify(
                  schema
                )}`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: groqSupportsJsonSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: `act_${topic.section_key}_${topic.slug}_batch`,
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
    throw new Error(`Groq generation failed: ${message}`);
  }

  const text = payload?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    throw new Error("Groq returned an empty generation response.");
  }

  return text;
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
    correct_answer: question.correctAnswer,
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
    correctAnswer: question.correctAnswer,
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
          generation_model,
          status
        )
        VALUES ($1, $2, $3, 'multiple_choice', $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)
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
      provider: generationProvider,
      model: generationModel,
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
