import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireMockTestAdminPage } from "@/lib/admin/mockTestAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Student · ACED Admin", robots: { index: false, follow: false } };

type Rows = Record<string, unknown>[];
const PT = "America/Los_Angeles";
const when = (v: unknown) => v ? new Date(String(v)).toLocaleString("en-US", { timeZone: PT, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const mins = (s: unknown) => { const n = Number(s) || 0; return n >= 3600 ? `${Math.round((n / 3600) * 10) / 10} h` : n >= 60 ? `${Math.round(n / 60)} min` : `${n} sec`; };
const cap = (v: unknown) => { const t = String(v ?? ""); return t.charAt(0).toUpperCase() + t.slice(1); };
const SECTION_COLORS: Record<string, string> = { english: "#5DCAA5", math: "#AFA9EC", reading: "#EF9F27", science: "#F0997B" };

export default async function StudentDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireMockTestAdminPage();
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();
  const db = getDb();
  if (!db) throw new Error("Database unavailable.");
  const q = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows as Rows;

  const [user] = await q(sql`select id, email, name, preferred_name, grade_level, act_test_date, previous_act_score, target_act_score, email_opt_in, created_at, onboarding_completed_at, walkthrough_completed_at from users where id = ${userId} limit 1`);
  if (!user) notFound();

  const [drills, tests, mastery, mock, feedbackRows, welcome] = await Promise.all([
    q(sql`select ps.section_key, t.name as topic, ps.question_count, ps.correct_count, ps.accuracy_pct, ps.duration_seconds, ps.started_at, ps.completed_at
          from practice_sessions ps left join act_topics t on t.id = ps.topic_id
          where ps.user_id = ${userId} order by coalesce(ps.completed_at, ps.started_at) desc limit 200`),
    q(sql`select mode_key, format, status, total_question_count, answered_count, correct_count, accuracy_pct, composite_estimated_score, duration_seconds, started_at, completed_at
          from practice_test_sessions where user_id = ${userId} order by coalesce(completed_at, started_at) desc limit 100`),
    q(sql`select t.section_key, t.name, m.attempt_count, m.correct_count, m.mastery_pct, m.last_practiced_at
          from topic_mastery m join act_topics t on t.id = m.topic_id
          where m.user_id = ${userId} and m.attempt_count > 0 order by m.mastery_pct asc`),
    q(sql`select paid_at, refunded_at, started_at, finished_at, composite, created_at from mock_registrations where user_id = ${userId} order by created_at desc limit 1`),
    q(sql`select source, rating, tags, message, created_at from feedback where user_id = ${userId} order by created_at desc limit 50`),
    q(sql`select sent_at from mock_email_outbox where unique_key = ${"welcome:" + userId} limit 1`),
  ]);

  type Event = { at: unknown; color: string; title: string; detail: string };
  const events: Event[] = [
    { at: user.created_at, color: "#8EE0C4", title: "Signed up", detail: "Created an account with Google" },
    ...(user.onboarding_completed_at ? [{ at: user.onboarding_completed_at, color: "#8EE0C4", title: "Finished setup", detail: "Profile and test date saved" }] : []),
    ...(user.walkthrough_completed_at ? [{ at: user.walkthrough_completed_at, color: "#8EE0C4", title: "Finished or skipped the tour", detail: "" }] : []),
    ...drills.map((d) => ({
      at: d.completed_at ?? d.started_at,
      color: SECTION_COLORS[String(d.section_key)] ?? "#B4BCC8",
      title: `${cap(d.section_key)} practice${d.topic ? ` · ${d.topic}` : ""}${d.completed_at ? "" : " (not finished)"}`,
      detail: `${d.correct_count ?? 0} of ${d.question_count ?? 0} correct (${d.accuracy_pct ?? 0}%) · ${mins(d.duration_seconds)}`,
    })),
    ...tests.map((t) => ({
      at: t.completed_at ?? t.started_at,
      color: "#AFA9EC",
      title: `Practice test · ${String(t.mode_key ?? t.format ?? "test").replace(/[-_]/g, " ")}${t.completed_at ? "" : ` (${t.status ?? "in progress"})`}`,
      detail: `${t.answered_count ?? 0}/${t.total_question_count ?? 0} answered · ${t.correct_count ?? 0} correct (${t.accuracy_pct ?? 0}%)${t.composite_estimated_score ? ` · estimate ${t.composite_estimated_score}` : ""} · ${mins(t.duration_seconds)}`,
    })),
    ...feedbackRows.map((f) => ({ at: f.created_at, color: "#EF9F27", title: `Left feedback${f.rating ? ` · ${f.rating}/5` : ""}`, detail: [f.tags, f.message].filter(Boolean).join(" · ") })),
    ...(mock[0]?.paid_at ? [{ at: mock[0].paid_at, color: "#F0997B", title: "Signed up for the Dec 5 mock test", detail: mock[0].refunded_at ? "Refunded" : "Paid $2" }] : []),
    ...(welcome[0]?.sent_at ? [{ at: welcome[0].sent_at, color: "#8D97A6", title: "Welcome email sent", detail: "" }] : []),
  ].filter((e) => e.at).sort((a, b) => new Date(String(b.at)).getTime() - new Date(String(a.at)).getTime());

  const totalQ = drills.reduce((s, d) => s + Number(d.question_count || 0), 0) + tests.reduce((s, t) => s + Number(t.answered_count || 0), 0);
  const totalCorrect = drills.reduce((s, d) => s + Number(d.correct_count || 0), 0) + tests.reduce((s, t) => s + Number(t.correct_count || 0), 0);
  const totalSecs = drills.reduce((s, d) => s + Number(d.duration_seconds || 0), 0) + tests.reduce((s, t) => s + Number(t.duration_seconds || 0), 0);
  const activeDays = new Set([...drills, ...tests].map((r) => r.completed_at ?? r.started_at).filter(Boolean).map((v) => new Date(String(v)).toLocaleDateString("en-CA", { timeZone: PT }))).size;
  const tile: React.CSSProperties = { border: "1px solid rgba(127,127,127,.28)", borderRadius: 16, padding: "14px 16px", background: "rgba(127,127,127,.08)" };
  const lab: React.CSSProperties = { fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", opacity: .7, fontWeight: 700 };
  const cell: React.CSSProperties = { padding: "9px 10px", borderTop: "1px solid rgba(127,127,127,.25)", fontSize: 14 };

  return <main className="policyPage"><article className="policyCard" style={{ maxWidth: 1100 }}>
    <p className="policyEyebrow"><Link href="/admin/students">← all students</Link></p>
    <h1 style={{ marginBottom: 4 }}>{String(user.preferred_name ?? user.name ?? "Student")}</h1>
    <p style={{ marginTop: 0, opacity: .75 }}>{String(user.email)} · grade {String(user.grade_level ?? "—")} · ACT {String(user.act_test_date ?? "—")} · previous score {String(user.previous_act_score ?? "—")} · emails {user.email_opt_in ? "on" : "off"}</p>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, margin: "18px 0 28px" }}>
      {[["Questions", totalQ], ["Accuracy", totalQ ? `${Math.round((totalCorrect / totalQ) * 100)}%` : "—"], ["Time studied", mins(totalSecs)], ["Drills", drills.length], ["Practice tests", tests.length], ["Days active", activeDays]].map(([k, v]) => <div key={String(k)} style={tile}><div style={lab}>{k}</div><div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{v}</div></div>)}
    </div>

    <h2>Activity</h2>
    {events.length ? <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {events.map((e, i) => <li key={i} style={{ display: "grid", gridTemplateColumns: "170px 14px 1fr", gap: 12, alignItems: "start", padding: "10px 0", borderTop: i ? "1px solid rgba(127,127,127,.18)" : 0 }}>
        <span style={{ fontSize: 13, opacity: .7 }}>{when(e.at)}</span>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: e.color, marginTop: 5 }} />
        <span><b style={{ fontSize: 15 }}>{e.title}</b>{e.detail ? <><br /><span style={{ fontSize: 14, opacity: .75 }}>{e.detail}</span></> : null}</span>
      </li>)}
    </ol> : <p>No activity yet.</p>}

    <h2 style={{ marginTop: 32 }}>Skills practiced ({mastery.length})</h2>
    {mastery.length ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr>{["Section", "Skill", "Mastery", "Correct", "Last practiced"].map((h) => <th key={h} style={{ ...cell, borderTop: 0, textAlign: "left", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", opacity: .7 }}>{h}</th>)}</tr></thead>
      <tbody>{mastery.map((m, i) => <tr key={i}>
        <td style={{ ...cell, color: SECTION_COLORS[String(m.section_key)] }}>{cap(m.section_key)}</td>
        <td style={cell}>{String(m.name)}</td>
        <td style={cell}><span style={{ display: "inline-block", width: 90, height: 8, borderRadius: 99, background: "rgba(127,127,127,.25)", verticalAlign: "middle", marginRight: 8 }}><span style={{ display: "block", height: 8, borderRadius: 99, width: `${Number(m.mastery_pct) || 0}%`, background: SECTION_COLORS[String(m.section_key)] ?? "#5DCAA5" }} /></span>{String(m.mastery_pct)}%</td>
        <td style={cell}>{String(m.correct_count)}/{String(m.attempt_count)}</td>
        <td style={cell}>{when(m.last_practiced_at)}</td>
      </tr>)}</tbody>
    </table></div> : <p>No skills practiced yet.</p>}
  </article></main>;
}
