import test from "node:test";
import assert from "node:assert/strict";
import { classifyMockAnswerSync } from "../lib/mockTest/offlineSync.ts";

const deadline = new Date("2026-12-05T20:00:00.000Z");

test("accepts an answer received within the five-second grace period", () => {
  const decision = classifyMockAnswerSync(
    new Date(deadline.getTime() + 5000),
    new Date(deadline.getTime() + 3000),
    deadline
  );
  assert.deepEqual(decision, { accepted: true, syncedLate: false });
});

test("accepts a pre-deadline offline pick received within 15 minutes as synced late", () => {
  const decision = classifyMockAnswerSync(
    new Date(deadline.getTime() + 10 * 60 * 1000),
    new Date(deadline.getTime() - 2000),
    deadline
  );
  assert.deepEqual(decision, { accepted: true, syncedLate: true });
});

test("rejects an answer picked after the deadline once grace has passed", () => {
  const decision = classifyMockAnswerSync(
    new Date(deadline.getTime() + 60 * 1000),
    new Date(deadline.getTime() + 1000),
    deadline
  );
  assert.equal(decision.accepted, false);
  if (!decision.accepted) assert.equal(decision.reason, "picked_after_deadline");
});

test("rejects an offline pick that arrives after the 15-minute sync window", () => {
  const decision = classifyMockAnswerSync(
    new Date(deadline.getTime() + 15 * 60 * 1000 + 1),
    new Date(deadline.getTime() - 1000),
    deadline
  );
  assert.equal(decision.accepted, false);
  if (!decision.accepted) {
    assert.equal(decision.reason, "offline_sync_window_expired");
  }
});
