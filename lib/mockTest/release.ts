import pg from "pg";
import {
  buildCompositeDistribution,
  calculateEnhancedComposite,
  calculatePercentile,
  estimateActScaleScore,
  type MockSectionKey,
} from "./scoring.ts";
import { MOCK_OFFLINE_SYNC_WINDOW_MINUTES } from "../mockTests.ts";

const { Pool } = pg;
const SECTION_KEYS: MockSectionKey[] = ["english", "math", "reading", "science"];

type ReleaseOptions = {
  connectionString: string;
  slug: string;
  now?: Date;
  includeDev?: boolean;
};

type TopicStat = {
  sectionKey: MockSectionKey;
  topicId: string;
  topicName: string;
  correct: number;
  total: number;
};

type StudentScore = {
  registrationId: string;
  sessionId: string;
  sectionStats: Record<MockSectionKey, { correct: number; total: number }>;
  sectionScores: Record<MockSectionKey, number>;
  composite: number;
  topics: Map<string, TopicStat>;
};

export async function releaseMockTest({
  connectionString,
  slug,
  now = new Date(),
  includeDev = false,
}: ReleaseOptions) {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("begin");

    const testResult = await client.query(
      `select id, slug, results_release_at, status
       from mock_tests
       where slug=$1
       for update`,
      [slug]
    );
    const test = testResult.rows[0];

    if (!test) throw new Error(`Mock test ${slug} not found.`);

    if (test.status === "released") {
      await client.query("commit");
      return { released: true, alreadyReleased: true, slug, studentCount: null };
    }

    const releaseAt = new Date(test.results_release_at);
    if (now.getTime() < releaseAt.getTime()) {
      await client.query("commit");
      return {
        released: false,
        alreadyReleased: false,
        slug,
        reason: "not_due",
        releaseAt: releaseAt.toISOString(),
        now: now.toISOString(),
      };
    }

    const sessionResult = await client.query(
      `select
         mts.id as session_id,
         mts.registration_id,
         mts.form_id,
         mts.status as session_status,
         (select max(sr.deadline_at) from mock_test_section_runs sr where sr.session_id=mts.id) as final_deadline,
         mf.version as form_version
       from mock_test_sessions mts
       inner join mock_registrations mr on mr.id=mts.registration_id
       inner join mock_test_forms mf on mf.id=mts.form_id
       where mr.mock_test_id=$1
         and (
           mts.status='completed'
           or (
             (select count(*) from mock_test_section_runs sr where sr.session_id=mts.id)=4
             and not exists (
               select 1
               from mock_test_section_runs sr
               where sr.session_id=mts.id
                 and (sr.deadline_at is null or sr.deadline_at > $2)
             )
           )
         )
         and not exists (
           select 1
           from mock_test_section_runs sr
           where sr.session_id=mts.id
             and (
               sr.deadline_at is null
               or (
                 sr.outbox_cleared_at is null
                 and sr.deadline_at + ($4::int * interval '1 minute') > $2
               )
             )
         )
         and ($3::boolean = true or mf.version <> 'DEV')
       order by mts.started_at, mts.id
       for update of mts, mr`,
      [test.id, now, includeDev, MOCK_OFFLINE_SYNC_WINDOW_MINUTES]
    );

    const students: StudentScore[] = [];

    for (const session of sessionResult.rows) {
      if (session.session_status !== "completed") {
        const finishedAt = session.final_deadline ? new Date(session.final_deadline) : now;
        await client.query(
          `update mock_test_sessions
           set status='completed', completed_at=coalesce(completed_at,$2), updated_at=$2
           where id=$1`,
          [session.session_id, finishedAt]
        );
        await client.query(
          `update mock_registrations
           set finished_at=coalesce(finished_at,$2), updated_at=$2
           where id=$1`,
          [session.registration_id, finishedAt]
        );
      }

      const answerResult = await client.query(
        `select
           mfq.section_key,
           mfq.correct_answer_snapshot,
           mfq.topic_id_snapshot,
           mfq.topic_name_snapshot,
           mta.selected_answer
         from mock_test_answers mta
         inner join mock_test_form_questions mfq
           on mfq.form_id=$1
          and mfq.question_id=mta.question_id
         where mta.session_id=$2
         order by mfq.section_key, mfq.position`,
        [session.form_id, session.session_id]
      );

      if (answerResult.rows.length !== 171) {
        throw new Error(
          `Session ${session.session_id} has ${answerResult.rows.length}/171 frozen answer rows.`
        );
      }

      const sectionStats = Object.fromEntries(
        SECTION_KEYS.map((key) => [key, { correct: 0, total: 0 }])
      ) as Record<MockSectionKey, { correct: number; total: number }>;
      const topics = new Map<string, TopicStat>();

      for (const row of answerResult.rows) {
        const sectionKey = row.section_key as MockSectionKey;
        if (!(sectionKey in sectionStats)) {
          throw new Error(`Unexpected mock section ${row.section_key}.`);
        }

        const isCorrect =
          row.selected_answer !== null &&
          row.selected_answer === row.correct_answer_snapshot;

        sectionStats[sectionKey].total += 1;
        if (isCorrect) sectionStats[sectionKey].correct += 1;

        const topicKey = String(row.topic_id_snapshot);
        const topic = topics.get(topicKey) ?? {
          sectionKey,
          topicId: topicKey,
          topicName: String(row.topic_name_snapshot),
          correct: 0,
          total: 0,
        };
        topic.total += 1;
        if (isCorrect) topic.correct += 1;
        topics.set(topicKey, topic);
      }

      const sectionScores = Object.fromEntries(
        SECTION_KEYS.map((key) => [
          key,
          estimateActScaleScore(sectionStats[key].correct, sectionStats[key].total),
        ])
      ) as Record<MockSectionKey, number>;

      const composite = calculateEnhancedComposite({
        english: sectionScores.english,
        math: sectionScores.math,
        reading: sectionScores.reading,
      });

      students.push({
        registrationId: session.registration_id,
        sessionId: session.session_id,
        sectionStats,
        sectionScores,
        composite,
        topics,
      });
    }

    const composites = students.map((student) => student.composite);
    const distribution = buildCompositeDistribution(composites);

    for (const student of students) {
      const percentile = calculatePercentile(student.composite, composites);

      await client.query(
        `update mock_registrations
         set english_score=$2,
             math_score=$3,
             reading_score=$4,
             science_score=$5,
             composite=$6,
             percentile=$7,
             updated_at=$8
         where id=$1`,
        [
          student.registrationId,
          student.sectionScores.english,
          student.sectionScores.math,
          student.sectionScores.reading,
          student.sectionScores.science,
          student.composite,
          percentile,
          now,
        ]
      );

      await client.query(
        "delete from mock_test_topic_results where registration_id=$1",
        [student.registrationId]
      );

      for (const topic of student.topics.values()) {
        await client.query(
          `insert into mock_test_topic_results
            (registration_id,section_key,topic_id,topic_name,correct_count,total_count,updated_at)
           values($1,$2,$3,$4,$5,$6,$7)`,
          [
            student.registrationId,
            topic.sectionKey,
            topic.topicId,
            topic.topicName,
            topic.correct,
            topic.total,
            now,
          ]
        );
      }
    }

    await client.query(
      `update mock_tests
       set status='released', released_at=$3, composite_distribution=$2
       where id=$1`,
      [test.id, JSON.stringify(distribution), now]
    );

    await client.query("commit");

    return {
      released: true,
      alreadyReleased: false,
      slug,
      studentCount: students.length,
      distribution,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
