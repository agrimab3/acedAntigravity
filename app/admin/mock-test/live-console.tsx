"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./admin.module.css";

type Alert = {
  id: string;
  type: string;
  severity: "warning" | "problem";
  label: string;
  registrationId?: string;
  email?: string;
};

type Section = {
  key: "english" | "math" | "reading" | "science";
  startedAt: string | null;
  deadlineAt: string | null;
  completedAt: string | null;
  completionSource: "student" | "time" | null;
  answeredCount: number;
  totalCount: number;
  syncedLateCount: number;
  rejectedCount: number;
};

type Student = {
  registrationId: string;
  email: string;
  timeZone: string;
  paymentStatus: "yes" | "test" | "no" | "refunded";
  paymentReference: string | null;
  stripePaymentIntentId: string | null;
  stripeRefundId: string | null;
  refundedAt: string | null;
  refundReason: string | null;
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
  sections: Section[];
  alerts: Alert[];
  scores: null | {
    english: number | null;
    math: number | null;
    reading: number | null;
    science: number | null;
    composite: number | null;
    percentile: number | null;
  };
};

type AuditEntry = {
  id: string;
  adminEmail: string;
  action: string;
  target: string;
  details: unknown;
  reason: string;
  createdAt: string;
};

type AdminActionKind =
  | "seat_limit"
  | "signups"
  | "invite"
  | "add_time"
  | "reopen_start"
  | "reset_attempt"
  | "release";

type ActionDialogState = {
  kind: AdminActionKind;
  title: string;
  student?: Student;
};

type Overview = {
  updatedAt: string;
  test: {
    id: string;
    slug: string;
    testDate: string;
    actDate: string;
    status: string;
    resultsReleaseAt: string;
    releasedAt: string | null;
    seatLimit: number;
    signupsPaused: boolean;
  };
  seats: {
    paid: number;
    activeHolds: number;
    activeInvites: number;
    seatsLeft: number;
  };
  waitlist: {
    total: number;
    invited: number;
    used: number;
  };
  rightNow: {
    notStarted: number;
    english: number;
    math: number;
    break: number;
    reading: number;
    science: number;
    finished: number;
  };
  results: {
    releaseAt: string;
    status: "released" | "not released";
    releasedAt: string | null;
    scored: number;
  };
  alerts: Alert[];
  students: Student[];
};

const STATUS_OPTIONS = [
  "all",
  "not started",
  "english",
  "math",
  "break",
  "reading",
  "science",
  "finished",
] as const;

