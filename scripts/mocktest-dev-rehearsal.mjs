import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const SOURCE = "mock-dev-rehearsal";
const FORM_VERSION = "DEV";
const USER_EMAIL = "local-test-user@aced.local";
const MOCK_SLUG = "2026-12-05";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const url = new URL(process.env.DATABASE_URL);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (process.env.NODE_ENV === "production" || !localHosts.has(url.hostname)) {
  throw new Error("Refusing to create DEV mock rehearsal data outside a local development database.");
}

const cleanupOnly = process.argv.includes("--cleanup");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function disableLockTriggers(client) {
  await client.query('alter table mock_test_form_questions disable trigger protect_locked_mock_test_form_questions_trigger');
  await client.query('alter table mock_test_forms disable trigger protect_locked_mock_test_form_trigger');
}

async function enableLockTriggers(client) {
  await client.query('alter table mock_test_form_questions enable trigger protect_locked_mock_test_form_questions_trigger');
  await client.query('alter table mock_test_forms enable trigger protect_locked_mock_test_form_trigger');
}

async function cleanup(client, mockTestId, userId) {
  const forms = await client.query(
    "select id from mock_test_forms where mock_test_id=$1 and version=$2",
    [mockTestId, FORM_VERSION]
  );
  const formIds = forms.rows.map((row) => row.id);

  if (formIds.length) {
    await client.query("delete from mock_test_sessions where form_id = any($1::uuid[])", [formIds]);
    await disableLockTriggers(client);
    try {
      await client.query("delete from mock_test_forms where id = any($1::uuid[])", [formIds]);
    } finally {
      await enableLockTriggers(client);
    }
  }

  await client.query("delete from questions where source=$1", [SOURCE]);
  await client.query("delete from question_sets where metadata->>'fixture'=$1", [SOURCE]);

  const registration = await client.query(
    "select id from mock_registrations where mock_test_id=$1 and user_id=$2",
    [mockTestId, userId]
  );
  if (registration.rows[0]) {
    await client.query(
      `delete from mock_test_sessions where registration_id=$1`,
      [registration.rows[0].id]
    );
    await client.query(
      `update mock_registrations
       set started_at=null, finished_at=null, english_score=null, math_score=null,
           reading_score=null, science_score=null, composite=null, percentile=null, updated_at=now()
       where id=$1`,
      [registration.rows[0].id]
    );
  }
}

