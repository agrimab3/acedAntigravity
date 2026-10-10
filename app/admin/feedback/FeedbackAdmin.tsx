"use client";
import { useEffect, useState } from "react";
type Row = { id: string; userId: string | null; createdAt: string; source: string; rating: number | null; tags: string[] | null; message: string | null; pagePath: string };
type Average = { source: string; average: number | null; count: number };
export default function FeedbackAdmin() {
  const [source, setSource] = useState("");
  const [rating, setRating] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [averages, setAverages] = useState<Average[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams();
    if (source) params.set("source", source);
    if (rating) params.set("rating", rating);
    fetch("/api/admin/feedback?" + params, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("Could not load feedback"); return r.json(); }).then(d => { setRows(d.rows); setAverages(d.averages); }).catch(e => setError(String(e)));
  }, [source, rating]);
  return <main style={{ minHeight: "100vh", background: "#0b1522", color: "#e5edf5", padding: 32 }}>
    <a href="/admin/mock-test" style={{ color: "#5DCAA5" }}>← Mock Test admin</a>
    <h1>Beta feedback</h1>
    <nav style={{ display: "flex", gap: 14, marginBottom: 20 }}><a href="/admin/mock-test" style={{ color: "#5DCAA5" }}>Live console</a><strong>Feedback</strong></nav>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>{averages.map(a => <div key={a.source} style={{ padding: 16, background: "#17263a", borderRadius: 10 }}>{a.source}: {a.average == null ? "—" : a.average.toFixed(2)} / 5 ({a.count})</div>)}</div>
    <label>Source <select value={source} onChange={e => setSource(e.target.value)}><option value="">All</option>{["mock_test","practice_session","practice_test","page_footer"].map(v => <option key={v}>{v}</option>)}</select></label>{" "}
    <label>Rating <select value={rating} onChange={e => setRating(e.target.value)}><option value="">All</option>{[1,2,3,4,5].map(v => <option key={v}>{v}</option>)}</select></label>
    {error && <p role="alert">{error}</p>}
    <div style={{ overflowX: "auto", marginTop: 18 }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}><thead><tr>{["Date","Source","Rating","Tags","Message","Page","Account"].map(v => <th key={v} style={{ padding: 10, borderBottom: "1px solid #34495a" }}>{v}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>{[new Date(row.createdAt).toLocaleString(), row.source, row.rating ?? "—", row.tags?.join(", ") ?? "—", row.message ?? "—", row.pagePath].map((v,i) => <td key={i} style={{ padding: 10, borderBottom: "1px solid #243348", maxWidth: 320, overflowWrap: "anywhere" }}>{v}</td>)}<td>{row.userId ? <a style={{ color: "#5DCAA5" }} href={`/admin/mock-test?userId=${encodeURIComponent(row.userId)}`}>View account</a> : "Anonymous"}</td></tr>)}</tbody></table></div>
  </main>;
}
