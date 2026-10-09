import pg from "pg";
import {
  MOCK_FORM_SECTION_COUNTS,
  selectBalancedIndividuals,
  selectWholeSets,
  summarizeSelection,
} from "../lib/mockTest/formAssembler.mjs";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.join("=") || "true"];
    })
);

const slug = (args.slug || "2026-12-05").trim();
const version = (args.version || "A").trim().toUpperCase();
const dryRun = args["dry-run"] === "1" || args["dry-run"] === "true";
const replaceDraft = args["replace-draft"] === "1" || args["replace-draft"] === "true";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function fail(message, details = null) {
  console.error(message);
  if (details) console.error(JSON.stringify(details, null, 2));
  process.exitCode = 1;
}

function groupBySet(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.question_set_id) continue;
    const group = groups.get(row.question_set_id) ?? {
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
    groups.set(row.question_set_id, group);
  }

  for (const group of groups.values()) {
    group.questions.sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() ||
        left.id.localeCompare(right.id)
    );
  }

  return [...groups.values()];
}

function buildSectionSelection(sectionKey, eligibleRows, completeSetIds) {
  const target = MOCK_FORM_SECTION_COUNTS[sectionKey];

  if (sectionKey === "english" || sectionKey === "math") {
    const candidates = eligibleRows
      .filter((row) => row.section_key === sectionKey && !row.question_set_id)
      .map((row) => ({
        id: row.id,
        topicName: row.topic_name,
        topicId: row.topic_id,
        correctAnswer: row.correct_answer,
        difficulty: row.difficulty,
        questionSetId: null,
        createdAt: row.created_at,
      }));

    const selected = selectBalancedIndividuals(candidates, target);
    return selected
      ? { questions: selected, setIds: [], target, available: candidates.length }
      : { questions: null, setIds: [], target, available: candidates.length };
  }

  const sectionRows = eligibleRows.filter(
    (row) =>
      row.section_key === sectionKey &&
      row.question_set_id &&
      completeSetIds.has(row.question_set_id)
  );
  const groups = groupBySet(sectionRows);
  const result = selectWholeSets(groups, target);

  return result
    ? {
        questions: result.questions,
        setIds: result.groups.map((group) => group.id),
        target,
        available: sectionRows.length,
        availableSets: groups.length,
      }
    : {
        questions: null,
        setIds: [],
        target,
        available: sectionRows.length,
        availableSets: groups.length,
      };
}

