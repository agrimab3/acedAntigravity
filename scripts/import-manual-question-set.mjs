import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { z } from "zod";
import { reviewQuestionQuality } from "../lib/question-utils.ts";

const { Client } = pg;
const ANSWERS = ["A", "B", "C", "D"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const SET_KIND_BY_SECTION = {
  reading: "reading_passage",
  science: "science_stimulus",
};

const choiceSchema = z.object({
  A: z.string().trim().min(1),
  B: z.string().trim().min(1),
  C: z.string().trim().min(1),
  D: z.string().trim().min(1),
}).strict();

const questionSchema = z.object({
  section: z.enum(["reading", "science"]),
  topic: z.string().trim().min(1),
  difficulty: z.enum(DIFFICULTIES),
  question_text: z.string().trim().min(20),
  choices: choiceSchema,
  correct_answer: z.enum(ANSWERS),
  explanation: z.string().trim().min(20),
}).strict();

const setSchema = z.object({
  set_title: z.string().trim().min(1).max(180),
  shared_stimulus: z.string().trim().min(120),
  questions: z.array(questionSchema).min(3).max(12),
}).strict().superRefine((value, ctx) => {
  const sections = new Set(value.questions.map((question) => question.section));
  const topics = new Set(value.questions.map((question) => question.topic.toLowerCase()));
  const prompts = value.questions.map((question) => normalizeText(question.question_text));

  if (sections.size !== 1) {
    ctx.addIssue({ code: "custom", message: "All child questions must use the same section." });
  }
  if (topics.size !== 1) {
    ctx.addIssue({ code: "custom", message: "All child questions must use the same topic." });
  }
  if (new Set(prompts).size !== prompts.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate child question stems are not allowed." });
  }
});

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function buildFingerprint({ sectionKey, topicSlug, difficulty, passage, prompt, choices }) {
  const canonicalChoices = ANSWERS.map((choice) => `${choice}:${normalizeText(choices[choice])}`).join("|");
  return createHash("sha256")
    .update([
      sectionKey,
      topicSlug,
      difficulty,
      normalizeText(passage || ""),
      normalizeText(prompt),
      canonicalChoices,
    ].join("||"))
    .digest("hex");
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const file = argv.find((arg) => !arg.startsWith("--"));
  return {
    file,
    dryRun: flags.has("--dry-run"),
  };
}

function summarizeQuality(review) {
  return {
    findings: review.findings,
    blockingFlags: review.blockingFlags,
    warningFlags: review.warningFlags,
    riskScore: review.riskScore,
  };
}

const { file, dryRun } = parseArgs(process.argv.slice(2));

if (!file) {
  throw new Error("Usage: node --env-file=.env scripts/import-manual-question-set.mjs <set.json> [--dry-run]");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const raw = JSON.parse(await readFile(file, "utf8"));
const parsed = setSchema.safeParse(raw);

if (!parsed.success) {
  console.error(JSON.stringify({ ok: false, stage: "schema", issues: parsed.error.issues }, null, 2));
  process.exitCode = 1;
} else {
  const input = parsed.data;
  const sectionKey = input.questions[0].section;
  const topicSlug = input.questions[0].topic.trim().toLowerCase();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const topicResult = await client.query(
      `SELECT id, section_key, slug, name
       FROM act_topics
       WHERE is_active = true
         AND section_key = $1
         AND (lower(slug) = $2 OR lower(name) = $2)
       LIMIT 1`,
      [sectionKey, topicSlug]
    );

    if (topicResult.rowCount !== 1) {
      throw new Error(`No active Aced topic matched ${sectionKey}/${topicSlug}.`);
    }

    const topic = topicResult.rows[0];
    const reviewed = input.questions.map((question, index) => {
      const qualityReview = reviewQuestionQuality({
        id: `manual-${index + 1}`,
        section: sectionKey,
        topic: topic.name,
        difficulty: question.difficulty,
        passage: input.shared_stimulus,
        question_text: question.question_text,
        choices: question.choices,
        correct_answer: question.correct_answer,
        explanation: question.explanation,
      });

      const fingerprint = buildFingerprint({
        sectionKey,
        topicSlug: topic.slug,
        difficulty: question.difficulty,
        passage: input.shared_stimulus,
        prompt: question.question_text,
        choices: question.choices,
      });

      return {
        ...question,
        fingerprint,
        qualityReview,
      };
    });

    const qualityFailures = reviewed
      .map((question, index) => ({
        question: index + 1,
        blockingFlags: question.qualityReview.blockingFlags,
        warningFlags: question.qualityReview.warningFlags,
      }))
      .filter((result) => result.blockingFlags.length > 0 || result.warningFlags.length > 0);

    if (qualityFailures.length > 0) {
      console.error(JSON.stringify({
        ok: false,
        stage: "deterministic-quality",
        message: "Manual import requires zero deterministic blocking flags and zero warnings.",
        questions: qualityFailures,
      }, null, 2));
      process.exitCode = 1;
    } else {
      const fingerprintResult = await client.query(
        "SELECT fingerprint FROM questions WHERE fingerprint = ANY($1::text[])",
        [reviewed.map((question) => question.fingerprint)]
      );

      if (fingerprintResult.rowCount > 0) {
        console.error(JSON.stringify({
          ok: false,
          stage: "duplicates",
          message: "Import is atomic; no set was stored because at least one child already exists.",
          fingerprints: fingerprintResult.rows.map((row) => row.fingerprint),
        }, null, 2));
        process.exitCode = 1;
      } else if (dryRun) {
        console.log(JSON.stringify({
          ok: true,
          dryRun: true,
          section: sectionKey,
          topic: topic.slug,
          setTitle: input.set_title,
          questionCount: reviewed.length,
          difficulties: reviewed.reduce((acc, question) => {
            acc[question.difficulty] = (acc[question.difficulty] || 0) + 1;
            return acc;
          }, {}),
          quality: reviewed.map((question, index) => ({
            question: index + 1,
            ...summarizeQuality(question.qualityReview),
          })),
        }, null, 2));
      } else {
        const runId = randomUUID();
        await client.query("BEGIN");
        try {
          const setResult = await client.query(
            `INSERT INTO question_sets
              (section_key, topic_id, kind, title, content, metadata)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)
             RETURNING id`,
            [
              sectionKey,
              topic.id,
              SET_KIND_BY_SECTION[sectionKey],
              input.set_title,
              input.shared_stimulus,
              JSON.stringify({
                source: "manual_claude",
                importedBy: "manual-import-script",
                deterministicQuality: "clean",
                humanReviewRequired: true,
              }),
            ]
          );

          const questionSetId = setResult.rows[0].id;
          const insertedIds = [];

          for (let index = 0; index < reviewed.length; index += 1) {
            const question = reviewed[index];
            const insertResult = await client.query(
              `INSERT INTO questions
                (section_key, topic_id, question_set_id, difficulty, question_type,
                 prompt, passage, fingerprint, choices, correct_answer, explanation,
                 source, generation_model, status, review_notes)
               VALUES ($1, $2, $3, $4, 'multiple_choice', $5, NULL, $6, $7::jsonb,
                       $8, $9, $10, $11, 'draft', $12)
               RETURNING id`,
              [
                sectionKey,
                topic.id,
                questionSetId,
                question.difficulty,
                question.question_text,
                question.fingerprint,
                JSON.stringify(question.choices),
                question.correct_answer,
                question.explanation,
                "manual_claude",
                "claude-pro-manual",
                "[manual-import] Deterministic checks clean. Human review required before publishing.",
              ]
            );
            insertedIds.push(insertResult.rows[0].id);

            await client.query(
              `INSERT INTO question_generation_audits
                (run_id, candidate_id, section_key, topic_id, topic_name,
                 requested_difficulty, generated_difficulty, passage, prompt, choices,
                 correct_answer, explanation, generation_provider, generation_model,
                 deterministic_findings, blocking_flags, warning_flags,
                 final_disposition, final_reason)
               VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9::jsonb, $10, $11,
                       'manual', 'claude-pro-manual', $12::jsonb, $13::jsonb, $14::jsonb,
                       'stored_draft', $15)`,
              [
                runId,
                randomUUID(),
                sectionKey,
                topic.id,
                topic.name,
                question.difficulty,
                input.shared_stimulus,
                question.question_text,
                JSON.stringify(question.choices),
                question.correct_answer,
                question.explanation,
                JSON.stringify(question.qualityReview.findings),
                JSON.stringify(question.qualityReview.blockingFlags),
                JSON.stringify(question.qualityReview.warningFlags),
                "Manual Claude-authored import; deterministic checks clean; human review still required.",
              ]
            );
          }

          await client.query("COMMIT");
          console.log(JSON.stringify({
            ok: true,
            dryRun: false,
            runId,
            questionSetId,
            insertedQuestionIds: insertedIds,
            status: "draft",
            source: "manual_claude",
            section: sectionKey,
            topic: topic.slug,
            questionCount: insertedIds.length,
          }, null, 2));
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    }
  } finally {
    await client.end();
  }
}
