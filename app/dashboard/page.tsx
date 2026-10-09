"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getProviders, signOut, useSession } from "next-auth/react";
import FirstTimeWalkthrough, { type WalkthroughTargetKey } from "@/app/dashboard/first-time-walkthrough";
import MockTestBanner from "@/components/MockTestBanner";
import NightSky from "@/components/NightSky";
import MockTestNavTab from "@/components/MockTestNavTab";
import { getTopicByName } from "@/lib/act-taxonomy";
import { getDisplayFirstName } from "@/lib/onboarding";
import { useOnboardingState } from "@/lib/use-onboarding-state";

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
  topicName: string | null,
  preview: MasteryPreview
) {
  if (preview && preview.sectionKey === sectionKey && preview.topicName === topicName) {
    return preview.masteryPct;
  }
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
  line: [number, number],
  preview: MasteryPreview
) {
  const topicNames = line
    .map((pointIndex) => getPointTopic(section, pointIndex))
    .filter((value): value is string => Boolean(value));

  if (topicNames.length === 0) {
    return 10;
  }

  const total = topicNames.reduce(
    (sum, topicName) => sum + getTopicMasteryPct(dashboardSummary, section.key, topicName, preview),
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
  const baseRadius = interactive ? 4.8 + mastery * 5.5 : 3.45;
  const radiusBoost = hovered ? 1.5 : selected ? 1.1 : 0;
  const radius = baseRadius + radiusBoost + (interactive ? pulse * 0.35 : 0);
  const haloRadius = interactive ? 14 + mastery * 30 + pulse * 3 + (hovered || selected ? 7 : 0) : 7;
  const haloAlpha = interactive ? 0.1 + mastery * 0.62 + (hovered || selected ? 0.12 : 0) : 0;
  const ringAlpha = interactive ? 0.12 + mastery * 0.62 + (hovered || selected ? 0.16 : 0) : 0;
  const bodyAlpha = interactive ? (0.72 + mastery * 0.28) * twinkle : 0.94 * twinkle;
  const coreRadius = interactive ? 1.15 + mastery * 0.95 : 1.22;
  const coreAlpha = interactive ? 0.76 + mastery * 0.24 : 1;
  const lineAlpha = 0.12 + mastery * 0.64;
  const lineWidth = 1 + mastery * 2;
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

function formatVisibleEstimateLabel(label: string | null | undefined) {
  if (!label || label === "baseline estimate") {
    return "";
  }

  return label;
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
  practiceTestSignal: {
    completedSectionTests: number;
    completedFullTests: number;
  };
};

type MasteryPreview = {
  sectionKey: SectionKey;
  topicName: string;
  masteryPct: number;
} | null;

export default function Dashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { data: onboardingData, loading: onboardingLoading } = useOnboardingState(status, {
    redirectIfIncomplete: "/onboarding",
  });
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
  const practiceTestsButtonRef = useRef<HTMLButtonElement>(null);
  const progressButtonRef = useRef<HTMLButtonElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const universeRef = useRef<HTMLDivElement>(null);
  const walkthroughInitRef = useRef(false);
  const scoreCountUpStartedAtRef = useRef<number | null>(null);
  const scoreCountUpCompleteRef = useRef(false);
  const stateRef = useRef({
    activeSec: "all" as SectionKey | "all",
    selected: null as Hit,
    hovered: null as Hit,
  });
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState<WalkthroughTargetKey | null>(null);
  const [walkthroughFilterPreview, setWalkthroughFilterPreview] = useState<SectionKey | null>(null);
  const [savingWalkthrough, setSavingWalkthrough] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const [devBackToLoginAvailable, setDevBackToLoginAvailable] = useState(false);
  const [summaryRefreshToken, setSummaryRefreshToken] = useState(0);
  const [masteryPreview, setMasteryPreview] = useState<MasteryPreview>(null);
  const effectiveMasteryPreview =
    process.env.NODE_ENV === "development" ? masteryPreview : null;
  const [previewSkill, setPreviewSkill] = useState({
    sectionKey: "english" as SectionKey,
    topicName: SECS[0].topics[0],
  });
  const previewSkills = useMemo(
    () =>
      SECS.flatMap((section) =>
        section.topics.map((topicName) => ({ sectionKey: section.key, topicName }))
      ),
    []
  );

  useEffect(() => {
    if (!walkthroughOpen || walkthroughStep !== "filters") {
      setWalkthroughFilterPreview(null);
      return;
    }

    const sections: SectionKey[] = ["english", "math", "reading", "science"];
    let index = 0;
    setWalkthroughFilterPreview(sections[index]);

    const interval = window.setInterval(() => {
      index = (index + 1) % sections.length;
      setWalkthroughFilterPreview(sections[index]);
    }, 1100);

    return () => window.clearInterval(interval);
  }, [walkthroughOpen, walkthroughStep]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    const hostname = window.location.hostname;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

    if (!isLocalHost) {
      setDevBackToLoginAvailable(false);
      return;
    }

    void getProviders().then((providers) => {
      setDevBackToLoginAvailable(Boolean(providers?.["local-dev-test-user"]));
    });
  }, []);

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const loadSummary = async () => {
      try {
        const res = await fetch("/api/dashboard/summary", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!res.ok) {
          if (active) setSummaryError(true);
          return;
        }

        const data = await res.json();

        if (active) {
          setDashboardSummary(data);
          setSummaryError(false);
        }
      } catch (error) {
        if (active) {
          setSummaryError(true);
        }
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Failed to load dashboard summary", error);
        }
      } finally {
        clearTimeout(timer);
      }
    };

    void loadSummary();

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [status, summaryRefreshToken]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const refreshSummary = () => setSummaryRefreshToken((current) => current + 1);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSummary();
    };

    window.addEventListener("focus", refreshSummary);
    window.addEventListener("pageshow", refreshSummary);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshSummary);
      window.removeEventListener("pageshow", refreshSummary);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
            masteryPct: getTopicMasteryPct(dashboardSummary, sec.key, topicName, effectiveMasteryPreview),
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
        const walkthroughFocused =
          walkthroughOpen &&
          walkthroughStep === "filters" &&
          walkthroughFilterPreview === sec.key;
        const walkthroughFiltering =
          walkthroughOpen &&
          walkthroughStep === "filters" &&
          walkthroughFilterPreview !== null;
        const alpha = walkthroughFiltering
          ? walkthroughFocused
            ? 1
            : 0.055
          : active
            ? 1
            : 0.06;
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
          const lineMastery = getLineMasteryPct(dashboardSummary, sec, [a, b], effectiveMasteryPreview);
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
          const isWalkthroughStar =
            walkthroughOpen &&
            walkthroughStep === "universe" &&
            si === 0 &&
            point.topicIndex === 0;
          const topicName = getPointTopic(sec, pi);
          const masteryPct = isInteractive
            ? getTopicMasteryPct(dashboardSummary, sec.key, topicName, effectiveMasteryPreview)
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
          ctx.shadowBlur = isHover || isSelected ? 38 : isInteractive ? 8 + visual.mastery * 34 : 11;
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

          if (isWalkthroughStar) {
            const guidePulse = 0.5 + 0.5 * Math.sin(t * 3.4);
            ctx.globalAlpha = 0.55 + guidePulse * 0.32;
            ctx.strokeStyle = "rgba(255,255,255,0.96)";
            ctx.lineWidth = 1.6;
            ctx.shadowColor = sec.color;
            ctx.shadowBlur = 22 + guidePulse * 18;
            ctx.beginPath();
            ctx.arc(
              resolved.x + dx,
              resolved.y + dy,
              visual.radius + 11 + guidePulse * 4,
              0,
              Math.PI * 2
            );
            ctx.stroke();
            ctx.globalAlpha = 0.18 + guidePulse * 0.12;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(
              resolved.x + dx,
              resolved.y + dy,
              visual.radius + 22 + guidePulse * 7,
              0,
              Math.PI * 2
            );
            ctx.stroke();
            ctx.shadowBlur = 0;
          }

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

      const hasPracticeData = Boolean(
        dashboardSummary &&
          (dashboardSummary.topicSummaries.some((topic) => topic.totalAnswered > 0) ||
            dashboardSummary.practiceTestSignal.completedSectionTests > 0 ||
            dashboardSummary.practiceTestSignal.completedFullTests > 0)
      );
      const hasPriorScore = onboardingData?.profile.previousActScore !== null &&
        onboardingData?.profile.previousActScore !== undefined;
      const isNewUserBaseline = Boolean(dashboardSummary) && !hasPracticeData && !hasPriorScore;

      const estimateWalkthroughActive = walkthroughOpen && walkthroughStep === "estimate";
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const walkthroughRingPulse = estimateWalkthroughActive ? 0.5 + 0.5 * Math.sin(t * 1.55) : 0;
      const innerRingRadius = 122 + walkthroughRingPulse * 10;
      const outerRingRadius = 158 + walkthroughRingPulse * 18;
      const calmBreath = reduceMotion ? 0.45 : 0.475 + 0.125 * Math.sin((Math.PI * 2 * t) / 6);

      ctx.globalAlpha = isNewUserBaseline ? 0.3 : estimateWalkthroughActive ? 0.28 : calmBreath;
      ctx.strokeStyle = isNewUserBaseline ? "#A8D4FF" : "#DDF9EF";
      ctx.shadowColor = isNewUserBaseline ? "transparent" : "rgba(93,202,165,0.22)";
      ctx.shadowBlur = isNewUserBaseline ? 0 : 5;
      ctx.lineWidth = isNewUserBaseline ? 1.2 : estimateWalkthroughActive ? 1.05 : 0.85;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, innerRingRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.globalAlpha = isNewUserBaseline ? 0.3 : estimateWalkthroughActive ? 0.28 : 0.15;
      ctx.strokeStyle = isNewUserBaseline ? "#A8D4FF" : "#fff";
      ctx.setLineDash(isNewUserBaseline ? [4, 8] : []);
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, outerRingRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let i = 0; i < 18; i += 1) {
        const angle = (Math.PI * 2 * i) / 18 + t * (i % 2 === 0 ? 0.012 : -0.009);
        const orbit = 136 + (i % 4) * 13 + walkthroughRingPulse * (i % 3);
        const x = W / 2 + Math.cos(angle) * orbit;
        const y = H / 2 + Math.sin(angle) * orbit;
        const twinkle = 0.34 + 0.34 * (0.5 + 0.5 * Math.sin(t * 2 + i * 1.7));
        ctx.globalAlpha = twinkle * (estimateWalkthroughActive ? 0.8 : 0.42);
        ctx.fillStyle = i % 3 === 0 ? "#A8D4FF" : "#FFFFFF";
        ctx.beginPath();
        ctx.arc(x, y, i % 5 === 0 ? 1.4 : 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      const activeSectionKey = stateRef.current.activeSec;
      const centerSectionSummary =
        activeSectionKey !== "all"
          ? dashboardSummary?.sectionSummaries.find((summary) => summary.sectionKey === activeSectionKey)
          : null;
      const centerScoreTarget = centerSectionSummary?.estimatedScore ??
        dashboardSummary?.compositeEstimatedScore ??
        null;
      let centerScoreLabel = isNewUserBaseline ? "—" : centerScoreTarget?.toString() ?? "…";

      if (
        activeSectionKey === "all" &&
        centerScoreTarget !== null &&
        !isNewUserBaseline &&
        !scoreCountUpCompleteRef.current
      ) {
        if (reduceMotion) {
          scoreCountUpCompleteRef.current = true;
        } else {
          if (scoreCountUpStartedAtRef.current === null) {
            scoreCountUpStartedAtRef.current = ts;
          }
          const elapsed = ts - scoreCountUpStartedAtRef.current;
          const progress = Math.min(1, elapsed / 1200);
          const eased = 1 - Math.pow(1 - progress, 3);
          centerScoreLabel = Math.round(centerScoreTarget * eased).toString();
          if (progress >= 1) {
            scoreCountUpCompleteRef.current = true;
          }
        }
      }
      const centerScoreTitle =
        isNewUserBaseline
          ? "YOUR ACT ESTIMATE"
          : activeSectionKey !== "all"
          ? `ESTIMATED ${activeSectionKey.toUpperCase()} SCORE`
          : "ESTIMATED ACT SCORE";
      const centerScoreLabelText =
        formatVisibleEstimateLabel(
          centerSectionSummary?.scoreLabel ?? dashboardSummary?.scoreLabel ?? ""
        );
      const centerSubtitle = isNewUserBaseline
        ? "practice to calibrate"
        : activeSectionKey !== "all"
          ? `${activeSectionKey} section`
          : "out of 36";
      ctx.globalAlpha = isNewUserBaseline ? 0.82 : 0.92;
      ctx.fillStyle = isNewUserBaseline ? "#DCEBFF" : "#FFFFFF";
      ctx.font = "700 17px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(centerScoreTitle, W / 2, H / 2 - 40);
      ctx.globalAlpha = isNewUserBaseline ? 0.7 : 0.88;
      ctx.font = "italic bold 58px serif";
      ctx.fillText(centerScoreLabel, W / 2, H / 2 + 16);
      ctx.globalAlpha = isNewUserBaseline ? 0.52 : 0.16;
      ctx.font = "14px sans-serif";
      ctx.fillText(centerSubtitle, W / 2, H / 2 + 48);
      if (isNewUserBaseline) {
        ctx.globalAlpha = 0.54;
        ctx.fillStyle = "#8BB9FF";
        ctx.font = "700 11px sans-serif";
        ctx.fillText("BASELINE · NO PRACTICE YET", W / 2, H / 2 + 74);
      } else if (dashboardSummary && centerScoreLabelText) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#FFFFFF";
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
  }, [
    dashboardSummary,
    effectiveMasteryPreview,
    onboardingData?.profile.previousActScore,
    status,
    walkthroughOpen,
    walkthroughStep,
    walkthroughFilterPreview,
  ]);

  useEffect(() => {
    if (status !== "authenticated" || onboardingLoading || !onboardingData?.isComplete) {
      return;
    }

    if (walkthroughInitRef.current) {
      return;
    }

    walkthroughInitRef.current = true;

    if (
      onboardingData.profile.walkthroughCompletedAt ||
      (typeof window !== "undefined" && window.localStorage.getItem("aced.walkthrough.completed") === "1")
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setWalkthroughOpen(true);
    }, 420);

    return () => window.clearTimeout(timeoutId);
  }, [onboardingData, onboardingLoading, status]);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
  };

  const handleReplayWalkthrough = () => {
    window.localStorage.removeItem("aced.walkthrough.completed");
    setWalkthroughOpen(true);
  };

  const handleResetOnboarding = async () => {
    const response = await fetch("/api/onboarding/reset", { method: "POST" });

    if (!response.ok) {
      return;
    }

    window.localStorage.removeItem("aced.walkthrough.completed");
    setWalkthroughOpen(false);
    setWalkthroughStep(null);
    router.replace("/onboarding");
    router.refresh();
  };

  const handleCloseWalkthrough = async () => {
    setWalkthroughOpen(false);
    setWalkthroughStep(null);
    setWalkthroughFilterPreview(null);
    setSavingWalkthrough(true);

    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("aced.walkthrough.completed", "1");
      }

      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walkthroughCompleted: true,
        }),
      });
    } catch (error) {
      console.error("Failed to save walkthrough state", error);
    } finally {
      setSavingWalkthrough(false);
    }
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

  if (status === "loading" || onboardingLoading) {
    return (
      <div
        style={{
          background: "var(--sky-background)",
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

  const firstName = getDisplayFirstName({
    preferredName: onboardingData?.profile?.preferredName,
    googleName: session?.user?.name ?? onboardingData?.profile?.googleName,
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--sky-base)",
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
        @keyframes scoreOrbit {
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .score-orbit { animation: none !important; }
        }
      `}</style>

      <NightSky density="more" shootingZone="upper" />

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
              gap: "2.2rem",
              justifySelf: "center",
            }}
          >
            <button
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                fontSize: "17px",
                fontWeight: 500,
                cursor: "default",
                padding: "6px 4px",
                position: "relative",
                textShadow: "0 0 18px rgba(29,158,117,0.4)",
                fontFamily: "DM Sans,sans-serif",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: "calc(100% + 26px)",
                  height: "24px",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "999px",
                  background: "radial-gradient(circle, rgba(29,158,117,0.26) 0%, rgba(29,158,117,0.12) 54%, transparent 82%)",
                  filter: "blur(12px)",
                  zIndex: 0,
                  pointerEvents: "none",
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>your universe</span>
            </button>
            <button
              ref={practiceTestsButtonRef}
              onClick={() => router.push("/practice-tests")}
              style={{
                background:
                  walkthroughOpen && walkthroughStep === "practiceTests"
                    ? "rgba(255,255,255,0.08)"
                    : "transparent",
                border:
                  walkthroughOpen && walkthroughStep === "practiceTests"
                    ? "1px solid rgba(255,255,255,0.58)"
                    : "1px solid transparent",
                color:
                  walkthroughOpen && walkthroughStep === "practiceTests"
                    ? "#fff"
                    : "rgba(255,255,255,0.78)",
                fontSize: "17px",
                fontWeight: 500,
                cursor: "pointer",
                padding: "8px 14px",
                position: "relative",
                borderRadius: "18px",
                boxShadow:
                  walkthroughOpen && walkthroughStep === "practiceTests"
                    ? "0 0 0 2px rgba(175,169,236,0.18), 0 0 28px rgba(175,169,236,0.34), 0 0 72px rgba(93,202,165,0.18)"
                    : "none",
                textShadow: "0 0 14px rgba(255,255,255,0.18)",
                fontFamily: "DM Sans,sans-serif",
                transition: "background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, color 180ms ease",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: "calc(100% + 22px)",
                  height: "20px",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "999px",
                  background: "radial-gradient(circle, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.045) 58%, transparent 84%)",
                  filter: "blur(11px)",
                  zIndex: 0,
                  pointerEvents: "none",
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>practice tests</span>
            </button>
            <button
              ref={progressButtonRef}
              onClick={() => router.push("/progress")}
              style={{
                background:
                  walkthroughOpen && walkthroughStep === "progress"
                    ? "rgba(255,255,255,0.08)"
                    : "transparent",
                border:
                  walkthroughOpen && walkthroughStep === "progress"
                    ? "1px solid rgba(255,255,255,0.58)"
                    : "1px solid transparent",
                color:
                  walkthroughOpen && walkthroughStep === "progress"
                    ? "#fff"
                    : "rgba(255,255,255,0.78)",
                fontSize: "17px",
                fontWeight: 500,
                cursor: "pointer",
                padding: "8px 14px",
                position: "relative",
                borderRadius: "18px",
                boxShadow:
                  walkthroughOpen && walkthroughStep === "progress"
                    ? "0 0 0 2px rgba(175,169,236,0.18), 0 0 28px rgba(175,169,236,0.34), 0 0 72px rgba(93,202,165,0.18)"
                    : "none",
                textShadow: "0 0 14px rgba(255,255,255,0.18)",
                fontFamily: "DM Sans,sans-serif",
                transition: "background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, color 180ms ease",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: "calc(100% + 22px)",
                  height: "20px",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "999px",
                  background: "radial-gradient(circle, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.045) 58%, transparent 84%)",
                  filter: "blur(11px)",
                  zIndex: 0,
                  pointerEvents: "none",
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>progress</span>
            </button>
            <MockTestNavTab />
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", justifySelf: "end" }}>
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.68)" }}>
              {session?.user?.email}
            </span>
            {process.env.NODE_ENV === "development" && devBackToLoginAvailable && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                  <select
                    value={`${previewSkill.sectionKey}::${previewSkill.topicName}`}
                    onChange={(event) => {
                      const [sectionKey, topicName] = event.target.value.split("::");
                      setPreviewSkill({ sectionKey: sectionKey as SectionKey, topicName });
                    }}
                    style={{
                      maxWidth: "154px",
                      padding: "3px 5px",
                      borderRadius: "7px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(5,12,24,0.56)",
                      color: "rgba(255,255,255,0.68)",
                      fontSize: "10px",
                    }}
                    aria-label="Skill to preview"
                  >
                    {previewSkills.map((skill) => (
                      <option key={`${skill.sectionKey}-${skill.topicName}`} value={`${skill.sectionKey}::${skill.topicName}`}>
                        {skill.sectionKey} · {skill.topicName}
                      </option>
                    ))}
                  </select>
                  {[0, 25, 50, 75, 100].map((masteryPct) => (
                    <button
                      key={masteryPct}
                      onClick={() => setMasteryPreview({ ...previewSkill, masteryPct })}
                      style={{
                        background: masteryPreview?.sectionKey === previewSkill.sectionKey &&
                          masteryPreview?.topicName === previewSkill.topicName &&
                          masteryPreview.masteryPct === masteryPct
                          ? "rgba(93,202,165,0.2)"
                          : "transparent",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.68)",
                        borderRadius: "7px",
                        padding: "3px 5px",
                        fontSize: "10px",
                        cursor: "pointer",
                      }}
                    >
                      {masteryPct}%
                    </button>
                  ))}
                  {masteryPreview && (
                    <button
                      onClick={() => setMasteryPreview(null)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "rgba(255,255,255,0.68)",
                        padding: "3px 2px",
                        fontSize: "10px",
                        cursor: "pointer",
                      }}
                    >
                      clear preview
                    </button>
                  )}
                </div>
                <button
                  onClick={() => void handleResetOnboarding()}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.68)",
                    padding: "4px 2px",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  reset onboarding
                </button>
                <button
                  onClick={handleReplayWalkthrough}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.68)",
                    padding: "4px 2px",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  replay walkthrough
                </button>
                <button
                  onClick={handleSignOut}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.68)",
                    padding: "4px 2px",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  back to login
                </button>
              </>
            )}
            <button
              onClick={handleSignOut}
              style={{
                background: "transparent",
                border: "0.5px solid rgba(255,255,255,0.18)",
                color: "rgba(255,255,255,0.68)",
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
        <p style={{ fontSize: "13px", color: summaryError ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.3)", marginBottom: "1rem" }}>
          {summaryError
            ? "displaying base star chart · score updates will reconnect automatically"
            : "your universe is waiting - click any bright star"}
        </p>

        <div ref={filtersRef} style={{ display: "flex", gap: "6px", marginBottom: "0", flexWrap: "wrap" }}>
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
                background:
                  (walkthroughOpen &&
                    walkthroughStep === "filters" &&
                    walkthroughFilterPreview === section) ||
                  activeSec === section
                    ? "rgba(255,255,255,0.12)"
                    : "transparent",
                border:
                  (walkthroughOpen &&
                    walkthroughStep === "filters" &&
                    walkthroughFilterPreview === section) ||
                  activeSec === section
                    ? "0.5px solid rgba(255,255,255,0.32)"
                    : "0.5px solid rgba(255,255,255,0.08)",
                color:
                  (walkthroughOpen &&
                    walkthroughStep === "filters" &&
                    walkthroughFilterPreview === section) ||
                  activeSec === section
                    ? "#fff"
                    : "rgba(255,255,255,0.35)",
                boxShadow:
                  walkthroughOpen &&
                  walkthroughStep === "filters" &&
                  walkthroughFilterPreview === section
                    ? "0 0 22px rgba(255,255,255,0.18)"
                    : "none",
                transform:
                  walkthroughOpen &&
                  walkthroughStep === "filters" &&
                  walkthroughFilterPreview === section
                    ? "translateY(-1px) scale(1.035)"
                    : "none",
                transition: "all 220ms ease",
              }}
            >
              {section}
            </button>
          ))}
        </div>

        <MockTestBanner />
      </div>

        <div
          ref={universeRef}
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
        <div
          className="score-orbit"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "22.5714%",
            aspectRatio: "1",
            transform: "translate(-50%, -50%)",
            transformOrigin: "center",
            animation: "scoreOrbit 60s linear infinite",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: "-2px",
              left: "50%",
              width: "4px",
              height: "4px",
              borderRadius: "999px",
              background: "#5DCAA5",
              boxShadow: "0 0 8px rgba(93,202,165,0.9), 0 0 16px rgba(93,202,165,0.45)",
              transform: "translateX(-50%)",
            }}
          />
        </div>
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
            <div style={{ fontSize: "10px", letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,0.68)", marginBottom: "3px" }}>
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
              color: "rgba(255,255,255,0.68)",
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
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)" }}>mastery</div>
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
                      color: "rgba(255,255,255,0.68)",
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
                  {formatVisibleEstimateLabel(selectedTopicSummary.scoreLabel) ? (
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)", marginTop: "4px" }}>
                      {formatVisibleEstimateLabel(selectedTopicSummary.scoreLabel)} · estimate improves as you practice
                    </div>
                  ) : (
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)", marginTop: "4px" }}>
                      estimate improves as you practice
                    </div>
                  )}
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
                        color: "rgba(255,255,255,0.68)",
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
                    {formatVisibleEstimateLabel(selectedSectionSummary.scoreLabel) ? (
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)", marginTop: "4px" }}>
                        {formatVisibleEstimateLabel(selectedSectionSummary.scoreLabel)}
                      </div>
                    ) : (
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)", marginTop: "4px" }}>
                        estimate improves as you practice
                      </div>
                    )}
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
                color: "rgba(255,255,255,0.68)",
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
                onClick={() => router.push("/progress")}
              >
                review missed →
              </button>
            </div>
          </div>
        )}
      </div>
      <div
        style={{
          position: "fixed",
          left: "50%",
          bottom: "16px",
          transform: "translateX(-50%)",
          zIndex: 50,
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          justifyContent: "center",
          padding: "8px",
          borderRadius: "16px",
          background: "rgba(3,7,14,0.86)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
          maxWidth: "calc(100vw - 24px)",
        }}
      >
        <button
          onClick={() => router.push("/admin/review")}
          style={{
            padding: "9px 13px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.05)",
            color: "rgba(255,255,255,0.86)",
            cursor: "pointer",
            fontFamily: "DM Sans,sans-serif",
            fontSize: "12px",
          }}
        >
          admin review
        </button>
        <button
          onClick={() => router.push("/admin/mock-test-forms")}
          style={{
            padding: "9px 13px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.05)",
            color: "rgba(255,255,255,0.86)",
            cursor: "pointer",
            fontFamily: "DM Sans,sans-serif",
            fontSize: "12px",
          }}
        >
          mock test forms
        </button>
        <button
          onClick={() => router.push("/mock-test/run")}
          style={{
            padding: "9px 13px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.05)",
            color: "rgba(255,255,255,0.86)",
            cursor: "pointer",
            fontFamily: "DM Sans,sans-serif",
            fontSize: "12px",
          }}
        >
          mock test run
        </button>
      </div>

      <FirstTimeWalkthrough
        open={walkthroughOpen}
        saving={savingWalkthrough}
        onClose={() => void handleCloseWalkthrough()}
        firstName={firstName}
        universeRef={universeRef}
        filtersRef={filtersRef}
        practiceTestsRef={practiceTestsButtonRef}
        progressRef={progressButtonRef}
        onStepChange={setWalkthroughStep}
      />
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
