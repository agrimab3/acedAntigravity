import crypto from "node:crypto";
import pg from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";
import {
  selectBalancedIndividuals,
  selectWholeSets,
  summarizeSelection,
} from "../lib/mockTest/formAssembler.mjs";

const { Pool } = pg;
throw new Error("Dec 5 Form A is reviewed and frozen. Use scripts/dec5-reviewed-form.mjs import with the committed reviewed JSON; never assemble a new Dec 5 form.");
const SLUG = "2026-12-05";
const VERSION = "A";
const COUNTS = { english: 50, math: 45, reading: 36, science: 40 };
const READING_EXPANSION_SET = "f5ced560-537b-45bc-82d7-fad797081cc8";
const READING_FINGERPRINT = crypto
  .createHash("sha256")
  .update("aced-dec5-reading-varrow-persistence-origin-v1")
  .digest("hex");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const apply = process.argv.includes("--apply");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function qualityClean(row) {
  const review = reviewQuestionQuality({
    id: row.id,
    section: row.section_key,
    topic: row.topic_name,
    difficulty: row.difficulty,
    passage: row.passage || row.question_set_content,
    question_text: row.prompt,
    choices: row.choices,
    correct_answer: row.correct_answer,
    explanation: row.explanation,
  });
  return (
    review.shouldServe &&
    review.blockingFlags.length === 0 &&
    review.warningFlags.length === 0
  );
}

function groupSets(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.question_set_id) continue;
    const group = map.get(row.question_set_id) ?? {
      id: row.question_set_id,
      sectionKey: row.section_key,
      questions: [],
    };
    group.questions.push({
      id: row.id,
      topicName: row.topic_name,
      topicId: row.topic_id,
      correctAnswer: row.correct_answer,
      difficulty: row.difficulty,
      questionSetId: row.question_set_id,
      createdAt: row.created_at,
    });
    map.set(row.question_set_id, group);
  }
  return [...map.values()];
}

