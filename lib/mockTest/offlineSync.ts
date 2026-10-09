import {
  MOCK_OFFLINE_SYNC_WINDOW_MINUTES,
  MOCK_SAVE_GRACE_SECONDS,
} from "../mockTests.ts";

export type MockAnswerSyncDecision =
  | { accepted: true; syncedLate: false }
  | { accepted: true; syncedLate: true }
  | {
      accepted: false;
      syncedLate: false;
      reason: "offline_sync_window_expired" | "picked_after_deadline";
    };

export function classifyMockAnswerSync(
  receivedAt: Date,
  pickedAt: Date,
  deadlineAt: Date
): MockAnswerSyncDecision {
  const deadlineMs = deadlineAt.getTime();
  const receivedMs = receivedAt.getTime();
  const pickedMs = pickedAt.getTime();
  const graceMs = MOCK_SAVE_GRACE_SECONDS * 1000;
  const lateWindowMs = MOCK_OFFLINE_SYNC_WINDOW_MINUTES * 60 * 1000;

  if (receivedMs <= deadlineMs + graceMs) {
    return { accepted: true, syncedLate: false };
  }

  if (pickedMs <= deadlineMs && receivedMs <= deadlineMs + lateWindowMs) {
    return { accepted: true, syncedLate: true };
  }

  return {
    accepted: false,
    syncedLate: false,
    reason:
      receivedMs > deadlineMs + lateWindowMs
        ? "offline_sync_window_expired"
        : "picked_after_deadline",
  };
}
