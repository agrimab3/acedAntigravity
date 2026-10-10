import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isAuthorizedMockReleaseCron } from "../lib/mockTest/cron-auth.ts";
import { classifyMockAnswerSync } from "../lib/mockTest/offlineSync.ts";
import {
  buildMockReleaseSchedule,
  canFinalizeMockSessionForRelease,
  getMockReleaseGate,
  getMockSessionHardFinishAt,
} from "../lib/mockTest/release-policy.ts";

function runs() {
  return [
    { sectionOrder: 0, timeLimitSeconds: 35 * 60 },
    { sectionOrder: 1, timeLimitSeconds: 50 * 60 },
    { sectionOrder: 2, timeLimitSeconds: 40 * 60 },
    { sectionOrder: 3, timeLimitSeconds: 40 * 60 },
  ];
}

test("mock release never runs before the server release time", () => {
  const releaseAt = new Date("2026-12-06T22:00:00.000Z");
  assert.equal(
    getMockReleaseGate({
      status: "open",
      now: new Date("2026-12-06T21:59:59.999Z"),
      releaseAt,
    }),
    "not_due"
  );
  assert.equal(
    getMockReleaseGate({
      status: "open",
      now: releaseAt,
      releaseAt,
    }),
    "release"
  );
});

test("an already released test is never released a second time", () => {
  assert.equal(
    getMockReleaseGate({
      status: "released",
      now: new Date("2026-12-07T00:00:00.000Z"),
      releaseAt: new Date("2026-12-06T22:00:00.000Z"),
    }),
    "already_released"
  );
});

test("release cron secret is always required", () => {
  assert.equal(isAuthorizedMockReleaseCron(undefined, null), false);
  assert.equal(isAuthorizedMockReleaseCron("secret", null), false);
  assert.equal(isAuthorizedMockReleaseCron("secret", "Bearer wrong"), false);
  assert.equal(isAuthorizedMockReleaseCron("secret", "Bearer secret"), true);
});

test("unfinished sessions become finalizable after their full timeline plus offline window", () => {
  const startedAt = new Date("2026-12-05T18:00:00.000Z");
  const sectionRuns = runs();
  const hardFinish = getMockSessionHardFinishAt(startedAt, sectionRuns);

  assert.equal(
    canFinalizeMockSessionForRelease({
      now: new Date(hardFinish.getTime() - 1),
      sessionStartedAt: startedAt,
      sessionCompleted: false,
      runs: sectionRuns,
    }),
    false
  );
  assert.equal(
    canFinalizeMockSessionForRelease({
      now: hardFinish,
      sessionStartedAt: startedAt,
      sessionCompleted: false,
      runs: sectionRuns,
    }),
    true
  );

  const schedule = buildMockReleaseSchedule(startedAt, sectionRuns);
  assert.equal(schedule.length, 4);
  assert.ok(schedule.every((run) => run.deadlineAt > run.startedAt));
});

test("release finalization respects the existing 15-minute late-answer window", () => {
  const deadline = new Date("2026-12-05T20:00:00.000Z");
  const pickedBeforeDeadline = new Date(deadline.getTime() - 1000);

  assert.deepEqual(
    classifyMockAnswerSync(
      new Date(deadline.getTime() + 15 * 60 * 1000),
      pickedBeforeDeadline,
      deadline
    ),
    { accepted: true, syncedLate: true }
  );

  const rejected = classifyMockAnswerSync(
    new Date(deadline.getTime() + 15 * 60 * 1000 + 1),
    pickedBeforeDeadline,
    deadline
  );
  assert.equal(rejected.accepted, false);
  if (!rejected.accepted) {
    assert.equal(rejected.reason, "offline_sync_window_expired");
  }
});

test("completed session waits for uncleared offline window before release", () => {
  const startedAt = new Date("2026-12-05T18:00:00.000Z");
  const deadline = new Date("2026-12-05T20:00:00.000Z");
  const sectionRuns = runs().map((run, index) => ({
    ...run,
    startedAt,
    deadlineAt: index === 3 ? deadline : new Date(deadline.getTime() - 60_000),
    completedAt: deadline,
    outboxClearedAt: index < 3 ? deadline : null,
  }));

  assert.equal(
    canFinalizeMockSessionForRelease({
      now: new Date(deadline.getTime() + 14 * 60 * 1000),
      sessionStartedAt: startedAt,
      sessionCompleted: true,
      runs: sectionRuns,
    }),
    false
  );
  assert.equal(
    canFinalizeMockSessionForRelease({
      now: new Date(deadline.getTime() + 15 * 60 * 1000),
      sessionStartedAt: startedAt,
      sessionCompleted: true,
      runs: sectionRuns,
    }),
    true
  );
});

test("fresh production seed starts Dec 5 scheduled, not released", () => {
  const migration = readFileSync(
    new URL("../drizzle/0008_woozy_famine.sql", import.meta.url),
    "utf8"
  );

  assert.match(migration, /'2026-12-05'/);
  assert.match(migration, /'2026-12-06T22:00:00Z'/);
  assert.match(migration, /200,\s*'open'/);
  assert.doesNotMatch(migration, /VALUES\s*\([\s\S]*?'released'/i);
});