function fingerprint(parts) {
  return crypto.createHash("sha256").update(parts.join(":")).digest("hex");
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const mock = (await client.query(
      "select id from mock_tests where slug=$1",
      [MOCK_SLUG]
    )).rows[0];
    const user = (await client.query(
      "select id,email from users where lower(email)=lower($1)",
      [USER_EMAIL]
    )).rows[0];

    if (!mock) throw new Error(`Mock test ${MOCK_SLUG} not found.`);
    if (!user) throw new Error(`Local test user ${USER_EMAIL} not found.`);

    await cleanup(client, mock.id, user.id);

    if (cleanupOnly) {
      await client.query("commit");
      console.log("DEV mock rehearsal fixture removed.");
      return;
    }

    const topicRows = (await client.query(
      `select id,section_key,name from act_topics where is_active=true
       order by section_key,display_order`
    )).rows;
    const topics = new Map();
    for (const row of topicRows) {
      const list = topics.get(row.section_key) ?? [];
      list.push(row);
      topics.set(row.section_key, list);
    }

    for (const section of ["english","math","reading","science"]) {
      if (!(topics.get(section)?.length)) throw new Error(`No active topics for ${section}.`);
    }

    const registrationResult = await client.query(
      `insert into mock_registrations
        (mock_test_id,user_id,time_zone,agreed_no_refund_at,paid_at,hold_expires_at,updated_at)
       values($1,$2,'America/Los_Angeles',now(),now(),null,now())
       on conflict (mock_test_id,user_id)
       do update set paid_at=coalesce(mock_registrations.paid_at,excluded.paid_at),
         hold_expires_at=null, started_at=null, finished_at=null,
         english_score=null, math_score=null, reading_score=null, science_score=null,
         composite=null, percentile=null, updated_at=now()
       returning id`,
      [mock.id, user.id]
    );
    const registrationId = registrationResult.rows[0].id;

    const form = (await client.query(
      `insert into mock_test_forms(mock_test_id,version,status)
       values($1,$2,'draft') returning id`,
      [mock.id, FORM_VERSION]
    )).rows[0];

    let questionSerial = 0;
    const assignmentCounts = { english: 0, math: 0, reading: 0, science: 0 };

    async function insertQuestion({ section, topic, setId = null, position }) {
      questionSerial += 1;
      const correct = ["A","B","C","D"][(questionSerial - 1) % 4];
      const prompt = `DEV rehearsal · ${section.toUpperCase()} question ${position}. Choose the option labeled ${correct}.`;
      const choices = {
        A: "Option A",
        B: "Option B",
        C: "Option C",
        D: "Option D",
      };
      const q = (await client.query(
        `insert into questions
          (section_key,topic_id,question_set_id,difficulty,question_type,prompt,passage,
           fingerprint,choices,correct_answer,explanation,source,generation_model,usage_scope,status)
         values($1,$2,$3,$4,'multiple_choice',$5,null,$6,$7::jsonb,$8,$9,$10,'dev-fixture','mock_reserve','published')
         returning id`,
        [
          section,
          topic.id,
          setId,
          ["easy","medium","hard"][(position - 1) % 3],
          prompt,
          fingerprint([SOURCE, section, String(position), setId ?? "none"]),
          JSON.stringify(choices),
          correct,
          `DEV explanation: the requested answer was ${correct}.`,
          SOURCE,
        ]
      )).rows[0];

      await client.query(
        `insert into mock_test_form_questions
          (form_id,question_id,section_key,position,correct_answer_snapshot,topic_id_snapshot,topic_name_snapshot)
         values($1,$2,$3,$4,$5,$6,$7)`,
        [form.id, q.id, section, position, correct, topic.id, topic.name]
      );
      assignmentCounts[section] += 1;
    }

    for (const [section, count] of [["english",50],["math",45]]) {
      const sectionTopics = topics.get(section);
      for (let position = 1; position <= count; position += 1) {
        const topic = sectionTopics[(position - 1) % sectionTopics.length];
        await insertQuestion({ section, topic, position });
      }
    }

    async function insertSetSection(section, sizes) {
      const sectionTopics = topics.get(section);
      let position = 1;
      for (let setIndex = 0; setIndex < sizes.length; setIndex += 1) {
        const topic = sectionTopics[setIndex % sectionTopics.length];
        const set = (await client.query(
          `insert into question_sets(section_key,topic_id,kind,title,content,metadata)
           values($1,$2,$3,$4,$5,$6::jsonb) returning id`,
          [
            section,
            topic.id,
            section === "reading" ? "reading_passage" : "science_stimulus",
            `DEV ${section} set ${setIndex + 1}`,
            `DEV rehearsal ${section} stimulus ${setIndex + 1}. This content only exists so the shared-passage runner layout can be tested.`,
            JSON.stringify({ fixture: SOURCE }),
          ]
        )).rows[0];

        for (let child = 0; child < sizes[setIndex]; child += 1) {
          await insertQuestion({ section, topic, setId: set.id, position });
          position += 1;
        }
      }
    }

    await insertSetSection("reading", [6,6,6,6,6,6]);
    await insertSetSection("science", [6,6,6,6,6,6,4]);

    const total = Object.values(assignmentCounts).reduce((a,b) => a+b,0);
    if (
      total !== 171 ||
      assignmentCounts.english !== 50 ||
      assignmentCounts.math !== 45 ||
      assignmentCounts.reading !== 36 ||
      assignmentCounts.science !== 40
    ) {
      throw new Error(`Unexpected fixture counts: ${JSON.stringify(assignmentCounts)}`);
    }

    await client.query(
      `update mock_test_forms
       set status='locked', reviewed_at=now(), locked_at=now(), updated_at=now()
       where id=$1`,
      [form.id]
    );

    await client.query("commit");

    console.log(JSON.stringify({
      ready: true,
      userEmail: USER_EMAIL,
      registrationId,
      formId: form.id,
      formVersion: FORM_VERSION,
      timersSecondsPerSection: 90,
      counts: assignmentCounts,
      total,
      runPath: "/mock-test/run",
      resultsPath: "/mock-test/results",
    }, null, 2));
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