function pacific(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function relative(value: string | null, nowMs: number) {
  if (!value) return "—";
  const diffSeconds = Math.round((new Date(value).getTime() - nowMs) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 10) return "just now";
  if (abs < 60) return (diffSeconds < 0 ? abs + "s ago" : "in " + abs + "s");
  const minutes = Math.round(abs / 60);
  if (minutes < 60) {
    return diffSeconds < 0 ? minutes + " min ago" : "in " + minutes + " min";
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return diffSeconds < 0 ? hours + " hr ago" : "in " + hours + " hr";
  }
  const days = Math.round(hours / 24);
  return diffSeconds < 0 ? days + "d ago" : "in " + days + "d";
}

function duration(seconds: number | null) {
  if (seconds == null) return "—";
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return minutes + ":" + String(secs).padStart(2, "0");
}

function countdown(value: string, nowMs: number) {
  const total = Math.max(0, Math.floor((new Date(value).getTime() - nowMs) / 1000));
  if (total <= 0) return "release time reached";
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return days + "d " + hours + "h " + minutes + "m";
  return hours + "h " + minutes + "m " + seconds + "s";
}

function timeBlock(value: string | null, nowMs: number) {
  return (
    <span className={styles.timeBlock}>
      <span>{pacific(value)}</span>
      <small>{relative(value, nowMs)}</small>
    </span>
  );
}

function escapeCsv(value: string | number | null | undefined) {
  const raw = value == null ? "" : String(value);
  return '"' + raw.replaceAll('"', '""') + '"';
}

export default function MockTestLiveConsole({
  slug,
  initialOverview,
}: {
  slug: string;
  initialOverview: Overview;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [timeZoneFilter, setTimeZoneFilter] = useState("all");
  const [alertOnly, setAlertOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionConfirm, setActionConfirm] = useState("");
  const [actionValue, setActionValue] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [inviteResults, setInviteResults] = useState<Array<{ email: string; link: string }>>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditAction, setAuditAction] = useState("");
  const [auditAdmin, setAuditAdmin] = useState("");

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setOverview(initialOverview);
    setSelectedId(null);
  }, [initialOverview, slug]);

  useEffect(() => {
    if (paused) return;

    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          "/api/admin/mock-test/live?slug=" + encodeURIComponent(slug),
          { cache: "no-store" }
        );
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || "Could not refresh admin data.");
        }
        if (!cancelled) {
          setOverview(body.overview);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Could not refresh admin data."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const id = window.setInterval(() => void refresh(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [paused, slug]);

  const timeZones = useMemo(
    () =>
      Array.from(new Set(overview.students.map((student) => student.timeZone))).sort(),
    [overview.students]
  );

  const students = useMemo(() => {
    const query = search.trim().toLowerCase();
    return overview.students.filter((student) => {
      if (query && !student.email.toLowerCase().includes(query)) return false;
      if (statusFilter !== "all" && student.status !== statusFilter) return false;
      if (timeZoneFilter !== "all" && student.timeZone !== timeZoneFilter) return false;
      if (alertOnly && student.alerts.length === 0) return false;
      return true;
    });
  }, [overview.students, search, statusFilter, timeZoneFilter, alertOnly]);

  const selected =
    overview.students.find((student) => student.registrationId === selectedId) ?? null;

  function openStudent(registrationId?: string) {
    if (!registrationId) return;
    setSelectedId(registrationId);
  }

  function exportCsv() {
    const rows = [
      [
        "email",
        "time zone",
        "paid",
        "status",
        "time left seconds",
        "last saved Pacific",
        "alerts",
      ],
      ...students.map((student) => [
        student.email,
        student.timeZone,
        student.paymentStatus,
        student.status,
        student.timeLeftSeconds ?? "",
        student.lastSavedAt ? pacific(student.lastSavedAt) : "",
        student.alerts.map((alert) => alert.type).join("|"),
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aced-mock-" + slug + "-students.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function refreshOverviewNow() {
    const response = await fetch(
      "/api/admin/mock-test/live?slug=" + encodeURIComponent(slug),
      { cache: "no-store" }
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not refresh admin data.");
    setOverview(body.overview);
  }

  async function refreshAudit() {
    const params = new URLSearchParams({ slug });
    if (auditAction.trim()) params.set("action", auditAction.trim());
    if (auditAdmin.trim()) params.set("admin", auditAdmin.trim());
    const response = await fetch("/api/admin/mock-test/audit?" + params.toString(), {
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load audit log.");
    setAuditEntries(body.entries ?? []);
  }

  function openAction(kind: AdminActionKind, student?: Student) {
    const titles: Record<AdminActionKind, string> = {
      seat_limit: "change seat limit",
      signups: overview.test.signupsPaused ? "resume new signups" : "pause new signups",
      invite: "invite next students",
      add_time: "add time to current section",
      reopen_start: "reopen test start",
      reset_attempt: "reset attempt",
      release: "run release job now",
    };
    setActionDialog({ kind, title: titles[kind], student });
    setActionReason("");
    setActionConfirm("");
    setActionMessage(null);
    if (kind === "seat_limit") setActionValue(String(overview.test.seatLimit));
    else if (kind === "invite") setActionValue("1");
    else if (kind === "add_time") setActionValue("5");
    else if (kind === "reopen_start") {
      const future = new Date(Date.now() + 60 * 60 * 1000);
      const local = new Date(future.getTime() - future.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
      setActionValue(local);
    } else setActionValue("");
  }

  async function submitAdminAction() {
    if (!actionDialog || actionReason.trim().length < 3) return;

    const base = {
      slug,
      reason: actionReason.trim(),
    };
    let payload: Record<string, unknown>;

    if (actionDialog.kind === "seat_limit") {
      payload = {
        ...base,
        action: "set_seat_limit",
        seatLimit: Number(actionValue),
      };
    } else if (actionDialog.kind === "signups") {
      payload = {
        ...base,
        action: "set_signups_paused",
        paused: !overview.test.signupsPaused,
      };
    } else if (actionDialog.kind === "invite") {
      payload = {
        ...base,
        action: "invite_waitlist",
        count: Number(actionValue),
      };
    } else if (actionDialog.kind === "add_time") {
      payload = {
        ...base,
        action: "add_time",
        registrationId: actionDialog.student!.registrationId,
        minutes: Number(actionValue),
        confirmText: actionConfirm,
      };
    } else if (actionDialog.kind === "reopen_start") {
      payload = {
        ...base,
        action: "reopen_start",
        registrationId: actionDialog.student!.registrationId,
        until: new Date(actionValue).toISOString(),
        confirmText: actionConfirm,
      };
    } else if (actionDialog.kind === "reset_attempt") {
      payload = {
        ...base,
        action: "reset_attempt",
        registrationId: actionDialog.student!.registrationId,
        confirmText: actionConfirm,
      };
    } else {
      payload = { ...base, action: "run_release" };
    }

    setActionBusy(true);
    setActionMessage(null);
    try {
      const response = await fetch("/api/admin/mock-test/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Admin action failed.");

      if (actionDialog.kind === "invite") {
        setInviteResults(body.result?.invitations ?? []);
      }
      setActionMessage("Action completed successfully.");
      await refreshOverviewNow();
      await refreshAudit();
      setActionDialog(null);
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : "Admin action failed."
      );
    } finally {
      setActionBusy(false);
    }
  }

  const dangerousAction = Boolean(
    actionDialog?.kind === "add_time" ||
      actionDialog?.kind === "reopen_start" ||
      actionDialog?.kind === "reset_attempt"
  );
  const dangerousConfirmed =
    !dangerousAction ||
    actionConfirm.trim().toLowerCase() ===
      actionDialog?.student?.email.trim().toLowerCase();

  useEffect(() => {
    void refreshAudit();
    // Filters intentionally drive the audit query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, auditAction, auditAdmin]);

  return (
    <>
      <div className={styles.liveToolbar}>
        <div>
          <strong>{paused ? "polling paused" : loading ? "refreshing…" : "live"}</strong>
          <span>
            updated {relative(overview.updatedAt, nowMs)} · {pacific(overview.updatedAt)}
          </span>
          {loadError ? <span className={styles.loadError}>{loadError}</span> : null}
        </div>
        <button type="button" onClick={() => setPaused((value) => !value)}>
          {paused ? "resume" : "pause"}
        </button>
      </div>

      {overview.alerts.length > 0 ? (
        <section
          className={styles.alertPanel}
          data-critical={
            overview.alerts.some((alert) =>
              ["release_job_late", "release_job_failed"].includes(alert.type)
            )
              ? "true"
              : undefined
          }
          aria-labelledby="alerts-title"
        >
          <div className={styles.panelHeading}>
            <div>
              <div className={styles.label}>ALERTS</div>
              <h2 id="alerts-title">{overview.alerts.length} need attention</h2>
            </div>
          </div>
          <div className={styles.alertList}>
            {overview.alerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                className={styles.alertRow}
                data-severity={alert.severity}
                onClick={() => openStudent(alert.registrationId)}
                disabled={!alert.registrationId}
              >
                <span className={styles.alertDot} aria-hidden="true" />
                <span>{alert.label}</span>
                {alert.registrationId ? <span aria-hidden="true">→</span> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.statGrid}>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>SEATS</div>
          <div className={styles.statPrimary}>
            {overview.seats.paid} <small>/ {overview.test.seatLimit}</small>
          </div>
          <div className={styles.statLines}>
            <span>{overview.seats.activeHolds} active checkout holds</span>
            <span>{overview.seats.activeInvites} active invite holds</span>
            <span>{overview.seats.seatsLeft} seats left</span>
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statLabel}>WAITLIST</div>
          <div className={styles.statPrimary}>{overview.waitlist.total}</div>
          <div className={styles.statLines}>
            <span>{overview.waitlist.invited} invited</span>
            <span>{overview.waitlist.used} invites used</span>
          </div>
        </article>

        <article className={styles.statCard + " " + styles.rightNowCard}>
          <div className={styles.statLabel}>RIGHT NOW</div>
          <div className={styles.statusCounts}>
            <span><b>{overview.rightNow.notStarted}</b> not started</span>
            <span data-section="english"><b>{overview.rightNow.english}</b> English</span>
            <span data-section="math"><b>{overview.rightNow.math}</b> Math</span>
            <span><b>{overview.rightNow.break}</b> break</span>
            <span data-section="reading"><b>{overview.rightNow.reading}</b> Reading</span>
            <span data-section="science"><b>{overview.rightNow.science}</b> Science</span>
            <span><b>{overview.rightNow.finished}</b> finished</span>
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statLabel}>RESULTS</div>
          <div className={styles.releaseCountdown}>
            {overview.results.status === "released"
              ? "released"
              : countdown(overview.results.releaseAt, nowMs)}
          </div>
          <div className={styles.statLines}>
            <span>
              {overview.results.releasedAt
                ? "released " + pacific(overview.results.releasedAt) +
                  " · " + relative(overview.results.releasedAt, nowMs)
                : "scheduled " + pacific(overview.results.releaseAt) +
                  " · " + relative(overview.results.releaseAt, nowMs)}
            </span>
            <span>{overview.results.scored} scored</span>
          </div>
        </article>
      </section>

      <section className={styles.adminActionsPanel} aria-labelledby="admin-actions-title">
        <div className={styles.studentsHeader}>
          <div>
            <div className={styles.label}>ADMIN ACTIONS</div>
            <h2 id="admin-actions-title">test controls</h2>
          </div>
          <span className={styles.actionState}>
            signups {overview.test.signupsPaused ? "paused" : "open"}
          </span>
        </div>

        <div className={styles.actionGrid}>
          <div className={styles.todoAction}>
            <b>seat cap</b>
            <span>{overview.test.seatLimit} · fixed for this event</span>
          </div>
          <button type="button" onClick={() => openAction("signups")}>
            <b>{overview.test.signupsPaused ? "resume signups" : "pause signups"}</b>
            <span>paid students are unaffected</span>
          </button>
          <button type="button" onClick={() => openAction("invite")}>
            <b>invite waitlist</b>
            <span>oldest uninvited students first</span>
          </button>
          <button
            type="button"
            onClick={() => openAction("release")}
            disabled={nowMs < new Date(overview.results.releaseAt).getTime()}
          >
            <b>run release job now</b>
            <span>
              {nowMs < new Date(overview.results.releaseAt).getTime()
                ? "available after release time"
                : "idempotent · safe to press twice"}
            </span>
          </button>
          <div className={styles.todoAction}>
            <b>Stripe refunds</b>
            <span>automatic no-seat refunds appear in each student row</span>
          </div>
        </div>

        {actionMessage ? (
          <div className={styles.actionMessage}>{actionMessage}</div>
        ) : null}

        {inviteResults.length > 0 ? (
          <div className={styles.inviteResults}>
            <div className={styles.label}>LATEST INVITES</div>
            {inviteResults.map((invite) => (
              <div key={invite.email}>
                <span>{invite.email}</span>
                <code>{invite.link}</code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(invite.link)}
                >
                  copy
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.studentsPanel} aria-labelledby="students-title">
        <div className={styles.studentsHeader}>
          <div>
            <div className={styles.label}>STUDENTS</div>
            <h2 id="students-title">{students.length} shown</h2>
          </div>
          <button type="button" className={styles.exportButton} onClick={exportCsv}>
            export CSV
          </button>
        </div>

        <div className={styles.filters}>
          <label>
            <span>Search email</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="student@example.com"
            />
          </label>
          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as (typeof STATUS_OPTIONS)[number])
              }
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Time zone</span>
            <select
              value={timeZoneFilter}
              onChange={(event) => setTimeZoneFilter(event.target.value)}
            >
              <option value="all">all</option>
              {timeZones.map((timeZone) => (
                <option key={timeZone} value={timeZone}>{timeZone}</option>
              ))}
            </select>
          </label>
          <label className={styles.checkFilter}>
            <input
              type="checkbox"
              checked={alertOnly}
              onChange={(event) => setAlertOnly(event.target.checked)}
            />
            <span>has alert</span>
          </label>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.studentTable}>
            <thead>
              <tr>
                <th>email</th>
                <th>time zone</th>
                <th>paid</th>
                <th>status</th>
                <th>time left</th>
                <th>answered</th>
                <th>last saved</th>
                <th>alerts</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr
                  key={student.registrationId}
                  onClick={() => setSelectedId(student.registrationId)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(student.registrationId);
                    }
                  }}
                >
                  <td data-label="email">{student.email}</td>
                  <td data-label="time zone">{student.timeZone}</td>
                  <td data-label="paid">{student.paymentStatus}</td>
                  <td data-label="status">
                    <span className={styles.statusText} data-status={student.status}>
                      {student.status}
                    </span>
                  </td>
                  <td data-label="time left">{duration(student.timeLeftSeconds)}</td>
                  <td data-label="answered">
                    {student.currentTotal == null
                      ? "—"
                      : student.answeredCurrent + "/" + student.currentTotal}
                  </td>
                  <td data-label="last saved">{timeBlock(student.lastSavedAt, nowMs)}</td>
                  <td data-label="alerts">
                    <span className={styles.alertIcons}>
                      {student.alerts.length ? "⚠ " + student.alerts.length : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {students.length === 0 ? (
            <div className={styles.emptyTable}>No students match these filters.</div>
          ) : null}
        </div>
      </section>

      <section className={styles.auditPanel} aria-labelledby="audit-title">
        <div className={styles.studentsHeader}>
          <div>
            <div className={styles.label}>AUDIT LOG</div>
            <h2 id="audit-title">{auditEntries.length} entries</h2>
          </div>
        </div>
        <div className={styles.auditFilters}>
          <label>
            <span>action</span>
            <input
              value={auditAction}
              onChange={(event) => setAuditAction(event.target.value)}
              placeholder="add_time"
            />
          </label>
          <label>
            <span>admin</span>
            <input
              value={auditAdmin}
              onChange={(event) => setAuditAdmin(event.target.value)}
              placeholder="owner@example.com"
            />
          </label>
        </div>
        <div className={styles.auditList}>
          {auditEntries.map((entry) => (
            <article key={entry.id}>
              <div>
                <b>{entry.action.replaceAll("_", " ")}</b>
                <span>{entry.adminEmail}</span>
              </div>
              <p>{entry.reason}</p>
              <small>
                {pacific(entry.createdAt)} · {relative(entry.createdAt, nowMs)} · target {entry.target}
              </small>
            </article>
          ))}
          {auditEntries.length === 0 ? (
            <div className={styles.emptyTable}>No audit entries match these filters.</div>
          ) : null}
        </div>
      </section>

      {actionDialog ? (
        <div className={styles.actionDialogBackdrop} role="presentation">
          <div
            className={styles.actionDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-action-dialog-title"
          >
            <div className={styles.actionDialogHeader}>
              <div>
                <div className={styles.label}>CONFIRM ADMIN ACTION</div>
                <h2 id="admin-action-dialog-title">{actionDialog.title}</h2>
                {actionDialog.student ? <p>{actionDialog.student.email}</p> : null}
              </div>
              <button
                type="button"
                aria-label="Close action dialog"
                onClick={() => setActionDialog(null)}
              >
                ×
              </button>
            </div>

            <div className={styles.actionDialogBody}>
              {actionDialog.kind === "seat_limit" ? (
                <label>
                  <span>new seat limit</span>
                  <input
                    type="number"
                    min={overview.seats.paid}
                    value={actionValue}
                    onChange={(event) => setActionValue(event.target.value)}
                  />
                  <small>Cannot go below {overview.seats.paid} paid students.</small>
                </label>
              ) : null}

              {actionDialog.kind === "invite" ? (
                <label>
                  <span>number to invite</span>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={actionValue}
                    onChange={(event) => setActionValue(event.target.value)}
                  />
                  <small>Invites reserve available seats without changing the cap.</small>
                </label>
              ) : null}

              {actionDialog.kind === "add_time" ? (
                <label>
                  <span>minutes to add</span>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={actionValue}
                    onChange={(event) => setActionValue(event.target.value)}
                  />
                </label>
              ) : null}

              {actionDialog.kind === "reopen_start" ? (
                <label>
                  <span>allow start until</span>
                  <input
                    type="datetime-local"
                    value={actionValue}
                    onChange={(event) => setActionValue(event.target.value)}
                  />
                </label>
              ) : null}

              {dangerousAction && actionDialog.student ? (
                <label>
                  <span>
                    type {actionDialog.student.email} to confirm
                  </span>
                  <input
                    value={actionConfirm}
                    onChange={(event) => setActionConfirm(event.target.value)}
                    autoComplete="off"
                  />
                </label>
              ) : null}

              <label>
                <span>reason · required</span>
                <textarea
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                  rows={3}
                  placeholder="Why is this change necessary?"
                />
              </label>

              {actionDialog.kind === "reset_attempt" ? (
                <div className={styles.dangerNote}>
                  This deletes the student&apos;s attempt, section runs, and answers so they can start over. It is blocked after release or after they finish.
                </div>
              ) : null}

              {actionDialog.kind === "release" ? (
                <div className={styles.dialogNote}>
                  This calls the same idempotent release job used by the scheduled release. It cannot run before the release time.
                </div>
              ) : null}

              {actionMessage ? (
                <div className={styles.dialogError}>{actionMessage}</div>
              ) : null}
            </div>

            <div className={styles.actionDialogFooter}>
              <button type="button" onClick={() => setActionDialog(null)}>
                cancel
              </button>
              <button
                type="button"
                className={dangerousAction ? styles.dangerButton : styles.primaryAdminButton}
                onClick={() => void submitAdminAction()}
                disabled={
                  actionBusy ||
                  actionReason.trim().length < 3 ||
                  !dangerousConfirmed ||
                  ((actionDialog.kind === "seat_limit" ||
                    actionDialog.kind === "invite" ||
                    actionDialog.kind === "add_time" ||
                    actionDialog.kind === "reopen_start") &&
                    !actionValue)
                }
              >
                {actionBusy ? "working…" : "confirm action"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div
          className={styles.drawerBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedId(null);
          }}
        >
          <aside
            className={styles.studentDrawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-drawer-title"
          >
            <header className={styles.drawerHeader}>
              <div>
                <div className={styles.label}>STUDENT</div>
                <h2 id="student-drawer-title">{selected.email}</h2>
                <p>{selected.timeZone} · {selected.status}</p>
              </div>
              <button
                type="button"
                className={styles.closeDrawer}
                onClick={() => setSelectedId(null)}
                aria-label="Close student details"
              >
                ×
              </button>
            </header>

            <div className={styles.drawerBody}>
              <section>
                <h3>admin actions</h3>
                <div className={styles.studentActionGrid}>
                  <button
                    type="button"
                    onClick={() => openAction("add_time", selected)}
                    disabled={
                      !["english", "math", "reading", "science"].includes(selected.status)
                    }
                  >
                    ⚠ add time
                  </button>
                  <button
                    type="button"
                    onClick={() => openAction("reopen_start", selected)}
                    disabled={
                      selected.paymentStatus === "no" ||
                      Boolean(selected.startedAt)
                    }
                  >
                    ⚠ reopen start
                  </button>
                  <button
                    type="button"
                    onClick={() => openAction("reset_attempt", selected)}
                    disabled={
                      overview.test.status === "released" ||
                      Boolean(selected.finishedAt)
                    }
                  >
                    ⚠ reset attempt
                  </button>
                </div>
                {selected.startOverrideUntil ? (
                  <p className={styles.overrideNote}>
                    start override until {pacific(selected.startOverrideUntil)} ·{" "}
                    {relative(selected.startOverrideUntil, nowMs)}
                  </p>
                ) : null}
              </section>

              {selected.alerts.length ? (
                <section>
                  <h3>alerts</h3>
                  <div className={styles.drawerAlerts}>
                    {selected.alerts.map((alert) => (
                      <div key={alert.id} data-severity={alert.severity}>
                        {alert.label}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h3>timeline</h3>
                <div className={styles.timeline}>
                  <div><b>registered</b>{timeBlock(selected.registeredAt, nowMs)}</div>
                  <div><b>paid</b>{timeBlock(selected.paidAt, nowMs)}</div>
                  <div><b>started</b>{timeBlock(selected.startedAt, nowMs)}</div>
                  {selected.sections.map((section) => (
                    <div key={section.key}>
                      <b>{section.key} started</b>
                      {timeBlock(section.startedAt, nowMs)}
                      {section.completedAt ? (
                        <span className={styles.timelineSub}>
                          submitted {section.completionSource ? "by " + section.completionSource : ""}
                          {" · "}{pacific(section.completedAt)}
                          {" · "}{relative(section.completedAt, nowMs)}
                        </span>
                      ) : null}
                    </div>
                  ))}
                  {selected.breakStartedAt ? (
                    <div><b>break started</b>{timeBlock(selected.breakStartedAt, nowMs)}</div>
                  ) : null}
                  {selected.breakEndsAt ? (
                    <div><b>break ends</b>{timeBlock(selected.breakEndsAt, nowMs)}</div>
                  ) : null}
                  {selected.adminEvents.map((event, index) => (
                    <div key={event.action + event.createdAt + index}>
                      <b>admin · {event.action.replaceAll("_", " ")}</b>
                      {timeBlock(event.createdAt, nowMs)}
                      <span className={styles.timelineSub}>{event.reason}</span>
                    </div>
                  ))}
                  <div><b>finished</b>{timeBlock(selected.finishedAt, nowMs)}</div>
                </div>
              </section>

              <section>
                <h3>sections</h3>
                <div className={styles.sectionDetails}>
                  {selected.sections.map((section) => (
                    <div key={section.key}>
                      <strong data-section={section.key}>{section.key}</strong>
                      <span>{section.answeredCount}/{section.totalCount} answered</span>
                      <span>{section.syncedLateCount} synced late</span>
                      <span>{section.rejectedCount} rejected</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3>registration</h3>
                <dl className={styles.detailList}>
                  <div><dt>payment</dt><dd>{selected.paymentStatus}</dd></div>
                  <div><dt>Stripe payment</dt><dd>{selected.stripePaymentIntentId ?? selected.paymentReference ?? "—"}</dd></div>
                  <div><dt>refund</dt><dd>{selected.stripeRefundId ?? "—"}</dd></div>
                  <div><dt>refunded</dt><dd>{selected.refundedAt ? pacific(selected.refundedAt) : "—"}</dd></div>
                  <div><dt>refund reason</dt><dd>{selected.refundReason ?? "—"}</dd></div>
                  <div><dt>invite used</dt><dd>{selected.inviteUsed ? "yes" : "no"}</dd></div>
                  <div><dt>invited</dt><dd>{selected.invitedAt ? pacific(selected.invitedAt) + " · " + relative(selected.invitedAt, nowMs) : "—"}</dd></div>
                  <div><dt>recent clients</dt><dd>{selected.recentClients}</dd></div>
                </dl>
              </section>

              {selected.scores ? (
                <section>
                  <h3>released scores</h3>
                  <div className={styles.scoreGrid}>
                    <div><span>English</span><b>{selected.scores.english ?? "—"}</b></div>
                    <div><span>Math</span><b>{selected.scores.math ?? "—"}</b></div>
                    <div><span>Reading</span><b>{selected.scores.reading ?? "—"}</b></div>
                    <div><span>Science</span><b>{selected.scores.science ?? "—"}</b></div>
                    <div><span>Composite</span><b>{selected.scores.composite ?? "—"}</b></div>
                    <div><span>Percentile</span><b>{selected.scores.percentile == null ? "—" : selected.scores.percentile + "%"}</b></div>
                  </div>
                </section>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
