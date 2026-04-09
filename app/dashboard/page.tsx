"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { getTopicByName } from "@/lib/act-taxonomy";

type SectionKey = "english" | "math" | "reading" | "science";

type Point = {
  x: number;
  y: number;
  topicIndex?: number;
};

type Section = {
  key: SectionKey;
  name: string;
  color: string;
  cx: number;
  cy: number;
  label: string;
  topics: string[];
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  points: Point[];
  lines: Array<[number, number]>;
};

type Hit = { si: number; pi: number } | null;

const W = 1400;
const H = 700;
const BASE_STAR_COLOR = "#F4F0E8";
const BASE_CORE_COLOR = "#FFFDF8";
const DASHBOARD_GALAXY_BACKGROUND =
  "radial-gradient(circle at 18% 16%, rgba(74, 128, 178, 0.12), transparent 32%), radial-gradient(circle at 74% 24%, rgba(88, 138, 188, 0.08), transparent 34%), radial-gradient(circle at 52% 72%, rgba(120, 136, 182, 0.06), transparent 40%), linear-gradient(180deg,#0d1b2a 0%,#081221 44%,#020408 100%)";

const SECS: Section[] = [
  {
    key: "english",
    name: "ENGLISH",
    color: "#5DCAA5",
    cx: 255,
    cy: 178,
    label: "Gemini",
    topics: [
      "Organization & Flow",
      "Transitions & Cohesion",
      "Precision & Concision",
      "Style & Tone",
      "Punctuation",
      "Grammar & Usage",
      "Sentence Structure",
    ],
    box: { x: 92, y: 52, width: 330, height: 240 },
    points: [
      { x: 0.22, y: 0.12, topicIndex: 0 },
      { x: 0.56, y: 0.14, topicIndex: 1 },
      { x: 0.18, y: 0.34 },
      { x: 0.58, y: 0.34 },
      { x: 0.24, y: 0.58, topicIndex: 2 },
      { x: 0.53, y: 0.58, topicIndex: 3 },
      { x: 0.78, y: 0.42, topicIndex: 4 },
      { x: 0.91, y: 0.34, topicIndex: 5 },
      { x: 0.70, y: 0.76, topicIndex: 6 },
    ],
    lines: [
      [0, 1],
      [0, 2],
      [2, 4],
      [1, 3],
      [3, 5],
      [2, 3],
      [4, 5],
      [3, 6],
      [6, 7],
      [5, 8],
    ],
  },
  {
    key: "math",
    name: "MATH",
    color: "#AFA9EC",
    cx: 1065,
    cy: 186,
    label: "Aquarius",
    topics: [
      "Number & Quantity",
      "Algebra",
      "Functions",
      "Geometry",
      "Statistics & Probability",
      "Integrating Essential Skills",
      "Modeling",
    ],
    box: { x: 930, y: 38, width: 285, height: 280 },
    points: [
      { x: 0.72, y: 0.08, topicIndex: 0 },
      { x: 0.57, y: 0.22, topicIndex: 1 },
      { x: 0.43, y: 0.30 },
      { x: 0.59, y: 0.34, topicIndex: 2 },
      { x: 0.74, y: 0.39 },
      { x: 0.90, y: 0.36, topicIndex: 3 },
      { x: 0.30, y: 0.46 },
      { x: 0.16, y: 0.60, topicIndex: 4 },
      { x: 0.37, y: 0.83 },
      { x: 0.58, y: 0.88, topicIndex: 5 },
      { x: 0.80, y: 0.79, topicIndex: 6 },
    ],
    lines: [
      [0, 1],
      [1, 2],
      [1, 3],
      [3, 4],
      [4, 5],
      [2, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
    ],
  },
  {
    key: "reading",
    name: "READING",
    color: "#EF9F27",
    cx: 255,
    cy: 445,
    label: "Virgo",
    topics: ["Literary Narrative", "Social Science", "Humanities", "Natural Science"],
    box: { x: 88, y: 308, width: 290, height: 230 },
    points: [
      { x: 0.92, y: 0.10, topicIndex: 0 },
      { x: 0.76, y: 0.23 },
      { x: 0.60, y: 0.19 },
      { x: 0.43, y: 0.31, topicIndex: 1 },
      { x: 0.24, y: 0.33 },
      { x: 0.06, y: 0.30 },
      { x: 0.56, y: 0.50, topicIndex: 2 },
      { x: 0.63, y: 0.68, topicIndex: 3 },
      { x: 0.53, y: 0.84 },
      { x: 0.66, y: 0.93 },
      { x: 0.83, y: 0.88 },
      { x: 0.90, y: 0.73 },
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [3, 6],
      [6, 7],
      [7, 11],
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 11],
    ],
  },
  {
    key: "science",
    name: "SCIENCE",
    color: "#F0997B",
    cx: 1065,
    cy: 460,
    label: "Sagittarius",
    topics: ["Data Representation", "Research Summaries", "Conflicting Viewpoints"],
    box: { x: 860, y: 332, width: 380, height: 280 },
    points: [
      { x: 0.27, y: 0.10 },
      { x: 0.39, y: 0.18, topicIndex: 0 },
      { x: 0.61, y: 0.24 },
      { x: 0.74, y: 0.07, topicIndex: 1 },
      { x: 0.89, y: 0.14 },
      { x: 0.97, y: 0.21 },
      { x: 0.65, y: 0.45 },
      { x: 0.61, y: 0.71, topicIndex: 2 },
      { x: 0.40, y: 0.77 },
      { x: 0.20, y: 0.77 },
      { x: 0.03, y: 0.77 },
      { x: 0.35, y: 0.98 },
      { x: 0.86, y: 0.82 },
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [2, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [8, 11],
      [7, 12],
    ],
  },
];

function pointToCanvas(sec: Section, point: Point) {
  return {
    x: sec.box.x + point.x * sec.box.width,
    y: sec.box.y + point.y * sec.box.height,
  };
}

function getPointTopic(sec: Section, pointIndex: number) {
  const topicIndex = sec.points[pointIndex]?.topicIndex;
  if (topicIndex === undefined) return null;
  return sec.topics[topicIndex] ?? null;
}

function getTopicContext(sectionKey: SectionKey, topic: string) {
  return getTopicByName(sectionKey, topic)?.officialCategory ?? null;
}

function seededValue(seed: number) {
  const value = Math.sin(seed * 999.913) * 10000;
  return value - Math.floor(value);
}

function buildDashboardAmbientStars(count: number) {
  const columns = 11;
  const rows = Math.ceil(count / columns);

  return Array.from({ length: count }, (_, index) => {
    const seed = index + 1;
    const variant = index % 3;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const leftBase = ((column + 0.5) / columns) * 100;
    const topBase = ((row + 0.5) / rows) * 100;

    return {
      id: index,
      left: `${clampPercent(leftBase + (seededValue(seed) - 0.5) * 8, 2, 98)}%`,
      top: `${clampPercent(topBase + (seededValue(seed + 20) - 0.5) * 10, 2, 98)}%`,
      size: 0.7 + seededValue(seed + 40) * 2.2,
      opacity: 0.08 + seededValue(seed + 60) * 0.34,
      duration: 7 + seededValue(seed + 80) * 10,
      delay: seededValue(seed + 100) * 6,
      animationName:
        variant === 0
          ? "dashboardStarFloatA"
          : variant === 1
            ? "dashboardStarFloatB"
            : "dashboardStarFloatC",
    };
  });
}

function buildDashboardAmbientGlows(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const seed = index + 201;
    return {
      id: index,
      left: `${8 + seededValue(seed) * 84}%`,
      top: `${6 + seededValue(seed + 20) * 88}%`,
      size: 120 + seededValue(seed + 40) * 220,
      opacity: 0.04 + seededValue(seed + 60) * 0.08,
      duration: 16 + seededValue(seed + 80) * 16,
      delay: seededValue(seed + 100) * 5,
    };
  });
}