async function main() {
  const client = await pool.connect();

  try {
  await client.query("BEGIN");

  const testResult = await client.query(
    `select id, slug, test_date from mock_tests where slug = $1 for update`,
    [slug]
  );
  const mockTest = testResult.rows[0];

  if (!mockTest) {
    fail(`Mock test ${slug} was not found.`);
    await client.query("ROLLBACK");
    return;
  }

  const existingFormResult = await client.query(
    `
      select id, status, version
      from mock_test_forms
      where mock_test_id = $1 and version = $2
      for update
    `,
    [mockTest.id, version]
  );
  const existingForm = existingFormResult.rows[0];

  if (existingForm) {
    if (!replaceDraft) {
      fail(
        `Form ${version} already exists with status ${existingForm.status}. Use --replace-draft=1 only if you intentionally want to rebuild a draft.`
      );
      await client.query("ROLLBACK");
      return;
    }

    if (existingForm.status !== "draft") {
      fail(`Refusing to replace form ${version}: only draft forms can be rebuilt.`);
      await client.query("ROLLBACK");
      return;
    }

    await client.query(`delete from mock_test_forms where id = $1`, [existingForm.id]);
  }

  const rowsResult = await client.query(`
    select
      q.id,
      q.section_key,
      q.question_set_id,
      q.difficulty,
      q.correct_answer,
      q.topic_id,
      q.created_at,
      t.name as topic_name
    from questions q
    inner join act_topics t on t.id = q.topic_id
    where q.usage_scope = 'mock_reserve'
      and q.status = 'published'
      and not exists (
        select 1
        from question_exposures qe
        where qe.question_id = q.id
      )
      and not exists (
        select 1
        from mock_test_form_questions mfq
        where mfq.question_id = q.id
      )
    order by q.section_key, t.display_order, q.difficulty, q.created_at, q.id
  `);
  const eligibleRows = rowsResult.rows;

  const setIntegrityResult = await client.query(`
    select
      q.question_set_id,
      count(*) filter (
        where q.usage_scope = 'mock_reserve'
          and q.status <> 'rejected'
      )::int as reserve_child_count,
      count(*) filter (
        where q.usage_scope = 'mock_reserve'
          and q.status = 'published'
          and not exists (
            select 1 from question_exposures qe where qe.question_id = q.id
          )
          and not exists (
            select 1 from mock_test_form_questions mfq where mfq.question_id = q.id
          )
      )::int as eligible_child_count
    from questions q
    where q.question_set_id is not null
    group by q.question_set_id
  `);

  const completeSetIds = new Set(
    setIntegrityResult.rows
      .filter(
        (row) =>
          Number(row.reserve_child_count) > 0 &&
          Number(row.reserve_child_count) === Number(row.eligible_child_count)
      )
      .map((row) => row.question_set_id)
  );

  const selections = {};
  const shortages = [];

  for (const sectionKey of Object.keys(MOCK_FORM_SECTION_COUNTS)) {
    const selection = buildSectionSelection(sectionKey, eligibleRows, completeSetIds);
    selections[sectionKey] = selection;

    if (!selection.questions) {
      shortages.push({
        sectionKey,
        required: selection.target,
        eligibleQuestions: selection.available,
        eligibleCompleteSets: selection.availableSets ?? null,
      });
    }
  }

  if (shortages.length > 0) {
    console.log(
      JSON.stringify(
        {
          assembled: false,
          slug,
          version,
          reason: "insufficient_eligible_mock_reserve_inventory",
          shortages,
          eligiblePublishedReserveCount: eligibleRows.length,
        },
        null,
        2
      )
    );
    await client.query("ROLLBACK");
    process.exitCode = 2;
    return;
  }

  const ordered = [];
  for (const sectionKey of ["english", "math", "reading", "science"]) {
    const questions = selections[sectionKey].questions;
    questions.forEach((question, index) => {
      ordered.push({
        sectionKey,
        position: index + 1,
        questionId: question.id,
        correctAnswerSnapshot: question.correctAnswer,
        topicIdSnapshot: question.topicId,
        topicNameSnapshot: question.topicName,
      });
    });
  }

  const summary = Object.fromEntries(
    Object.entries(selections).map(([sectionKey, selection]) => [
      sectionKey,
      {
        count: selection.questions.length,
        setCount: selection.setIds.length,
        ...summarizeSelection(selection.questions),
      },
    ])
  );

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          assembled: true,
          dryRun: true,
          slug,
          version,
          totalQuestions: ordered.length,
          summary,
        },
        null,
        2
      )
    );
    await client.query("ROLLBACK");
    return;
  }

  const formResult = await client.query(
    `
      insert into mock_test_forms (mock_test_id, version, status)
      values ($1, $2, 'draft')
      returning id, version, status
    `,
    [mockTest.id, version]
  );
  const form = formResult.rows[0];

  for (const assignment of ordered) {
    await client.query(
      `
        insert into mock_test_form_questions
          (form_id, question_id, section_key, position, correct_answer_snapshot, topic_id_snapshot, topic_name_snapshot)
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        form.id,
        assignment.questionId,
        assignment.sectionKey,
        assignment.position,
        assignment.correctAnswerSnapshot,
        assignment.topicIdSnapshot,
        assignment.topicNameSnapshot,
      ]
    );
  }

  await client.query("COMMIT");

  console.log(
    JSON.stringify(
      {
        assembled: true,
        dryRun: false,
        formId: form.id,
        slug,
        version,
        status: form.status,
        totalQuestions: ordered.length,
        summary,
      },
      null,
      2
    )
  );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
