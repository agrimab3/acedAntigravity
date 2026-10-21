"use client";
import Link from "next/link";

import { useMemo, useState } from "react";

const SECTIONS = [
  { key: "english", label: "English", color: "#5DCAA5" },
  { key: "math", label: "Math", color: "#AFA9EC" },
  { key: "reading", label: "Reading", color: "#EF9F27" },
  { key: "science", label: "Science", color: "#F0997B" },
] as const;

type ScorePoint = {
  sessionId: string;
  sectionKey: string;
  score: number;
  completedAt: string;
};

type PointWithPosition = ScorePoint & { x: number; y: number };

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function smoothPath(points: PointWithPosition[]) {
  if (points.length < 2) return "";
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    const midpointX = (point.x + next.x) / 2;
    const midpointY = (point.y + next.y) / 2;
    path += ` Q ${point.x} ${point.y}, ${midpointX} ${midpointY}`;
  }
  const last = points[points.length - 1];
  path += ` T ${last.x} ${last.y}`;
  return path;
}

export default function ProgressScoreChart({ points, testCount }: { points: ScorePoint[]; testCount: number }) {
  const [filter, setFilter] = useState<"all" | string>("all");
  const [hovered, setHovered] = useState<PointWithPosition | null>(null);
  const showingRealTrend = testCount >= 2;
  const view = { width: 1040, height: 336, left: 58, right: 38, top: 26, bottom: 54 };
  const plotWidth = view.width - view.left - view.right;
  const plotHeight = view.height - view.top - view.bottom;

  const plotted = useMemo(() => {
    if (!showingRealTrend) return [] as PointWithPosition[];
    const selected = points.filter((point) => filter === "all" || point.sectionKey === filter);
    const dates = [...new Set(selected.map((point) => point.completedAt))].sort();
    const first = new Date(dates[0]).getTime();
    const last = new Date(dates[dates.length - 1]).getTime();
    return selected.map((point) => ({
      ...point,
      x: view.left + (last === first ? plotWidth / 2 : ((new Date(point.completedAt).getTime() - first) / (last - first)) * plotWidth),
      y: view.top + ((36 - point.score) / 35) * plotHeight,
    }));
  }, [filter, points, plotHeight, plotWidth, showingRealTrend, view.left, view.top]);

  const bySection = SECTIONS.map((section) => ({
    ...section,
    points: plotted.filter((point) => point.sectionKey === section.key).sort((a, b) => a.completedAt.localeCompare(b.completedAt)),
  }));
  const xLabels = [...new Set(plotted.map((point) => point.completedAt))];
  const sampleLine = "M 92 230 C 236 208, 316 238, 454 182 S 730 150, 948 86";

  return <section style={{ borderRadius: "20px", background: "rgba(255,255,255,0.035)", border: "0.5px solid rgba(255,255,255,0.09)", padding: "1.2rem", overflow: "hidden" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "14px", flexWrap: "wrap", marginBottom: "14px" }}>
      <div>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.68)", letterSpacing: ".08em", textTransform: "uppercase" }}>Score over time</div>
        <p style={{ margin: "5px 0 0", color: "rgba(255,255,255,.52)", fontSize: "13px" }}>Section score estimates from completed practice tests</p>
      </div>
      <div aria-label="Score sections" style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
        {[{ key: "all", label: "all", color: "#F4F0E8" }, ...SECTIONS].map((section) => {
          const selected = filter === section.key;
          return <button key={section.key} type="button" onClick={() => { setFilter(section.key); setHovered(null); }} aria-pressed={selected} style={{ borderRadius: 999, border: `1px solid ${section.color}${selected ? "bb" : "38"}`, background: selected ? `${section.color}20` : "transparent", color: selected ? section.color : "rgba(255,255,255,.65)", padding: "7px 12px", cursor: "pointer", fontSize: "12px", textTransform: "capitalize" }}>{section.label}</button>;
        })}
      </div>
    </div>
    <div style={{ position: "relative", minHeight: 220 }}>
      <svg viewBox={`0 0 ${view.width} ${view.height}`} role="img" aria-label={showingRealTrend ? "Section score estimates over time" : "Sample score trend preview"} style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}>
        {[1, 12, 24, 36].map((score) => {
          const y = view.top + ((36 - score) / 35) * plotHeight;
          return <g key={score}><line x1={view.left} x2={view.width - view.right} y1={y} y2={y} stroke="rgba(255,255,255,.09)" strokeDasharray="4 8"/><text x={view.left - 14} y={y + 4} textAnchor="end" fill="rgba(255,255,255,.45)" fontSize="12">{score}</text></g>;
        })}
        {showingRealTrend ? bySection.map((section) => section.points.length ? <g key={section.key}>
          {section.points.length > 1 ? <path d={smoothPath(section.points)} fill="none" stroke={section.color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {section.points.map((point, pointIndex) => <g key={`${point.sessionId}-${point.sectionKey}`}>
            <circle cx={point.x} cy={point.y} r={pointIndex === section.points.length - 1 ? 7 : 4.5} fill={section.color} stroke="#0B1624" strokeWidth="3" style={{ cursor: "pointer" }} onMouseEnter={() => setHovered(point)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(point)} onBlur={() => setHovered(null)} tabIndex={0} aria-label={`${section.label}: ${point.score} on ${dateLabel(point.completedAt)}`} />
            {pointIndex === section.points.length - 1 ? <text x={point.x + 12} y={point.y + 4} fill={section.color} fontSize="14" fontWeight="700">{point.score}</text> : null}
          </g>)}
        </g> : null) : <g opacity=".3"><path d={sampleLine} fill="none" stroke="#5DCAA5" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="7 9"/><circle cx="948" cy="86" r="7" fill="#5DCAA5" /></g>}
        {showingRealTrend ? xLabels.map((date, index) => {
          const first = new Date(xLabels[0]).getTime(); const last = new Date(xLabels[xLabels.length - 1]).getTime();
          const x = view.left + (last === first ? plotWidth / 2 : ((new Date(date).getTime() - first) / (last - first)) * plotWidth);
          return <text key={date} x={x} y={view.height - 18} textAnchor="middle" fill="rgba(255,255,255,.45)" fontSize="12">{dateLabel(date)}</text>;
        }) : null}
      </svg>
      {hovered ? <div role="status" style={{ position: "absolute", left: `min(calc(${(hovered.x / view.width) * 100}% + 12px), calc(100% - 128px))`, top: `max(8px, calc(${(hovered.y / view.height) * 100}% - 48px))`, borderRadius: 10, padding: "8px 10px", background: "#101D2D", border: "1px solid rgba(255,255,255,.14)", color: "#fff", fontSize: 12, boxShadow: "0 10px 25px rgba(0,0,0,.36)", pointerEvents: "none" }}><strong>{hovered.score}/36</strong><br /><span style={{ color: "rgba(255,255,255,.66)" }}>{dateLabel(hovered.completedAt)}</span></div> : null}
      {!showingRealTrend ? <div style={{ position: "absolute", inset: 0, zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: "20px" }}><div style={{ borderRadius: 14, padding: "12px 16px", background: "rgba(8,19,32,.94)", border: "1px solid rgba(93,202,165,.2)", color: "rgba(255,255,255,.88)", fontSize: "14px" }}>Take 2 practice tests to see your score trend ✦</div><Link href="/practice-tests" style={{ borderRadius: 999, background: "#5DCAA5", color: "#072019", padding: "10px 18px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>practice tests →</Link></div> : null}
    </div>
  </section>;
}