function clampPercent(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : normalized;

  const int = Number.parseInt(full, 16);

  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function mixColor(fromHex: string, toHex: string, amount: number) {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const t = clamp(amount, 0, 1);

  return {
    r: Math.round(from.r + (to.r - from.r) * t),
    g: Math.round(from.g + (to.g - from.g) * t),
    b: Math.round(from.b + (to.b - from.b) * t),
  };
}

function toRgba(
  color: { r: number; g: number; b: number } | string,
  alpha: number
) {
  const rgb = typeof color === "string" ? hexToRgb(color) : color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1)})`;
}

function getTopicMasteryPct(
  dashboardSummary: DashboardSummary | null,
  sectionKey: SectionKey,
  topicName: string | null
) {
  if (!dashboardSummary || !topicName) {
    return 0;
  }

  return (
    dashboardSummary.topicSummaries.find(
      (summary) => summary.sectionKey === sectionKey && summary.topicName === topicName
    )?.masteryPct ?? 0
  );
}

function getLineMasteryPct(
  dashboardSummary: DashboardSummary | null,
  section: Section,
  line: [number, number]
) {
  const topicNames = line
    .map((pointIndex) => getPointTopic(section, pointIndex))
    .filter((value): value is string => Boolean(value));

  if (topicNames.length === 0) {
    return 10;
  }

  const total = topicNames.reduce(
    (sum, topicName) => sum + getTopicMasteryPct(dashboardSummary, section.key, topicName),
    0
  );

  return total / topicNames.length;
}

function getStarVisualState({
  sectionColor,
  masteryPct,
  interactive,
  hovered,
  selected,
  pulse,
  twinkle,
}: {
  sectionColor: string;
  masteryPct: number;
  interactive: boolean;
  hovered: boolean;
  selected: boolean;
  pulse: number;
  twinkle: number;
}) {
  const mastery = clamp(masteryPct, 0, 100) / 100;
  const bodyColor = interactive
    ? mixColor(BASE_STAR_COLOR, "#FFFFFF", 0.18 + mastery * 0.2)
    : hexToRgb(sectionColor);
  const coreColor = interactive
    ? mixColor(BASE_CORE_COLOR, "#FFFFFF", 0.24 + mastery * 0.18)
    : hexToRgb(sectionColor);
  const haloColor = interactive
    ? mixColor("#FFFFFF", sectionColor, 0.16 + mastery * 0.16)
    : hexToRgb(sectionColor);
  const baseRadius = interactive ? 5.2 + mastery * 2.8 : 3.45;
  const radiusBoost = hovered ? 1.5 : selected ? 1.1 : 0;
  const radius = baseRadius + radiusBoost + (interactive ? pulse * 0.35 : 0);
  const haloRadius = interactive ? 16 + mastery * 18 + pulse * 3 + (hovered || selected ? 7 : 0) : 7;
  const haloAlpha = interactive ? 0.16 + mastery * 0.42 + (hovered || selected ? 0.12 : 0) : 0;
  const ringAlpha = interactive ? 0.18 + mastery * 0.4 + (hovered || selected ? 0.16 : 0) : 0;
  const bodyAlpha = interactive ? (0.72 + mastery * 0.28) * twinkle : 0.94 * twinkle;
  const coreRadius = interactive ? 1.15 + mastery * 0.95 : 1.22;
  const coreAlpha = interactive ? 0.76 + mastery * 0.24 : 1;
  const lineAlpha = 0.2 + mastery * 0.25;
  const lineWidth = 1.35 + mastery * 1.2;
  const mastered = masteryPct >= 95;
  const shimmerStrength = mastered ? 0.3 + 0.7 * pulse : 0;

  return {
    mastery,
    bodyColor,
    coreColor,
    haloColor,
    radius,
    haloRadius,
    haloAlpha,
    ringAlpha,
    bodyAlpha,
    coreRadius,
    coreAlpha,
    lineAlpha,
    lineWidth,
    mastered,
    shimmerStrength,
  };
}

type DashboardSummary = {
  compositeEstimatedScore: number;
  confidence: number;
  scoreLabel: string;
  scoreExplanation: string;
  sectionSummaries: Array<{
    sectionKey: string;
    estimatedScore: number;
    confidence: number;
    answeredCount: number;
    topicsAttempted: number;
    scoreLabel: string;
    scoreExplanation: string;
  }>;
  topicSummaries: Array<{
    sectionKey: string;
    topicName: string;
    masteryPct: number;
    estimatedScore: number;
    confidence: number;
    scoreLabel: string;
    scoreExplanation: string;
    totalAnswered: number;
  }>;
};

export default function Dashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [activeSec, setActiveSec] = useState<SectionKey | "all">("all");
  const [selected, setSelected] = useState<Hit>(null);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{
    x: number;
    y: number;
    topicName: string;
    masteryPct: number;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    activeSec: "all" as SectionKey | "all",
    selected: null as Hit,
    hovered: null as Hit,
  });
  const ambientStars = useMemo(
    () => buildDashboardAmbientStars(92),
    []
  );
  const ambientGlows = useMemo(
    () => buildDashboardAmbientGlows(7),
    []
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    stateRef.current.activeSec = activeSec;
  }, [activeSec]);

  useEffect(() => {
    stateRef.current.selected = selected;
  }, [selected]);

  useEffect(() => {
    if (!selected || !detailRef.current) return;
    requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [selected]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let active = true;

    const loadSummary = async () => {
      try {
        const res = await fetch("/api/dashboard/summary", {
          cache: "no-store",
        });

        if (!res.ok) {
          return;
        }

        const data = await res.json();

        if (active) {
          setDashboardSummary(data);
        }
      } catch (error) {
        console.error("Failed to load dashboard summary", error);
      }
    };

    void loadSummary();

    return () => {
      active = false;
    };
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const canvasNode = canvasRef.current;
    if (!canvasNode) return;
    const canvasEl: HTMLCanvasElement = canvasNode;

    const context = canvasEl.getContext("2d");
    if (!context) return;
    const ctx: CanvasRenderingContext2D = context;

    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = W * dpr;
    canvasEl.height = H * dpr;
    canvasEl.style.width = "100%";
    canvasEl.style.height = "auto";
    canvasEl.style.display = "block";
    canvasEl.style.border = "none";
    canvasEl.style.outline = "none";
    ctx.scale(dpr, dpr);

    function getCoords(e: MouseEvent) {
      const rect = canvasEl.getBoundingClientRect();
      return {
        mx: (e.clientX - rect.left) * (W / rect.width),
        my: (e.clientY - rect.top) * (H / rect.height),
      };
    }

    function hitTest(mx: number, my: number): Hit {
      const sectionFilter = stateRef.current.activeSec;
      const t = performance.now() * 0.001;

      for (let si = 0; si < SECS.length; si += 1) {
        const sec = SECS[si];
        if (sectionFilter !== "all" && sectionFilter !== sec.key) continue;

        const dx = Math.sin(t * 0.2 + si * 1.2) * 5;
        const dy = Math.cos(t * 0.15 + si * 1.1) * 4;

        for (let pi = 0; pi < sec.points.length; pi += 1) {
          if (sec.points[pi].topicIndex === undefined) continue;
          const p = pointToCanvas(sec, sec.points[pi]);
          if (Math.hypot(mx - p.x - dx, my - p.y - dy) < 18) return { si, pi };
        }
      }

      return null;
    }

    const onMove = (e: MouseEvent) => {
      const { mx, my } = getCoords(e);
      const hoveredHit = hitTest(mx, my);
      stateRef.current.hovered = hoveredHit;
      canvasEl.style.cursor = stateRef.current.hovered ? "pointer" : "default";

      if (hoveredHit) {
        const sec = SECS[hoveredHit.si];
        const topicName = getPointTopic(sec, hoveredHit.pi);

        if (topicName) {
          setHoverTooltip({
            x: e.clientX - canvasEl.getBoundingClientRect().left + 14,
            y: e.clientY - canvasEl.getBoundingClientRect().top - 10,
            topicName,
            masteryPct: getTopicMasteryPct(dashboardSummary, sec.key, topicName),
          });
          return;
        }
      }

      setHoverTooltip(null);
    };

    const onClick = (e: MouseEvent) => {
      const { mx, my } = getCoords(e);
      const hit = hitTest(mx, my);
      if (hit) setSelected(hit);
    };

    const onLeave = () => {
      stateRef.current.hovered = null;
      canvasEl.style.cursor = "default";
      setHoverTooltip(null);
    };

    canvasEl.addEventListener("mousemove", onMove);
    canvasEl.addEventListener("click", onClick);
    canvasEl.addEventListener("mouseleave", onLeave);

    let raf = 0;

    function draw(ts: number) {
      const t = ts * 0.001;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 1;

      const sectionFilter = stateRef.current.activeSec;
      const hovered = stateRef.current.hovered;
      const currentSelection = stateRef.current.selected;

      SECS.forEach((sec, si) => {
        const active = sectionFilter === "all" || sectionFilter === sec.key;
        const alpha = active ? 1 : 0.06;
        const dx = Math.sin(t * 0.18 + si * 1.3) * 5;
        const dy = Math.cos(t * 0.14 + si * 1.1) * 4;

        const glow = ctx.createRadialGradient(sec.cx + dx, sec.cy + dy, 0, sec.cx + dx, sec.cy + dy, 180);
        glow.addColorStop(0, `${sec.color}22`);
        glow.addColorStop(1, `${sec.color}00`);
        ctx.globalAlpha = alpha * 0.4;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sec.cx + dx, sec.cy + dy, 180, 0, Math.PI * 2);
        ctx.fill();

        sec.lines.forEach(([a, b]) => {
          const lineMastery = getLineMasteryPct(dashboardSummary, sec, [a, b]);
          const lineVisual = getStarVisualState({
            sectionColor: sec.color,
            masteryPct: lineMastery,
            interactive: true,
            hovered: false,
            selected: false,
            pulse: 0.8 + 0.2 * Math.sin(t * 1.3 + a + b),
            twinkle: 1,
          });
          const pa = pointToCanvas(sec, sec.points[a]);
          const pb = pointToCanvas(sec, sec.points[b]);
          ctx.globalAlpha = active ? lineVisual.lineAlpha : 0.08;
          ctx.strokeStyle = active ? sec.color : toRgba(sec.color, 0.16);
          ctx.lineWidth = lineVisual.lineWidth;
          ctx.shadowColor = active ? sec.color : toRgba(sec.color, 0.18);
          ctx.shadowBlur = active ? 10 + lineVisual.mastery * 12 : 0;
          ctx.beginPath();
          ctx.moveTo(pa.x + dx, pa.y + dy);
          ctx.lineTo(pb.x + dx, pb.y + dy);
          ctx.stroke();
        });
        ctx.shadowBlur = 0;

        sec.points.forEach((point, pi) => {
          const resolved = pointToCanvas(sec, point);
          const isHover = hovered?.si === si && hovered?.pi === pi;
          const isSelected = currentSelection?.si === si && currentSelection?.pi === pi;
          const isInteractive = point.topicIndex !== undefined;
          const topicName = getPointTopic(sec, pi);
          const masteryPct = isInteractive
            ? getTopicMasteryPct(dashboardSummary, sec.key, topicName)
            : 0;
          const twinkle = 0.8 + 0.2 * Math.sin(t * 1.1 + pi * 1.7 + si * 0.9);
          const pulse = isInteractive ? 0.82 + 0.18 * Math.sin(t * 2.2 + pi * 1.3 + si) : 1;
          const visual = getStarVisualState({
            sectionColor: sec.color,
            masteryPct,
            interactive: isInteractive,
            hovered: isHover,
            selected: isSelected,
            pulse,
            twinkle,
          });

          if (isInteractive) {
            const halo = ctx.createRadialGradient(
              resolved.x + dx,
              resolved.y + dy,
              0,
              resolved.x + dx,
              resolved.y + dy,
              visual.haloRadius
            );
            halo.addColorStop(0, toRgba(visual.haloColor, 0.72));
            halo.addColorStop(0.38, toRgba(visual.haloColor, 0.16 + visual.mastery * 0.16));
            halo.addColorStop(1, toRgba(visual.haloColor, 0));
            ctx.globalAlpha = alpha * visual.haloAlpha;
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(resolved.x + dx, resolved.y + dy, visual.haloRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = alpha * visual.ringAlpha;
            ctx.strokeStyle = toRgba(visual.haloColor, 0.95);
            ctx.lineWidth = isHover || isSelected ? 1.5 : 1;
            ctx.beginPath();
            ctx.arc(
              resolved.x + dx,
              resolved.y + dy,
              visual.radius + 5 + visual.mastery * 1.5 + pulse * 0.9,
              0,
              Math.PI * 2
            );
            ctx.stroke();
          } else {
            const supportGlow = ctx.createRadialGradient(
              resolved.x + dx,
              resolved.y + dy,
              0,
              resolved.x + dx,
              resolved.y + dy,
              visual.haloRadius
            );
            supportGlow.addColorStop(0, toRgba(visual.haloColor, 0.56));
            supportGlow.addColorStop(1, toRgba(visual.haloColor, 0));
            ctx.globalAlpha = alpha * 0.34;
            ctx.fillStyle = supportGlow;
            ctx.beginPath();
            ctx.arc(resolved.x + dx, resolved.y + dy, visual.haloRadius, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.globalAlpha = alpha * visual.bodyAlpha;
          ctx.shadowColor = isInteractive ? toRgba(visual.bodyColor, 0.95) : toRgba(sec.color, 0.9);
          ctx.shadowBlur = isHover || isSelected ? 34 : isInteractive ? 10 + visual.mastery * 20 : 11;
          ctx.fillStyle = toRgba(visual.bodyColor, 1);
          ctx.beginPath();
          ctx.arc(resolved.x + dx, resolved.y + dy, visual.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = toRgba(visual.coreColor, 1);
          ctx.shadowBlur = 0;
          ctx.globalAlpha = alpha * visual.coreAlpha * twinkle;
          ctx.beginPath();
          ctx.arc(resolved.x + dx, resolved.y + dy, visual.coreRadius, 0, Math.PI * 2);
          ctx.fill();

          if (isSelected) {
            const selectedPulse = 0.5 + 0.5 * Math.sin(t * 3.2);
            ctx.globalAlpha = alpha * (0.26 + 0.22 * selectedPulse + visual.mastery * 0.15);
            ctx.strokeStyle = toRgba(visual.bodyColor, 1);
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.arc(
              resolved.x + dx,
              resolved.y + dy,
              visual.radius + 7 + selectedPulse * 3,
              0,
              Math.PI * 2
            );
            ctx.stroke();
            ctx.globalAlpha = alpha * (0.08 + 0.12 * selectedPulse + visual.mastery * 0.06);
            ctx.beginPath();
            ctx.arc(
              resolved.x + dx,
              resolved.y + dy,
              visual.radius + 16 + selectedPulse * 4,
              0,
              Math.PI * 2
            );
            ctx.stroke();
          }

          if (visual.mastered) {
            const shimmer = 0.35 + 0.65 * Math.sin(t * 4 + pi * 1.9 + si);
            const sparkleRadius = visual.radius + 9 + visual.shimmerStrength * 3;
            ctx.globalAlpha = alpha * 0.22 * shimmer;
            ctx.strokeStyle = toRgba(visual.coreColor, 1);
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(resolved.x + dx - sparkleRadius, resolved.y + dy);
            ctx.lineTo(resolved.x + dx + sparkleRadius, resolved.y + dy);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(resolved.x + dx, resolved.y + dy - sparkleRadius);
            ctx.lineTo(resolved.x + dx, resolved.y + dy + sparkleRadius);
            ctx.stroke();
          }
        });

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        ctx.globalAlpha = alpha * 0.42;
        ctx.fillStyle = sec.color;
        ctx.font = "italic 15px serif";
        ctx.textAlign = "center";
        const lx = sec.cx + dx;
        const ly = sec.cy > 350 ? sec.cy + 126 : sec.cy - 116;
        ctx.globalAlpha = alpha * 0.88;
        ctx.font = "700 22px sans-serif";
        ctx.fillText(sec.name, lx, ly);
        ctx.globalAlpha = alpha * 0.42;
        ctx.font = "italic 15px serif";
        ctx.fillText(sec.label, lx, sec.cy > 350 ? ly + 20 : ly - 28);
        ctx.globalAlpha = 1;
      });

      ctx.globalAlpha = 0.09;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 122, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 158, 0, Math.PI * 2);
      ctx.stroke();
      const activeSectionKey = stateRef.current.activeSec;
      const centerSectionSummary =
        activeSectionKey !== "all"
          ? dashboardSummary?.sectionSummaries.find((summary) => summary.sectionKey === activeSectionKey)
          : null;
      const centerScoreLabel =
        centerSectionSummary?.estimatedScore?.toString() ??
        dashboardSummary?.compositeEstimatedScore?.toString() ??
        "--";
      const centerScoreTitle =
        activeSectionKey !== "all"
          ? `ESTIMATED ${activeSectionKey.toUpperCase()} SCORE`
          : "ESTIMATED ACT SCORE";
      const centerScoreLabelText =
        centerSectionSummary?.scoreLabel ?? dashboardSummary?.scoreLabel ?? "baseline estimate";
      const centerSubtitle =
        activeSectionKey !== "all"
          ? `${activeSectionKey} section`
          : "out of 36";
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "700 17px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(centerScoreTitle, W / 2, H / 2 - 40);
      ctx.globalAlpha = 0.88;
      ctx.font = "italic bold 58px serif";
      ctx.fillText(centerScoreLabel, W / 2, H / 2 + 16);
      ctx.globalAlpha = 0.16;
      ctx.font = "14px sans-serif";
      ctx.fillText(centerSubtitle, W / 2, H / 2 + 48);
      if (dashboardSummary) {
        ctx.globalAlpha = 0.3;
        ctx.font = "12px sans-serif";
        ctx.fillText(
          `${centerScoreLabelText} · estimate improves as you practice`,
          W / 2,
          H / 2 + 74
        );
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      canvasEl.removeEventListener("mousemove", onMove);
      canvasEl.removeEventListener("click", onClick);
      canvasEl.removeEventListener("mouseleave", onLeave);
    };
  }, [dashboardSummary, status]);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
  };

  const selSec = selected ? SECS[selected.si] : null;
  const selTopic = selected ? getPointTopic(SECS[selected.si], selected.pi) : null;
  const selTopicContext = selSec && selTopic ? getTopicContext(selSec.key, selTopic) : null;
  const selectedTopicSummary =
    selSec && selTopic
      ? dashboardSummary?.topicSummaries.find(
          (summary) => summary.sectionKey === selSec.key && summary.topicName === selTopic
        )
      : null;
  const selectedSectionSummary = selSec
    ? dashboardSummary?.sectionSummaries.find((summary) => summary.sectionKey === selSec.key)
    : null;

  if (status === "loading") {
    return (
      <div
        style={{
          background: DASHBOARD_GALAXY_BACKGROUND,
          minHeight: "100vh",
          color: "rgba(255,255,255,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "DM Sans,sans-serif",
        }}
      >
        loading your universe...
      </div>
    );
  }

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "#fff",
        fontFamily: "DM Sans,sans-serif",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @keyframes dashboardStarFloatA {
          0% { transform: translate3d(0, 0, 0) scale(0.92); opacity: 0.12; }
          50% { transform: translate3d(12px, -10px, 0) scale(1.08); opacity: 0.68; }
          100% { transform: translate3d(0, 0, 0) scale(0.92); opacity: 0.12; }
        }
        @keyframes dashboardStarFloatB {
          0% { transform: translate3d(0, 0, 0) scale(0.94); opacity: 0.1; }
          50% { transform: translate3d(-10px, -7px, 0) scale(1.04); opacity: 0.6; }
          100% { transform: translate3d(0, 0, 0) scale(0.94); opacity: 0.1; }
        }
        @keyframes dashboardStarFloatC {
          0% { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.1; }
          50% { transform: translate3d(8px, -14px, 0) scale(1.06); opacity: 0.62; }
          100% { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.1; }
        }
        @keyframes dashboardNebulaFloat {
          0% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.38; }
          50% { transform: translate(-50%, -50%) scale(1.05); opacity: 0.72; }
          100% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.38; }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background: DASHBOARD_GALAXY_BACKGROUND,
        }}
      />

      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1 }}>
        {ambientGlows.map((glow) => (
          <span
            key={`ambient-glow-${glow.id}`}
            style={{
              position: "absolute",
              left: glow.left,
              top: glow.top,
              width: `${glow.size}px`,
              height: `${glow.size}px`,
              borderRadius: "999px",
              transform: "translate(-50%, -50%)",
              background:
                glow.id % 3 === 0
                  ? "radial-gradient(circle, rgba(112, 188, 222, 0.12) 0%, rgba(112, 188, 222, 0.03) 48%, transparent 78%)"
                  : glow.id % 3 === 1
                    ? "radial-gradient(circle, rgba(176, 188, 236, 0.1) 0%, rgba(176, 188, 236, 0.025) 48%, transparent 80%)"
                    : "radial-gradient(circle, rgba(146, 196, 187, 0.09) 0%, rgba(146, 196, 187, 0.02) 50%, transparent 80%)",
              opacity: glow.opacity * 0.7,
              filter: "blur(24px)",
              animation: `dashboardNebulaFloat ${glow.duration}s ease-in-out ${glow.delay}s infinite`,
              display: "block",
            }}
          />
        ))}
        {ambientStars.map((star) => (
          <span
            key={`ambient-star-${star.id}`}
            style={{
              position: "absolute",
              left: star.left,
              top: star.top,
              width: `${star.size}px`,
              height: `${star.size}px`,
              borderRadius: "999px",
              background: "rgba(255,255,255,0.96)",
              opacity: star.opacity,
              boxShadow:
                star.size > 2
                  ? "0 0 18px rgba(255,255,255,0.46), 0 0 30px rgba(255,255,255,0.16)"
                  : "0 0 10px rgba(255,255,255,0.32)",
              animation: `${star.animationName} ${star.duration}s ease-in-out ${star.delay}s infinite`,
              willChange: "transform, opacity",
              display: "block",
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 2,
          background:
            "radial-gradient(circle at 50% 24%, rgba(5, 12, 24, 0.08), transparent 20%), linear-gradient(180deg, rgba(5,12,24,0.2) 0%, rgba(5,12,24,0.12) 22%, rgba(5,12,24,0.08) 48%, rgba(5,12,24,0.1) 68%, rgba(5,12,24,0.16) 100%)",
        }}
      />

      <div
        style={{
          padding: "1.5rem 1.5rem 0.9rem",
          position: "relative",
          overflow: "hidden",
          background: "transparent",
          zIndex: 5,
        }}
      >
        <nav
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "26px", justifySelf: "start" }}>
            Aced<em style={{ color: "#1D9E75" }}>.</em>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "2.8rem",
              justifySelf: "center",
            }}
          >
            <button
              style={{
                background: "rgba(29,158,117,0.12)",
                border: "none",
                color: "#fff",
                fontSize: "17px",
                fontWeight: 500,
                cursor: "default",
                padding: "8px 16px",
                borderRadius: "999px",
                boxShadow: "0 0 26px rgba(29,158,117,0.18)",
                fontFamily: "DM Sans,sans-serif",
              }}
            >
              your universe
            </button>
            <button
              onClick={() => router.push("/practice-tests")}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "none",
                color: "rgba(255,255,255,0.78)",
                fontSize: "17px",
                fontWeight: 500,
                cursor: "pointer",
                padding: "8px 16px",
                borderRadius: "999px",
                boxShadow: "0 0 24px rgba(255,255,255,0.04)",
                fontFamily: "DM Sans,sans-serif",
              }}
            >
              practice tests
            </button>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", justifySelf: "end" }}>
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>
              {session?.user?.email}
            </span>
            <button
              onClick={handleSignOut}
              style={{
                background: "transparent",
                border: "0.5px solid rgba(255,255,255,0.18)",
                color: "rgba(255,255,255,0.45)",
                padding: "6px 16px",
                borderRadius: "20px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              sign out
            </button>
          </div>
        </nav>

        <h1
          style={{
            fontFamily: "DM Serif Display,serif",
            fontSize: "clamp(2rem,4vw,3.25rem)",
            fontWeight: 400,
            marginBottom: "4px",
            lineHeight: 1.06,
          }}
        >
          ready to <em style={{ color: "#1D9E75" }}>ace it,</em> {firstName}?
        </h1>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)", marginBottom: "1rem" }}>
          your universe is waiting - click any bright star
        </p>

        <div style={{ display: "flex", gap: "6px", marginBottom: "0", flexWrap: "wrap" }}>
          {(["all", "english", "math", "reading", "science"] as const).map((section) => (
            <button
              key={section}
              onClick={() => {
                setActiveSec(section);
                setSelected(null);
                stateRef.current.activeSec = section;
              }}
              style={{
                padding: "5px 14px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
                background: activeSec === section ? "rgba(255,255,255,0.1)" : "transparent",
                border:
                  activeSec === section
                    ? "0.5px solid rgba(255,255,255,0.25)"
                    : "0.5px solid rgba(255,255,255,0.08)",
                color: activeSec === section ? "#fff" : "rgba(255,255,255,0.35)",
              }}
            >
              {section}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 3,
          marginTop: "-44px",
          paddingTop: "44px",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(180deg, rgba(5,12,24,0.1) 0%, rgba(5,12,24,0.05) 10%, rgba(5,12,24,0) 22%, rgba(5,12,24,0) 82%, rgba(5,12,24,0.1) 92%, rgba(5,12,24,0.22) 100%)",
            zIndex: 1,
          }}
        />
        <canvas ref={canvasRef} style={{ width: "100%", display: "block", border: "none", outline: "none", position: "relative", zIndex: 0 }} />
        {hoverTooltip && (
          <div
            style={{
              position: "absolute",
              left: hoverTooltip.x,
              top: hoverTooltip.y,
              transform: "translateY(-100%)",
              zIndex: 2,
              pointerEvents: "none",
              padding: "8px 10px",
              borderRadius: "12px",
              background: "rgba(5, 11, 22, 0.92)",
              border: "0.5px solid rgba(255,255,255,0.14)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ fontSize: "10px", letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,0.34)", marginBottom: "3px" }}>
              mastery
            </div>
            <div style={{ fontSize: "12px", color: "#fff" }}>
              {hoverTooltip.topicName} · {hoverTooltip.masteryPct}%
            </div>
          </div>
        )}
      </div>

      <div ref={detailRef} style={{ padding: "1rem 1.5rem 2rem", minHeight: "80px", position: "relative", zIndex: 3 }}>
        {!selected && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "80px",
              fontSize: "12px",
              color: "rgba(255,255,255,0.18)",
              letterSpacing: ".06em",
            }}
          >
            ✦ click any bright star to explore a topic
          </div>
        )}
        {selected && selSec && selTopic && (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `0.5px solid ${selSec.color}30`,
              borderRadius: "16px",
              padding: "1.25rem 1.5rem",
              animation: "fadeIn 0.2s ease",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "1rem",
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    padding: "3px 10px",
                    borderRadius: "20px",
                    border: `0.5px solid ${selSec.color}44`,
                    background: `${selSec.color}18`,
                    color: selSec.color,
                    display: "inline-block",
                    marginBottom: "8px",
                  }}
                >
                  {selSec.name} · {selSec.label}
                </span>
                {selTopicContext && (
                  <div
                    style={{
                      fontSize: "11px",
                      color: selSec.color,
                      marginBottom: "8px",
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                    }}
                  >
                    official ACT category · {selTopicContext}
                  </div>
                )}
                <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px" }}>{selTopic}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontFamily: "DM Serif Display,serif",
                    fontSize: "42px",
                    color: selSec.color,
                    lineHeight: 1,
                  }}
                >
                  {selectedTopicSummary?.masteryPct ?? 0}%
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>mastery</div>
              </div>
            </div>
            {selectedTopicSummary && (
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.04)",
                    border: `0.5px solid ${selSec.color}30`,
                    minWidth: "150px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "10px",
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.34)",
                      marginBottom: "4px",
                    }}
                  >
                    topic ACT estimate
                  </div>
                  <div
                    style={{
                      fontFamily: "DM Serif Display,serif",
                      fontSize: "26px",
                      color: selSec.color,
                      lineHeight: 1.1,
                    }}
                  >
                    {selectedTopicSummary.estimatedScore}/36
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>
                    {selectedTopicSummary.scoreLabel} · confidence {Math.round((selectedTopicSummary.confidence ?? 0) * 100)}%
                  </div>
                </div>
                {selectedSectionSummary && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "12px",
                      background: "rgba(255,255,255,0.03)",
                      border: "0.5px solid rgba(255,255,255,0.08)",
                      minWidth: "150px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        letterSpacing: ".06em",
                        textTransform: "uppercase",
                        color: "rgba(255,255,255,0.34)",
                        marginBottom: "4px",
                      }}
                    >
                      section estimate
                    </div>
                    <div
                      style={{
                        fontFamily: "DM Serif Display,serif",
                        fontSize: "22px",
                        color: "rgba(255,255,255,0.86)",
                        lineHeight: 1.1,
                      }}
                    >
                      {selectedSectionSummary.estimatedScore}/36
                    </div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>
                      {selectedSectionSummary.scoreLabel}
                    </div>
                  </div>
                )}
              </div>
            )}
            {selectedTopicSummary && (
              <div
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.5)",
                  padding: "10px 14px",
                  background: "rgba(255,255,255,0.035)",
                  borderRadius: "10px",
                  borderLeft: `2px solid ${selSec.color}`,
                  marginBottom: "1rem",
                }}
              >
                {selectedTopicSummary.scoreExplanation}
              </div>
            )}
            <div
              style={{
                height: "4px",
                background: "rgba(255,255,255,0.07)",
                borderRadius: "2px",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${selectedTopicSummary?.masteryPct ?? 0}%`,
                  background: selSec.color,
                  borderRadius: "2px",
                }}
              />
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.45)",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: "10px",
                borderLeft: `2px solid ${selSec.color}`,
                marginBottom: "1rem",
              }}
            >
              {selectedTopicSummary && selectedTopicSummary.totalAnswered > 0
                ? `you've answered ${selectedTopicSummary.totalAnswered} question${selectedTopicSummary.totalAnswered === 1 ? "" : "s"} here. keep going to strengthen this star ✦`
                : selTopicContext
                  ? `no practice yet - start here to light up this ${selTopicContext.toLowerCase()} skill star ✦`
                  : "no practice yet - start here to light this star up ✦"}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => router.push(`/practice?section=${selSec.key}&topic=${encodeURIComponent(selTopic)}`)}
                style={{
                  flex: 1,
                  padding: "11px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "none",
                  background: selSec.color,
                  color: "#fff",
                  fontFamily: "DM Sans,sans-serif",
                }}
              >
                practice now →
              </button>
              <button
                style={{
                  flex: 1,
                  padding: "11px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  cursor: "pointer",
                  background: "transparent",
                  border: `0.5px solid ${selSec.color}40`,
                  color: "rgba(255,255,255,0.7)",
                  fontFamily: "DM Sans,sans-serif",
                }}
              >
                review missed →
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
