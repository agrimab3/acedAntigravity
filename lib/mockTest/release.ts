import pg from "pg";
import {
  buildCompositeDistribution,
  calculateEnhancedComposite,
  calculatePercentile,
  estimateActScaleScore,
  type MockSectionKey,
} from "./scoring.ts";
import {
  buildMockReleaseSchedule,
  canFinalizeMockSessionForRelease,
  getMockReleaseGate,
  type ReleaseSectionRun,
} from "./release-policy.ts";

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
  email: string;
  sectionStats: Record<MockSectionKey, { correct: number; total: number }>;
  sectionScores: Record<MockSectionKey, number>;
  composite: number;
  topics: Map<string, TopicStat>;
};

type DbReleaseSectionRun = ReleaseSectionRun & {
  id: string;
};

function asDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function recordReleaseFailure(
  client: pg.PoolClient,
  slug: string,
  error: unknown,
  now: Date
) {
  try {
    const testResult = await client.query(
      "select id from mock_tests where slug=$1 limit 1",
      [slug]
    );
    const testId = testResult.rows[0]?.id;
    if (!testId) return;

    await client.query(
      `insert into mock_test_ops_events
        (mock_test_id,kind,details,created_at)
       values($1,'release_failed',$2::jsonb,$3)`,
      [
        testId,
        JSON.stringify({
          error: errorMessage(error).slice(0, 800),
        }),
        now,
      ]
     );
  } catch (recordError) {
    console.error("[mock-test release] could not record release failure", {
      slug,
      error: errorMessage(recordError),
    });
  }
}

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

    const releaseAt = new Date(test.results_release_at);
    const gate = getMockReleaseGate({
      status: String(test.status),
      now,
      releaseAt,
    });

    if (gate === "already_released") {
      await client.query("commit");
      return { released: true, alreadyReleased: true, slug, studentCount: null };
    }

    if (gate === "not_due") {
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
         mts.started_at as session_started_at,
         mf.version as form_version,
         u.email
       from mock_test_sessions mts
       inner join mock_registrations mr on mr.id=mts.registration_id
       inner join users u on u.id=mr.user_id
       inner join mock_test_forms mf on mf.id=mts.form_id
       where mr.mock_test_id=$1
         and ($2::boolean = true or mf.version <> 'DEV')
       order by mts.started_at, mts.id
       for update of mts, mr`,
      [test.id, includeDev]
     );

    const sessionsWithRuns: Array<{
      session: Record<string, unknown>;
      runs: DbReleaseSectionRun[];
    }> = [];

    for (const session of sessionResult.rows as Array<Record<string, unknown>>) {
      const runsResult = await client.query(
        `select
           id,
           section_order,
           time_limit_seconds,
           started_at,
           deadline_at,
           completed_at,
           outbox_cleared_at
         from mock_test_section_runs
         where session_id=$1
         order by section_order
         for update`,
        [session.session_id]
      );

      const runs = runsResult.rows.map((row) => ({
        id: String(row.id),
        sectionOrder: Number(row.section_order),
        timeLimitSeconds: Number(row.time_limit_seconds),
        startedAt: asDate(row.started_at),
        deadlineAt: asDate(row.deadline_at),
        completedAt: asDate(row.completed_at),
        outboxClearedAt: asDate(row.outbox_cleared_at),
      }));

      if (runs.length !== 4) {
        throw new Error(
          `Session ${session.session_id} has ${runs.length}/4 section runs.`
        );
      }

      sessionsWithRuns.push({ session, runs });
    }

    const pending = sessionsWithRuns.filter(({ session, runs }) => {
      const startedAt = asDate(session.session_started_at);
      if (!startedAt) return true;

      return !canFinalizeMockSessionForRelease({
        now,
        sessionStartedAt: startedAt,
        sessionCompleted: session.session_status === "completed",
        runs,
      });
    });

    if (pending.length > 0) {
      await client.query("commit");
      return {
        released: false,
        alreadyReleased: false,
        slug,
        reason: "sessions_pending",
        pendingSessionCount: pending.length,
        releaseAt: releaseAt.toISOString(),
        now: now.toISOString(),
      };
    }

    const students: StudentScore[] = [];
    let finalizedSessionCount = 0;

    for (const { session, runs } of sessionsWithRuns) {
      const sessionStartedAt = asDate(session.session_started_at);
      if (!sessionStartedAt) {
        throw new Error(`Session ${session.session_id} has no start time.`);
      }

      const schedule = buildMockReleaseSchedule(sessionStartedAt, runs);
      for (const run of runs) {
        const planned = schedule.find(
          (entry) => entry.sectionOrder === run.sectionOrder
        );
        if (!planned) {
          throw new Error(
            `Session ${session.session_id} is missing planned section ${run.sectionOrder}.`
          );
        }

        await client.query(
          `update mock_test_section_runs
           set started_at=coalesce(started_at,$2),
               deadline_at=coalesce(deadline_at,$3),
               completed_at=coalesce(completed_at,$3),
               updated_at=$4
           where id=$1`,
          [run.id, planned.startedAt, planned.deadlineAt, now]
         );
      }

      const finalDeadline =
        schedule[schedule.length - 1]?.deadlineAt ?? sessionStartedAt;

      if (session.session_status !== "completed") {
        await client.query(
          `update mock_test_sessions
           set status='completed',
               current_section_order=3,
               current_break_after=null,
               break_started_at=null,
               break_ends_at=null,
               completed_at=coalesce(completed_at,$2),
               updated_at=$3
           where id=$1`,
          [session.session_id, finalDeadline, now]
        );
        await client.query(
          `update mock_registrations
           set finished_at=coalesce(finished_at,$2), updated_at=$3
           where id=$1`,
          [session.registration_id, finalDeadline, now]
        );
        finalizedSessionCount += 1;
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
          throw new Error(`Unintended mock section ${row.section_key}.`);
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
        registrationId: String(session.registration_id),
        sessionId: String(session.session_id),
        email: String(session.email),
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

    for (const student of students) {
      console.info(
        `[mock-test release] would send scores-are-out email to ${student.email}`
      );
    }

    return {
      released: true,
      alreadyReleased: false,
      slug,
      studentCount: students.length,
      finalizedSessionCount,
      distribution,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {}

    console.error("[mock-test release] release failed", {
      slug,
      error: errorMessage(error),
    });
    await recordReleaseFailure(client, slug, error, now);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