async function ensureReadingExpansion(client) {
  const existing = await client.query(
    "select id from questions where fingerprint=$1 limit 1",
    [READING_FINGERPRINT]
  );
  if (existing.rowCount) return existing.rows[0].id;

  const set = (
    await client.query(
      `select qs.id,qs.topic_id
       from question_sets qs
       where qs.id=$1 and qs.section_key='reading'`,
      [READING_EXPANSION_SET]
    )
  ).rows[0];
  if (!set) throw new Error("Expected Varrow Valley Reading set is missing.");

  const prompt =
    "The distinction the author makes between how an arrangement began and why it persisted primarily serves to:";
  const choices = {
    A: "explain how the market schedule could have been preserved for its trading benefits even if trade did not originally create it.",
    B: "prove that the religious explanation for the market schedule is false.",
    C: "show that the ironmongers' account books record the first creation of the schedule.",
    D: "argue that useful social arrangements are usually designed intentionally from the start.",
  };
  const explanation =
    "The final two paragraphs distinguish a practice's origin from the forces that keep it alive. The author says a schedule could have begun for religious reasons yet persisted because it suited traveling traders. Choice A captures that distinction. The passage does not disprove the religious explanation, the account books come from long after the schedule began, and the author explicitly warns against assuming that usefulness proves intentional design.";

  const inserted = await client.query(
    `insert into questions
      (section_key,topic_id,question_set_id,difficulty,question_type,prompt,passage,
       fingerprint,choices,correct_answer,explanation,source,generation_model,usage_scope,status)
     values('reading',$1,$2,'medium','multiple_choice',$3,null,$4,$5::jsonb,'A',$6,
       'manual_prelaunch','manual','practice','published')
     returning id`,
    [
      set.topic_id,
      set.id,
      prompt,
      READING_FINGERPRINT,
      JSON.stringify(choices),
      explanation,
    ]
  );
  return inserted.rows[0].id;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const test = (
      await client.query(
        "select id,status from mock_tests where slug=$1 for update",
        [SLUG]
      )
    ).rows[0];
    if (!test) throw new Error("Dec 5 mock test is missing.");
    if (test.status === "released") {
      throw new Error(
        "Refusing to build the real form while the mock test is released."
      );
    }

    const existing = (
      await client.query(
        `select id,status
         from mock_test_forms
         where mock_test_id=$1 and version=$2`,
        [test.id, VERSION]
      )
    ).rows[0];
    if (existing) {
      throw new Error(
        `Form ${VERSION} already exists with status ${existing.status}; refusing to replace it.`
      );
    }

    await client.query(
      `delete from questions
       where source='mock-dev-rehearsal'
         and not exists (
           select 1 from mock_test_form_questions mfq
           where mfq.question_id=questions.id
         )`
    );
    await client.query(
      `delete from question_sets
       where metadata->>'fixture'='mock-dev-rehearsal'
         and not exists (
           select 1 from questions q where q.question_set_id=question_sets.id
         )`
    );

    const addedReadingId = await ensureReadingExpansion(client);
    const rows = (
      await client.query(`
        select q.id,q.section_key,q.question_set_id,q.difficulty,q.correct_answer,
               q.topic_id,q.created_at,q.prompt,q.passage,q.choices,q.explanation,
               t.name topic_name,qs.content question_set_content
        from questions q
        join act_topics t on t.id=q.topic_id
        left join question_sets qs on qs.id=q.question_set_id
        where q.status='published'
          and q.usage_scope='practice'
          and q.source<>'mock-dev-rehearsal'
          and not exists (
            select 1 from question_exposures qe where qe.question_id=q.id
          )
        order by q.section_key,t.display_order,q.difficulty,q.created_at,q.id
      `)
    ).rows.filter(qualityClean);

    const selections = {};
    for (const section of ["english", "math"]) {
      const candidates = rows
        .filter((row) => row.section_key === section && !row.question_set_id)
        .map((row) => ({
          id: row.id,
          topicName: row.topic_name,
          topicId: row.topic_id,
          correctAnswer: row.correct_answer,
          difficulty: row.difficulty,
          questionSetId: null,
          createdAt: row.created_at,
        }));
      const picked = selectBalancedIndividuals(candidates, COUNTS[section]);
      if (!picked) throw new Error(`Not enough clean ${section} questions.`);
      selections[section] = picked;
    }

    for (const section of ["reading", "science"]) {
      const groups = groupSets(
        rows.filter((row) => row.section_key === section)
      );
      const picked = selectWholeSets(groups, COUNTS[section]);
      if (!picked) {
        throw new Error(
          `Cannot make an exact ${COUNTS[section]}-question ${section} section from complete clean sets.`
        );
      }
      selections[section] = picked.questions;
    }

    if (!selections.reading.some((question) => question.id === addedReadingId)) {
      throw new Error(
        "The required sixth Varrow Valley question was not selected."
      );
    }

    const selected = Object.values(selections).flat();
    if (selected.length !== 171 || new Set(selected.map((q) => q.id)).size !== 171) {
      throw new Error("Form selection must contain 171 unique questions.");
    }

    const summary = Object.fromEntries(
      Object.entries(selections).map(([key, value]) => [
        key,
        { count: value.length, ...summarizeSelection(value) },
      ])
    );

    if (!apply) {
      console.log(
        JSON.stringify(
          {
            apply: false,
            total: selected.length,
            summary,
            readingExpansionQuestionId: addedReadingId,
          },
          null,
          2
        )
      );
      await client.query("rollback");
      return;
    }

    await client.query(
      "update questions set usage_scope='mock_reserve',updated_at=now() where id=any($1::uuid[])",
      [selected.map((q) => q.id)]
    );

    const form = (
      await client.query(
        `insert into mock_test_forms(mock_test_id,version,status)
         values($1,$2,'draft') returning id`,
        [test.id, VERSION]
      )
    ).rows[0];

    for (const section of ["english", "math", "reading", "science"]) {
      for (let index = 0; index < selections[section].length; index += 1) {
        const question = selections[section][index];
        await client.query(
          `insert into mock_test_form_questions
            (form_id,question_id,section_key,position,correct_answer_snapshot,
             topic_id_snapshot,topic_name_snapshot)
           values($1,$2,$3,$4,$5,$6,$7)`,
          [
            form.id,
            question.id,
            section,
            index + 1,
            question.correctAnswer,
            question.topicId,
            question.topicName,
          ]
        );
      }
    }

    await client.query(
      `update mock_test_forms
       set status='locked',reviewed_at=now(),locked_at=now(),updated_at=now()
       where id=$1`,
      [form.id]
    );
    await client.query("commit");
    console.log(
      JSON.stringify(
        {
          apply: true,
          formId: form.id,
          total: selected.length,
          summary,
          readingExpansionQuestionId: addedReadingId,
        },
        null,
        2
      )
    );
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

await main();
await pool.end();
