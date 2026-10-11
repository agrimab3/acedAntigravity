"use client";
import { useState } from "react";

type Source = "mock_test" | "practice_session" | "practice_test" | "page_footer";
const colors = ["#5DCAA5","#AFA9EC","#EF9F27","#F0997B","#5DCAA5"];
const words = ["tap a star","rough","meh","okay","good","loved it"];
const options = ["the timer","a confusing question","the calculator","the break","something broke","nope, all good"];
export default function FeedbackForm({ source, contextId, compact = false }: { source: Source; contextId?: string | null; compact?: boolean }) {
  const [rating, setRating] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canSend = rating !== null || tags.length > 0 || message.trim().length > 0;
  const toggle = (tag: string) => setTags(current => current.includes(tag) ? current.filter(t => t !== tag) : tag === "nope, all good" ? [tag] : [...current.filter(t => t !== "nope, all good"), tag]);
  async function submit() {
    if (!canSend || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, contextId: contextId ?? null, pagePath: location.pathname, rating, tags: compact ? null : tags, message }) });
      if (!response.ok) throw new Error("Couldn't save feedback. Please try again.");
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save feedback."); }
    finally { setBusy(false); }
  }
  return <section style={{ background: "#101c2b", border: "1px solid #29374b", borderRadius: 18, padding: compact ? 20 : 28, color: "#e9edf4", margin: "22px 0", fontFamily: "DM Sans, sans-serif" }}>
    {sent ? <div style={{ textAlign: "center", padding: 20 }}><div style={{ fontSize: 38, color: "#5DCAA5", textShadow: "0 0 20px #5DCAA5" }}>✦</div><h2 style={{ fontFamily: "var(--font-dm-serif),serif", fontSize: 28 }}>thank you!</h2><p>You just helped make the next {source === "mock_test" ? "mock test" : "Aced"} better.</p><button onClick={() => setSent(false)} style={{ color: "#5DCAA5", background: "none", border: 0, cursor: "pointer" }}>edit your feedback</button></div> : <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}><h2 style={{ fontFamily: "var(--font-dm-serif),serif", fontSize: 27, margin: 0 }}>rate your <em style={{ color: "#5DCAA5" }}>{source === "mock_test" ? "test" : "experience"}</em></h2>{!compact && <small style={{ color: "#9aa5b5" }}>Aced is in beta · takes 20 seconds · optional</small>}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "18px 0" }}>{colors.map((color, i) => <button key={i} type="button" aria-label={`${i+1} stars`} aria-pressed={rating === i+1} onClick={() => setRating(i+1)} style={{ fontSize: 30, color: rating !== null && i < rating ? color : "#2A3548", textShadow: rating !== null && i < rating ? `0 0 14px ${color}` : "none", background: "none", border: 0, cursor: "pointer", padding: 2 }}>✦</button>)}<span style={{ color: "#aab6c5", marginLeft: 8 }}>{words[rating ?? 0]}</span></div>
      {!compact && <><div style={{ fontSize: 11, letterSpacing: 1.4, color: "#aab6c5", marginBottom: 10 }}>ANYTHING FEEL OFF? TAP ANY</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>{options.map(tag => <button key={tag} onClick={() => toggle(tag)} aria-pressed={tags.includes(tag)} style={{ borderRadius: 20, padding: "7px 12px", background: tags.includes(tag) ? "#244d48" : "#19283a", border: "1px solid #34495a", color: "#d6e2ed", cursor: "pointer" }}>{tag}</button>)}</div></>}
      <textarea aria-label="Feedback message" maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} placeholder={source === "mock_test" ? "What should we fix or add? (e.g. Science Q12 had two right answers)" : "What should we fix or add?"} style={{ display: "block", width: "100%", boxSizing: "border-box", minHeight: 95, padding: 12, borderRadius: 10, background: "#0b1522", color: "white", border: "1px solid #34495a", resize: "vertical" }} />
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 14 }}><button disabled={!canSend || busy} onClick={() => void submit()} style={{ padding: "11px 20px", border: 0, borderRadius: 10, background: canSend ? "#5DCAA5" : "#485361", color: canSend ? "#07131c" : "#aab4bf", cursor: canSend ? "pointer" : "not-allowed" }}>{busy ? "sending…" : "send feedback ✦"}</button><small style={{ color: "#9aa5b5" }}>We read every one.</small></div>{error && <p role="alert" style={{ color: "#F0997B" }}>{error}</p>}
    </>}
  </section>;
}
