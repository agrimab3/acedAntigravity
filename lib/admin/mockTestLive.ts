import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";

const SECTION_TOTALS = {
  english: 50,
  math: 45,
  reading: 36,
  science: 40,
} as const;

type SectionKey = keyof typeof SECTION_TOTALS;

export type MockAdminAlert = {
  id: string;
  type: string;
  severity: "warning" | "problem";
  label: string;
  registrationId?: string;
  email?: string;
};

export type MockAdminSection = {
  key: SectionKey;
  startedAt: string | null;
  deadlineAt: string | null;
  completedAt: string | null;
  completionSource: "student" | "time" | null;
  answeredCount: number;
  totalCount: number;
  syncedLateCount: number;
  rejectedCount: number;
};

export type MockAdminStudent = {
  registrationId: string;
  email: string;
  timeZone: string;
  paymentStatus: "yes" | "test" | "no";
  paymentReference: string | null;
  paidAt: string | null;
  registeredAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status:
    | "not started"
    | "english"
    | "math"
    | "break"
    | "reading"
    | "science"
    | "finished";
  timeLeftSeconds: number | null;
  answeredCurrent: number;
  currentTotal: number | null;
  lastSavedAt: string | null;
  syncedLateCount: number;
  rejectedCount: number;
  recentClients: number;
  inviteUsed: boolean;
  invitedAt: string | null;
  startOverrideUntil: string | null;
  adminEvents: Array<{ action: string; reason: string; createdAt: string }>;
  breakStartedAt: string | null;
  breakEndsAt: string | null;
  sections: MockAdminSection[];
  alerts: MockAdminAlert[];
  scores: null | {
    english: number | null;
    math: number | null;
    reading: number | null;
    science: number | null;
    composite: number | null;
    percentile: number | null;
  };
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function afterEightOnTestDay(now: Date, timeZone: string, testDate: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value])
    );
    const localDate =
      values.year + "-" + values.month + "-" + values.day;
    return localDate === testDate && Number(values.hour) >= 20;
  } catch {
    return false;
  }
}

function statusFor(row: Record<string, unknown>): MockAdminStudent["status"] {
  if (row.finished_at || row.session_status === "completed") return "finished";
  if (!row.session_id) return "not started";
  if (row.current_break_after === "math") return "break";
  if (row.current_break_after === "english") return "math";
  if (row.current_break_after === "reading") return "science";

  const sections = ["english", "math", "reading", "science"] as const;
  return sections[numberValue(row.current_section_order)] ?? "english";
}

