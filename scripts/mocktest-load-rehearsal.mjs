import pg from "pg";
import { encode } from "next-auth/jwt";

const { Client } = pg;
const COUNT = Number(process.env.LOAD_STUDENTS || 120);
const BASE_URL = process.env.LOAD_BASE_URL || "http://127.0.0.1:3000";
const PREFIX = `loadtest-${Date.now()}-`;
const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!secret) throw new Error("AUTH_SECRET/NEXTAUTH_SECRET is required.");

const client = new Client({ connectionString: process.env.DATABASE_URL });
const timings = [];
const failures = [];

async function request(path, cookie, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        cookie: `next-auth.session-token=${cookie}`,
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 200) }; }
    if (!response.ok) throw new Error(`${response.status} ${path}: ${JSON.stringify(body)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function saveOne(student, session) {
  const q = session.section?.questions?.[0];
  if (!q) throw new Error(`No question for section ${session.currentSectionOrder}`);
  const started = performance.now();
  await request("/api/mock-test/session/answer", student.cookie, {
    method: "PATCH",
    body: JSON.stringify({
      sessionId: session.sessionId,
      answers: [{
        questionId: q.id,
        selectedAnswer: "A",
        flagged: false,
        clientSequence: 1,
        pickedAtServer: session.serverNow,
      }],
      outboxEmptySectionRunId: session.section.sectionRunId,
    }),
  });
  timings.push(performance.now() - started);
}

async function complete(student, session, order) {
  const param = order === 1 ? "devBreakSeconds=1" : "devTransitionSeconds=1";
  return request(`/api/mock-test/session/complete-section?${param}`, student.cookie, {
    method: "POST",
    body: JSON.stringify({ sessionId: session.sessionId, outboxEmpty: true }),
  });
}

async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function main() {
  await client.connect();
  const test = await client.query("select id from mock_tests where slug='2026-12-05' limit 1");
  if (!test.rowCount) throw new Error("Mock test not found.");
  const mockTestId = test.rows[0].id;
  const form = await client.query("select id from mock_test_forms where mock_test_id=$1 and status='locked' order by (version='DEV') desc, version limit 1", [mockTestId]);
  if (!form.rowCount) throw new Error("No locked mock form found.");

  const students = [];
  for (let i = 0; i < COUNT; i += 1) {
    const email = `${PREFIX}${i}@aced.test`;
    const user = await client.query("insert into users(email,name) values($1,$2) returning id", [email, `Load Student ${i}`]);
    const id = user.rows[0].id;
    await client.query(
      `insert into mock_registrations(mock_test_id,user_id,time_zone,agreed_no_refund_at,paid_at,start_override_until)
       values($1,$2,'America/Los_Angeles',now(),now(),now()+interval '2 hours')`,
      [mockTestId, id]
    );
    const cookie = await encode({
      secret,
      maxAge: 7200,
      token: { sub: id, appUserId: id, email, name: `Load Student ${i}` },
    });
    students.push({ id, email, cookie, session: null });
  }

  const phase = async (label, fn) => {
    const started = performance.now();
    const results = await Promise.allSettled(students.map((student) => fn(student)));
    results.forEach((result, i) => {
      if (result.status === "rejected") failures.push(`${label} student=${i}: ${result.reason?.message || result.reason}`);
    });
    console.log(`${label}: ${results.filter((r) => r.status === "fulfilled").length}/${COUNT} ok in ${Math.round(performance.now() - started)}ms`);
    if (failures.length) throw new Error(failures.at(-1));
  };

  await phase("start", async (student) => {
    const body = await request("/api/mock-test/session", student.cookie, { method: "POST", body: "{}" });
    student.session = body.session;
  });

  for (let order = 0; order < 4; order += 1) {
    await phase(`answer-${order}`, async (student) => saveOne(student, student.session));
    await phase(`submit-${order}`, async (student) => complete(student, student.session, order));
    if (order < 3) {
      await sleep(1250);
      await phase(`advance-${order}`, async (student) => {
        const body = await request("/api/mock-test/session", student.cookie);
        student.session = body.session;
        if (student.session?.status !== "in_progress" || student.session.currentSectionOrder !== order + 1) {
          throw new Error(`Did not advance from section ${order}: ${JSON.stringify(student.session)}`);
        }
      });
    }
  }

  const completed = await client.query(
    `select count(*)::int n from mock_test_sessions mts join mock_registrations mr on mr.id=mts.registration_id join users u on u.id=mr.user_id where u.email like $1 and mts.status='completed'`,
    [`${PREFIX}%`]
  );
  const avg = timings.reduce((sum, value) => sum + value, 0) / Math.max(1, timings.length);
  const slowest = Math.max(...timings);
  console.log(JSON.stringify({
    students: COUNT,
    completed: completed.rows[0].n,
    answerSaves: timings.length,
    answerSaveAverageMs: Number(avg.toFixed(1)),
    answerSaveSlowestMs: Number(slowest.toFixed(1)),
    failures: failures.length,
  }));
}

try {
  await main();
} finally {
  try {
    await client.query("delete from users where email like $1", [`${PREFIX}%`]);
    const left = await client.query("select count(*)::int n from users where email like $1", [`${PREFIX}%`]);
    console.log(`cleanup_remaining_users=${left.rows[0].n}`);
  } catch (error) {
    console.error("cleanup failed", error instanceof Error ? error.message : String(error));
  }
  await client.end().catch(() => {});
}
