import {
  MOCK_BREAK_SECONDS,
  MOCK_OFFLINE_SYNC_WINDOW_MINUTES,
  MOCK_TRANSITION_SECONDS,
} from "../mockTests.ts";

export type ReleaseSectionRun = {
  sectionOrder: number;
  timeLimitSeconds: number;
  startedAt?: Date | null;
  deadlineAt?: Date | null;
  completedAt?: Date | null;
  outboxClearedAt?: Date | null;
};

export type PlannedReleaseSection = {
  sectionOrder: number;
  startedAt: Date;
  deadlineAt: Date;
};

export function isMockReleaseDue(now: Date, releaseAt: Date) {
  return now.getTime() >= releaseAt.getTime();
}

export function shouldRevealMockResults({
  status,
  now,
  releaseAt,
}: {
  status: string;
  now: Date;
  releaseAt: Date;
}) {
  return status === "released" && now.getTime() >= releaseAt.getTime();
}

export function getMockReleaseGate({
  status,
  now,
  releaseAt,
}: {
  status: string;
  now: Date;
  releaseAt: Date;
}) {
  if (status === "released") return "already_released" as const;
  if (!isMockReleaseDue(now, releaseAt)) return "not_due" as const;
  return "release" as const;
}

export function buildMockReleaseSchedule(
  sessionStartedAt: Date,
  runs: ReleaseSectionRun[]
): PlannedReleaseSection[] {
  const ordered = [...runs].sort((a, b) => a.sectionOrder - b.sectionOrder);
  let cursor = sessionStartedAt.getTime();

  return ordered.map((run) => {
    const explicitStart = run.startedAt?.getTime();
    const startedAt = new Date(
      explicitStart && Number.isFinite(explicitStart) ? explicitStart : cursor
    );
    const explicitDeadline = run.deadlineAt?.getTime();
    const deadlineAt = new Date(
      explicitDeadline && Number.isFinite(explicitDeadline)
        ? explicitDeadline
        : startedAt.getTime() + run.timeLimitSeconds * 1000
    );

    if (run.sectionOrder === 0 || run.sectionOrder === 2) {
      cursor = deadlineAt.getTime() + MOCK_TRANSITION_SECONDS * 1000;
    } else if (run.sectionOrder === 1) {
      cursor = deadlineAt.getTime() + MOCK_BREAK_SECONDS.afterMath * 1000;
    } else {
      cursor = deadlineAt.getTime();
    }

    return {
      sectionOrder: run.sectionOrder,
      startedAt,
      deadlineAt,
    };
  });
}

export function getMockSessionHardFinishAt(
  sessionStartedAt: Date,
  runs: ReleaseSectionRun[]
) {
  const schedule = buildMockReleaseSchedule(sessionStartedAt, runs);
  const lastDeadline =
    schedule[schedule.length - 1]?.deadlineAt ?? sessionStartedAt;

  return new Date(
    lastDeadline.getTime() + MOCK_OFFLINE_SYNC_WINDOW_MINUTES * 60 * 1000
  );
}

export function hasPendingOfflineWindow(
  now: Date,
  runs: ReleaseSectionRun[]
) {
  const windowMs = MOCK_OFFLINE_SYNC_WINDOW_MINUTES * 60 * 1000;

  return runs.some((run) => {
    if (run.outboxClearedAt) return false;
    if (!run.deadlineAt) return true;
    return now.getTime() < run.deadlineAt.getTime() + windowMs;
  });
}

export function canFinalizeMockSessionForRelease({
  now,
  sessionStartedAt,
  sessionCompleted,
  runs,
}: {
  now: Date;
  sessionStartedAt: Date;
  sessionCompleted: boolean;
  runs: ReleaseSectionRun[];
}) {
  if (sessionCompleted) {
    return !hasPendingOfflineWindow(now, runs);
  }

  return now.getTime() >= getMockSessionHardFinishAt(sessionStartedAt, runs).getTime();
}