export async function getMockTestLiveOverview(slug: string) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable.");

  const now = getMockTestServerNow();

  const testResult = await db.execute(sql`
    select id, slug, test_date, act_date, results_release_at, released_at, seat_limit, signups_paused, status
    from mock_tests
    where slug=${slug}
    limit 1
  `);
  const test = testResult.rows[0] as Record<string, unknown> | undefined;
  if (!test) return null;

  const testId = String(test.id);
  const releaseAt = new Date(String(test.results_release_at));

  const seatResult = await db.execute(sql`
    select
      count(*) filter (where paid_at is not null)::int as paid,
      count(*) filter (
        where paid_at is null
          and hold_expires_at is not null
          and hold_expires_at > ${now}
      )::int as active_holds
    from mock_registrations
    where mock_test_id=${testId}::uuid
  `);
  const seats = seatResult.rows[0] as Record<string, unknown>;

  const waitlistResult = await db.execute(sql`
    select
      count(*)::int as total,
      count(*) filter (where invited_at is not null)::int as invited,
      count(*) filter (where invite_used_at is not null)::int as used
    from mock_waitlist
    where mock_test_id=${testId}::uuid
  `);
  const waitlist = waitlistResult.rows[0] as Record<string, unknown>;

  const eventResult = await db.execute(sql`
    select registration_id, section_key, kind, details, created_at
    from mock_test_ops_events
    where mock_test_id=${testId}::uuid
    order by created_at desc
  `);
  const events = eventResult.rows as Array<Record<string, unknown>>;
  const eventsByRegistration = new Map<
    string,
    Array<Record<string, unknown>>
  >();
  for (const event of events) {
    if (!event.registration_id) continue;
    const registrationId = String(event.registration_id);
    const list = eventsByRegistration.get(registrationId) ?? [];
    list.push(event);
    eventsByRegistration.set(registrationId, list);
  }

  const studentsResult = await db.execute(sql`
    select
      mr.id as registration_id,
      u.email,
      mr.time_zone,
      mr.paid_at,
      mr.start_override_until,
      mr.stripe_payment_intent_id,
      mr.stripe_checkout_session_id,
      mr.created_at as registered_at,
      mr.started_at,
      mr.finished_at,
      mr.english_score,
      mr.math_score,
      mr.reading_score,
      mr.science_score,
      mr.composite,
      mr.percentile,
      mts.id as session_id,
      mts.status as session_status,
      mts.current_section_order,
      mts.current_break_after,
      mts.break_started_at,
      mts.break_ends_at,
      csr.section_key as current_section_key,
      csr.started_at as current_section_started_at,
      csr.deadline_at as current_deadline_at,
      (
        select count(*)::int
        from mock_test_answers a
        where a.section_run_id=csr.id
          and a.selected_answer is not null
      ) as answered_current,
      (
        select max(a.updated_at)
        from mock_test_answers a
        where a.session_id=mts.id
          and a.selected_answer is not null
      ) as last_saved_at,
      (
        select count(*)::int
        from mock_test_answers a
        where a.session_id=mts.id
          and a.synced_late=true
      ) as synced_late_count,
      (
        select count(*)::int
        from mock_test_client_presence cp
        where cp.registration_id=mr.id
          and cp.last_seen_at >= ${new Date(now.getTime() - 90_000)}
      ) as recent_clients,
      wl.invited_at,
      wl.invite_used_at
    from mock_registrations mr
    inner join users u on u.id=mr.user_id
    left join mock_test_sessions mts on mts.registration_id=mr.id
    left join mock_test_section_runs csr
      on csr.session_id=mts.id
      and csr.section_order=mts.current_section_order
    left join lateral (
      select invited_at, invite_used_at
      from mock_waitlist mw
      where mw.mock_test_id=mr.mock_test_id
        and (
          mw.user_id=mr.user_id
          or lower(mw.email)=lower(u.email)
        )
      order by mw.created_at desc
      limit 1
    ) wl on true
    where mr.mock_test_id=${testId}::uuid
    order by lower(u.email)
  `);

  const sectionResult = await db.execute(sql`
    select
      mts.registration_id,
      sr.section_key,
      sr.started_at,
      sr.deadline_at,
      sr.completed_at,
      (
        select count(*)::int
        from mock_test_answers a
        where a.section_run_id=sr.id
          and a.selected_answer is not null
      ) as answered_count,
      (
        select count(*)::int
        from mock_test_answers a
        where a.section_run_id=sr.id
          and a.synced_late=true
      ) as synced_late_count
    from mock_test_section_runs sr
    inner join mock_test_sessions mts on mts.id=sr.session_id
    inner join mock_registrations mr on mr.id=mts.registration_id
    where mr.mock_test_id=${testId}::uuid
    order by mts.registration_id, sr.section_order
  `);

  const sectionsByRegistration = new Map<string, MockAdminSection[]>();
  for (const raw of sectionResult.rows as Array<Record<string, unknown>>) {
    const registrationId = String(raw.registration_id);
    const key = String(raw.section_key) as SectionKey;
    const deadlineAt = iso(raw.deadline_at);
    const completedAt = iso(raw.completed_at);
    const rejectedCount = (
      eventsByRegistration.get(registrationId) ?? []
    ).filter(
      (event) =>
        event.kind === "answer_sync_rejected" &&
        String(event.section_key ?? "") === key
    ).length;

    const completionSource =
      completedAt && deadlineAt
        ? new Date(completedAt).getTime() <
          new Date(deadlineAt).getTime() - 1000
          ? "student"
          : "time"
        : null;

    const list = sectionsByRegistration.get(registrationId) ?? [];
    list.push({
      key,
      startedAt: iso(raw.started_at),
      deadlineAt,
      completedAt,
      completionSource,
      answeredCount: numberValue(raw.answered_count),
      totalCount: SECTION_TOTALS[key],
      syncedLateCount: numberValue(raw.synced_late_count),
      rejectedCount,
    });
    sectionsByRegistration.set(registrationId, list);
  }

  const auditResult = await db.execute(sql`
    select target, action, reason, created_at
    from admin_audit_log
    where target in (
      select id::text from mock_registrations where mock_test_id=${testId}::uuid
    )
    order by created_at asc
  `);
  const auditByRegistration = new Map<string, Array<{ action: string; reason: string; createdAt: string }>>();
  for (const row of auditResult.rows as Array<Record<string, unknown>>) {
    const target = String(row.target);
    const list = auditByRegistration.get(target) ?? [];
    list.push({
      action: String(row.action),
      reason: String(row.reason),
      createdAt: iso(row.created_at) ?? now.toISOString(),
    });
    auditByRegistration.set(target, list);
  }

  const testReleased = String(test.status) === "released";
  const students: MockAdminStudent[] = [];
  const alerts: MockAdminAlert[] = [];

  for (const raw of studentsResult.rows as Array<Record<string, unknown>>) {
    const registrationId = String(raw.registration_id);
    const email = String(raw.email);
    const status = statusFor(raw);
    const deadlineAt = iso(raw.current_deadline_at);
    const lastSavedAt = iso(raw.last_saved_at);
    const currentStartedAt = iso(raw.current_section_started_at);
    const timeLeftSeconds =
      deadlineAt &&
      ["english", "math", "reading", "science"].includes(status)
        ? Math.max(
            0,
            Math.ceil(
              (new Date(deadlineAt).getTime() - now.getTime()) / 1000
            )
          )
        : null;

    const studentEvents = eventsByRegistration.get(registrationId) ?? [];
    const breakStartedEvent = studentEvents.find((event) => event.kind === "break_started");
    const breakEndedEvent = studentEvents.find((event) => event.kind === "break_ended");
    const breakStartedDetails = (breakStartedEvent?.details ?? {}) as Record<string, unknown>;
    const breakEndedDetails = (breakEndedEvent?.details ?? {}) as Record<string, unknown>;
    const rejectedCount = studentEvents.filter(
      (event) => event.kind === "answer_sync_rejected"
    ).length;
    const syncedLateCount = numberValue(raw.synced_late_count);
    const recentClients = numberValue(raw.recent_clients);
    const studentAlerts: MockAdminAlert[] = [];

    const addAlert = (
      type: string,
      severity: "warning" | "problem",
      label: string
    ) => {
      const alert = {
        id: registrationId + ":" + type,
        type,
        severity,
        label,
        registrationId,
        email,
      } satisfies MockAdminAlert;
      studentAlerts.push(alert);
      alerts.push(alert);
    };

    const activityAt = lastSavedAt ?? currentStartedAt;
    if (
      ["english", "math", "reading", "science"].includes(status) &&
      timeLeftSeconds !== null &&
      timeLeftSeconds > 300 &&
      activityAt &&
      now.getTime() - new Date(activityAt).getTime() >= 10 * 60_000
    ) {
      addAlert("possibly_stuck", "warning", email + " · possibly stuck");
    }

    if (syncedLateCount > 0 || rejectedCount > 0) {
      addAlert(
        "offline_answers",
        rejectedCount > 0 ? "problem" : "warning",
        email + " · offline answers"
      );
    }

    if (recentClients >= 2) {
      addAlert(
        "multiple_clients",
        "warning",
        email + " · open in " + recentClients + " tabs/devices"
      );
    }

    const devForceStartCutoffWarning =
      process.env.NODE_ENV !== "production" &&
      studentEvents.some(
        (event) => event.kind === "dev_force_start_cutoff_warning"
      );

    if (
      (raw.paid_at &&
        !raw.started_at &&
        afterEightOnTestDay(
          now,
          String(raw.time_zone),
          String(test.test_date)
        )) ||
      devForceStartCutoffWarning
    ) {
      addAlert(
        "start_cutoff_warning",
        "warning",
        email + " · paid but hasn't started"
      );
    }

    if (
      studentEvents.some(
        (event) => event.kind === "payment_after_hold_expired"
      )
    ) {
      addAlert(
        "expired_hold_paid",
        "problem",
        email + " · payment completed after checkout hold expired"
      );
    }

    if (
      studentEvents.some(
        (event) =>
          event.kind === "checkout_error" ||
          event.kind === "payment_error" ||
          event.kind === "webhook_error"
      )
    ) {
      addAlert(
        "payment_error",
        "problem",
        email + " · payment/checkout error"
      );
    }

    const paymentReference = raw.stripe_payment_intent_id
      ? String(raw.stripe_payment_intent_id)
      : raw.stripe_checkout_session_id
        ? String(raw.stripe_checkout_session_id)
        : null;
    const paymentStatus: MockAdminStudent["paymentStatus"] = raw.paid_at
      ? paymentReference?.startsWith("test_payment_")
        ? "test"
        : "yes"
      : "no";

    const currentSectionKey = raw.current_section_key
      ? String(raw.current_section_key)
      : null;
    const currentTotal =
      currentSectionKey && currentSectionKey in SECTION_TOTALS
        ? SECTION_TOTALS[currentSectionKey as SectionKey]
        : null;

    students.push({
      registrationId,
      email,
      timeZone: String(raw.time_zone),
      paymentStatus,
      paymentReference,
      paidAt: iso(raw.paid_at),
      registeredAt: iso(raw.registered_at) ?? now.toISOString(),
      startedAt: iso(raw.started_at),
      finishedAt: iso(raw.finished_at),
      status,
      timeLeftSeconds,
      answeredCurrent: numberValue(raw.answered_current),
      currentTotal,
      lastSavedAt,
      syncedLateCount,
      rejectedCount,
      recentClients,
      inviteUsed: Boolean(raw.invite_used_at),
      invitedAt: iso(raw.invited_at),
      startOverrideUntil: iso(raw.start_override_until),
      adminEvents: auditByRegistration.get(registrationId) ?? [],
      breakStartedAt:
        iso(breakStartedDetails.startedAt) ??
        iso(breakStartedEvent?.created_at) ??
        iso(raw.break_started_at),
      breakEndsAt:
        iso(breakEndedDetails.endedAt) ??
        iso(breakEndedEvent?.created_at) ??
        iso(raw.break_ends_at),
      sections: sectionsByRegistration.get(registrationId) ?? [],
      alerts: studentAlerts,
      scores: testReleased
        ? {
            english:
              raw.english_score == null
                ? null
                : numberValue(raw.english_score),
            math:
              raw.math_score == null
                ? null
                : numberValue(raw.math_score),
            reading:
              raw.reading_score == null
                ? null
                : numberValue(raw.reading_score),
            science:
              raw.science_score == null
                ? null
                : numberValue(raw.science_score),
            composite:
              raw.composite == null
                ? null
                : numberValue(raw.composite),
            percentile:
              raw.percentile == null
                ? null
                : numberValue(raw.percentile),
          }
        : null,
    });
  }

  if (
    String(test.status) !== "released" &&
    now.getTime() >= releaseAt.getTime() + 10 * 60_000
  ) {
    alerts.unshift({
      id: "release-job-late",
      type: "release_job_late",
      severity: "problem",
      label: "Release job hasn't run",
    });
  }

  const rightNow = {
    notStarted: 0,
    english: 0,
    math: 0,
    break: 0,
    reading: 0,
    science: 0,
    finished: 0,
  };

  for (const student of students.filter((item) => item.paidAt)) {
    if (student.status === "not started") rightNow.notStarted += 1;
    else if (student.status === "finished") rightNow.finished += 1;
    else if (student.status === "break") rightNow.break += 1;
    else rightNow[student.status] += 1;
  }

  const paid = numberValue(seats.paid);
  const activeHolds = numberValue(seats.active_holds);
  const seatLimit = numberValue(test.seat_limit);

  return {
    updatedAt: now.toISOString(),
    test: {
      id: testId,
      slug: String(test.slug),
      testDate: String(test.test_date),
      actDate: String(test.act_date),
      status: String(test.status),
      resultsReleaseAt: releaseAt.toISOString(),
      releasedAt: iso(test.released_at),
      seatLimit,
      signupsPaused: Boolean(test.signups_paused),
    },
    seats: {
      paid,
      activeHolds,
      seatsLeft: Math.max(0, seatLimit - paid - activeHolds),
    },
    waitlist: {
      total: numberValue(waitlist.total),
      invited: numberValue(waitlist.invited),
      used: numberValue(waitlist.used),
    },
    rightNow,
    results: {
      releaseAt: releaseAt.toISOString(),
      status:
        String(test.status) === "released"
          ? ("released" as const)
          : ("not released" as const),
      releasedAt: iso(test.released_at),
      scored: students.filter(
        (student) => student.scores?.composite != null
      ).length,
    },
    alerts,
    students,
  };
}
