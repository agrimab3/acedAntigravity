"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import LiveLessonsNavTab from "@/components/LiveLessonsNavTab";
import MockTestNavTab from "@/components/MockTestNavTab";
import NightSky from "@/components/NightSky";

type Option = { value: string; label: string };
type Profile = { email: string | null; googleName: string | null; preferredName: string | null; gradeLevel: string | null; actTestDate: string | null; previousActScore: number | null; hasRecommendations: boolean | null };
type Draft = { preferredName: string; gradeLevel: string; actTestDate: string; previousActScore: string };

const serif = "var(--font-playfair), Playfair Display, serif";
const card: React.CSSProperties = { background: "rgba(14,24,40,.92)", border: "1px solid #1F2C40", borderRadius: 20, padding: "24px 26px", marginTop: 18 };
const lab: React.CSSProperties = { fontSize: 12, letterSpacing: ".14em", fontWeight: 700, color: "#8D97A6", textTransform: "uppercase" };
const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "15px 0", borderTop: "1px solid #1A2638" };
const ghost: React.CSSProperties = { background: "transparent", border: "1px solid #2A3B52", color: "#B4BCC8", fontSize: 14, padding: "8px 16px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" };
const primary: React.CSSProperties = { border: 0, background: "#5DCAA5", color: "#072019", fontSize: 14, padding: "9px 18px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" };
const input: React.CSSProperties = { fontFamily: "inherit", fontSize: 15, background: "#0A1322", border: "1px solid #2A3B52", color: "#EEF1F5", borderRadius: 10, padding: "9px 12px", width: 220, maxWidth: "100%" };

function labelFor(options: Option[], value: string | null) {
  if (!value) return "—";
  return options.find((option) => option.value === value)?.label ?? value;
}

function daysUntil(date: string | null) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const diff = Math.ceil((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86400000);
  return diff >= 0 ? diff : null;
}

function hoursLabel(minutes: number) {
  if (minutes < 60) return { big: String(minutes), small: minutes === 1 ? "minute" : "minutes" };
  const hours = Math.round((minutes / 60) * 10) / 10;
  return { big: String(hours), small: hours === 1 ? "hour" : "hours" };
}

export default function AccountPage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gradeOptions, setGradeOptions] = useState<Option[]>([]);
  const [dateOptions, setDateOptions] = useState<Option[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stats, setStats] = useState<{ score: number | null; minutes: number; strong: number; lit: number }>({ score: null, minutes: 0, strong: 0, lit: 0 });
  const [mock, setMock] = useState<{ paid: boolean } | null>(null);
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const get = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    void Promise.all([get("/api/onboarding"), get("/api/progress"), get("/api/dashboard/summary"), get("/api/mock-test/registration-status"), get("/api/account/preferences"), get("/api/account/deletion-request")]).then(([onboarding, progress, summary, registration, preferences, deletion]) => {
      if (onboarding?.profile) { setProfile(onboarding.profile); setGradeOptions(onboarding.gradeOptions ?? []); setDateOptions(onboarding.testDateOptions ?? []); }
      setStats({ score: summary?.compositeEstimatedScore ?? null, minutes: progress?.totals?.totalMinutes ?? 0, strong: progress?.totals?.strongStars ?? 0, lit: progress?.totals?.litStars ?? 0 });
      if (registration) setMock({ paid: Boolean(registration.paid) });
      if (preferences) setEmailOptIn(Boolean(preferences.emailOptIn));
      if (deletion?.request) setDeletionStatus(deletion.request.status);
    });
  }, []);

  const name = profile?.preferredName || profile?.googleName?.split(" ")[0] || session?.user?.name?.split(" ")[0] || "Student";
  const email = profile?.email ?? session?.user?.email ?? "";
  const days = daysUntil(profile?.actTestDate ?? null);
  const time = hoursLabel(stats.minutes);

  const startEdit = () => { setNotice(""); setDraft({ preferredName: profile?.preferredName ?? name, gradeLevel: profile?.gradeLevel ?? "", actTestDate: profile?.actTestDate ?? "", previousActScore: profile?.previousActScore ? String(profile.previousActScore) : "" }); };

  const saveProfile = async () => {
    if (!draft || !profile) return;
    const prev = draft.previousActScore.trim();
    const prevNum = prev ? Number(prev) : null;
    if (prev && (!Number.isInteger(prevNum) || (prevNum as number) < 1 || (prevNum as number) > 36)) { setNotice("Previous score must be a whole number from 1 to 36."); return; }
    setSaving(true);
    const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferredName: draft.preferredName, gradeLevel: draft.gradeLevel, actTestDate: draft.actTestDate, previousActScore: prevNum, hasRecommendations: Boolean(profile.hasRecommendations) }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setSaving(false);
    if (response?.ok) { setProfile({ ...profile, preferredName: draft.preferredName.trim(), gradeLevel: draft.gradeLevel, actTestDate: draft.actTestDate, previousActScore: prevNum }); setDraft(null); setNotice("✦ Saved"); }
    else setNotice(data?.error ?? "We couldn’t save that. Try again.");
  };

  const toggleEmail = async () => {
    const next = !emailOptIn;
    const response = await fetch("/api/account/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emailOptIn: next }) }).catch(() => null);
    if (response?.ok) setEmailOptIn(next); else setNotice("We couldn’t save that preference.");
  };

  const requestDeletion = async () => {
    const response = await fetch("/api/account/deletion-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setConfirmDelete(false);
    if (response?.ok) setDeletionStatus(data?.status ?? data?.request?.status ?? "requested"); else setNotice("We couldn’t submit your request.");
  };

  const fields: { key: keyof Draft; label: string; view: string; edit: React.ReactNode }[] = [
    { key: "preferredName", label: "Name", view: name, edit: <input aria-label="Name" style={input} maxLength={40} value={draft?.preferredName ?? ""} onChange={(e) => setDraft((d) => d && { ...d, preferredName: e.target.value })} /> },
    { key: "gradeLevel", label: "Grade", view: labelFor(gradeOptions, profile?.gradeLevel ?? null), edit: <select aria-label="Grade" style={input} value={draft?.gradeLevel ?? ""} onChange={(e) => setDraft((d) => d && { ...d, gradeLevel: e.target.value })}><option value="" disabled>Pick one</option>{gradeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> },
    { key: "actTestDate", label: "ACT test date", view: labelFor(dateOptions, profile?.actTestDate ?? null), edit: <select aria-label="ACT test date" style={input} value={draft?.actTestDate ?? ""} onChange={(e) => setDraft((d) => d && { ...d, actTestDate: e.target.value })}><option value="" disabled>Pick one</option>{dateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> },
    { key: "previousActScore", label: "Previous ACT score", view: profile?.previousActScore ? String(profile.previousActScore) : "none yet", edit: <input aria-label="Previous ACT score" style={input} inputMode="numeric" placeholder="leave blank if none" value={draft?.previousActScore ?? ""} onChange={(e) => setDraft((d) => d && { ...d, previousActScore: e.target.value })} /> },
  ];

  const statTiles = [
    { label: "Estimated score", big: stats.score ? String(stats.score) : "—", small: "out of 36" },
    { label: "Test day", big: days === null ? "—" : String(days), small: days === null ? "pick a date" : days === 1 ? "day to go" : "days to go" },
    { label: "Time studied", big: time.big, small: time.small },
    { label: "Strong stars", big: String(stats.strong), small: `of ${stats.lit} lit` },
  ];

  return <main style={{ minHeight: "100vh", background: "#070B14", color: "#EEF1F5", fontFamily: "DM Sans, sans-serif", position: "relative" }}>
    <NightSky />
    <style>{`.acct-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:26px}@media(max-width:720px){.acct-stats{grid-template-columns:repeat(2,1fr)}.acct-row{flex-wrap:wrap}}`}</style>
    <div style={{ padding: "1.5rem", maxWidth: 1240, margin: "0 auto", position: "relative", zIndex: 1 }}>
      <nav style={{ display: "flex", alignItems: "center", gap: "2rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <Link href="/dashboard" style={{ fontFamily: "DM Serif Display, serif", fontSize: 26, color: "#fff", textDecoration: "none", marginRight: "auto" }}>Aced<em style={{ color: "#1D9E75" }}>.</em></Link>
        <Link href="/dashboard" style={{ color: "rgba(255,255,255,.78)", textDecoration: "none", fontSize: 17 }}>your universe</Link>
        <Link href="/practice-tests" style={{ color: "rgba(255,255,255,.78)", textDecoration: "none", fontSize: 17 }}>practice tests</Link>
        <Link href="/progress" style={{ color: "rgba(255,255,255,.78)", textDecoration: "none", fontSize: 17 }}>progress</Link>
        <LiveLessonsNavTab />
        <MockTestNavTab />
      </nav>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 0 80px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div aria-hidden="true" style={{ width: 84, height: 84, flexShrink: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: serif, fontSize: 38, fontWeight: 700, color: "#072019", background: "radial-gradient(circle at 35% 30%,#8EE0C4,#5DCAA5 60%,#3BA683)", boxShadow: "0 0 30px rgba(93,202,165,.33)" }}>{name.charAt(0).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontFamily: serif, fontSize: 40, fontWeight: 700 }}>{name}</h1>
            <div style={{ fontSize: 15, color: "#8D97A6", marginTop: 4, overflowWrap: "anywhere" }}>{email} · signed in with Google</div>
          </div>
        </div>

        <div className="acct-stats">
          {statTiles.map((t) => <div key={t.label} style={{ ...card, margin: 0, padding: "18px 20px" }}><div style={lab}>{t.label}</div><div style={{ fontFamily: serif, fontSize: 34, fontWeight: 700, marginTop: 6 }}>{t.big} <span style={{ fontSize: 15, color: "#8D97A6", fontFamily: "DM Sans, sans-serif", fontWeight: 400 }}>{t.small}</span></div></div>)}
        </div>

        <section style={card} aria-label="Your profile">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={lab}>Your profile</span>
            {draft ? <><button type="button" style={{ ...ghost, marginLeft: "auto" }} onClick={() => { setDraft(null); setNotice(""); }}>Cancel</button><button type="button" style={primary} disabled={saving} onClick={() => void saveProfile()}>{saving ? "Saving…" : "Save"}</button></> : <button type="button" style={{ ...ghost, marginLeft: "auto" }} onClick={startEdit} disabled={!profile}>Edit</button>}
          </div>
          <div style={{ marginTop: 8 }}>
            {fields.map((f, i) => <div key={f.key} className="acct-row" style={{ ...row, borderTop: i === 0 ? 0 : row.borderTop }}><span style={{ fontSize: 15, color: "#B4BCC8" }}>{f.label}</span>{draft ? f.edit : <span style={{ fontSize: 16, fontWeight: 600 }}>{f.view}</span>}</div>)}
          </div>
          {notice ? <div role="status" style={{ marginTop: 10, fontSize: 14, color: notice.startsWith("✦") ? "#8EE0C4" : "#F0A0A0" }}>{notice}</div> : null}
        </section>

        <section style={{ ...card, background: "linear-gradient(160deg,#12263B,#0E1828 60%)" }} aria-label="Aced Mock Test">
          <span style={{ ...lab, color: "#5DCAA5" }}>Aced Mock Test</span>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            <div><div style={{ fontFamily: serif, fontSize: 26, fontWeight: 700 }}>Sat, Dec 5</div><div style={{ fontSize: 14, color: "#8D97A6", marginTop: 4 }}>{mock?.paid ? "You’re in! Your seat and receipt were emailed to you." : "Full timed test · $2 · limited seats"}</div></div>
            {mock?.paid ? <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 999, background: "rgba(93,202,165,.14)", color: "#8EE0C4" }}>✓ signed up</span> : <Link href="/mock-test" style={{ ...primary, marginLeft: "auto", textDecoration: "none" }}>Sign up</Link>}
          </div>
        </section>

        <section style={card} aria-label="Emails">
          <span style={lab}>Emails</span>
          <div className="acct-row" style={{ ...row, borderTop: 0, marginTop: 8 }}>
            <div><div style={{ fontSize: 15, fontWeight: 600 }}>Aced updates & mock test dates</div><div style={{ fontSize: 13, color: "#8D97A6", marginTop: 3 }}>Optional. We’ll never sell your email.</div></div>
            <button type="button" role="switch" aria-checked={emailOptIn} aria-label="Email me Aced updates" onClick={() => void toggleEmail()} style={{ width: 46, height: 26, flexShrink: 0, borderRadius: 999, position: "relative", cursor: "pointer", border: 0, background: emailOptIn ? "#5DCAA5" : "#2A3B52", transition: "background .25s" }}><span style={{ position: "absolute", top: 3, left: emailOptIn ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .25s" }} /></button>
          </div>
          <div className="acct-row" style={row}>
            <div><div style={{ fontSize: 15, fontWeight: 600 }}>Account & receipt emails</div><div style={{ fontSize: 13, color: "#8D97A6", marginTop: 3 }}>Always on, like sign-in and payment receipts.</div></div>
            <span style={{ fontSize: 13, color: "#8D97A6" }}>always on</span>
          </div>
        </section>

        <section style={card} aria-label="Privacy and account">
          <span style={lab}>Privacy & account</span>
          <div className="acct-row" style={{ ...row, borderTop: 0, marginTop: 8 }}><span style={{ fontSize: 15, color: "#B4BCC8" }}>Terms and privacy policy</span><Link href="/legal" style={{ color: "#5DCAA5", fontSize: 14, textDecoration: "none" }}>open →</Link></div>
          <div className="acct-row" style={row}><span style={{ fontSize: 15, color: "#B4BCC8" }}>Need help?</span><a href="mailto:support@aceditprep.com" style={{ color: "#5DCAA5", fontSize: 14, textDecoration: "none" }}>support@aceditprep.com</a></div>
          <div className="acct-row" style={row}><span style={{ fontSize: 15, color: "#B4BCC8" }}>Sign out on this device</span><button type="button" style={ghost} onClick={() => void signOut({ callbackUrl: "/" })}>Sign out</button></div>
          <div className="acct-row" style={row}>
            <div><div style={{ fontSize: 15, color: "#B4BCC8" }}>Delete my account</div><div style={{ fontSize: 13, color: "#6B7585", marginTop: 3 }}>{deletionStatus ? `Request ${deletionStatus}. We’ll review it and email you.` : "We’ll review your request and email you. Nothing is deleted right away."}</div></div>
            {deletionStatus ? null : confirmDelete
              ? <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ fontSize: 13, color: "#F0A0A0" }}>Are you sure?</span><button type="button" style={ghost} onClick={() => setConfirmDelete(false)}>Keep it</button><button type="button" style={{ ...primary, background: "#C2565F", color: "#fff" }} onClick={() => void requestDeletion()}>Yes, request</button></span>
              : <button type="button" style={{ ...ghost, borderColor: "#5A2A30", color: "#F0A0A0" }} onClick={() => setConfirmDelete(true)}>Request deletion</button>}
          </div>
        </section>
      </div>
    </div>
  </main>;
}
