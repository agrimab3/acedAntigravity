"use client";

import { useEffect, useRef, useState } from "react";
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

export default function Dashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [activeSec, setActiveSec] = useState<SectionKey | "all">("all");
  const [selected, setSelected] = useState<Hit>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    activeSec: "all" as SectionKey | "all",
    selected: null as Hit,
    hovered: null as Hit,
  });

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

    const dust = Array.from({ length: 350 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.3 + Math.random() * 1.4,
      o: 0.12 + Math.random() * 0.55,
      sp: 0.3 + Math.random() * 2,
      ph: Math.random() * Math.PI * 2,
      dx: (Math.random() - 0.5) * 0.12,
      dy: (Math.random() - 0.5) * 0.08,
    }));

    const skyStars = Array.from({ length: 110 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.8 + Math.random() * 2.2,
      alpha: 0.18 + Math.random() * 0.45,
      speed: 0.35 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      flare: Math.random() > 0.72,
    }));

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
      stateRef.current.hovered = hitTest(mx, my);
      canvasEl.style.cursor = stateRef.current.hovered ? "pointer" : "default";
    };

    const onClick = (e: MouseEvent) => {
      const { mx, my } = getCoords(e);
      const hit = hitTest(mx, my);
      if (hit) setSelected(hit);
    };

    canvasEl.addEventListener("mousemove", onMove);
    canvasEl.addEventListener("click", onClick);

    let raf = 0;

    function draw(ts: number) {
      const t = ts * 0.001;
      ctx.clearRect(0, 0, W, H);

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0d1b2a");
      bg.addColorStop(0.45, "#060d1e");
      bg.addColorStop(1, "#020408");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const shadowPockets = [
        { x: 250, y: 410, r: 240, alpha: 0.2 },
        { x: 705, y: 360, r: 290, alpha: 0.16 },
        { x: 1130, y: 520, r: 250, alpha: 0.22 },
      ];

      shadowPockets.forEach((pocket) => {
        const vignette = ctx.createRadialGradient(pocket.x, pocket.y, 0, pocket.x, pocket.y, pocket.r);
        vignette.addColorStop(0, `rgba(1, 4, 10, ${pocket.alpha})`);
        vignette.addColorStop(0.55, `rgba(1, 4, 10, ${pocket.alpha * 0.5})`);
        vignette.addColorStop(1, "rgba(1, 4, 10, 0)");
        ctx.fillStyle = vignette;
        ctx.beginPath();
        ctx.arc(pocket.x, pocket.y, pocket.r, 0, Math.PI * 2);
        ctx.fill();
      });

      dust.forEach((s) => {
        s.x += s.dx;
        s.y += s.dy;
        if (s.x < 0) s.x = W;
        if (s.x > W) s.x = 0;
        if (s.y < 0) s.y = H;
        if (s.y > H) s.y = 0;
        ctx.globalAlpha = s.o * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      skyStars.forEach((star) => {
        const sparkle = 0.55 + 0.45 * Math.sin(t * star.speed + star.phase);
        const alpha = star.alpha * sparkle;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#dfe8ff";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();

        if (star.flare) {
          ctx.strokeStyle = "rgba(255,255,255,0.28)";
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(star.x - star.r * 3.2, star.y);
          ctx.lineTo(star.x + star.r * 3.2, star.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(star.x, star.y - star.r * 3.2);
          ctx.lineTo(star.x, star.y + star.r * 3.2);
          ctx.stroke();
        }
      });
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

        ctx.globalAlpha = alpha * (0.4 + 0.15 * Math.sin(t * 0.5 + si * 0.8));
        ctx.strokeStyle = sec.color;
        ctx.lineWidth = 0.9;
        ctx.shadowColor = sec.color;
        ctx.shadowBlur = 5;
        sec.lines.forEach(([a, b]) => {
          const pa = pointToCanvas(sec, sec.points[a]);
          const pb = pointToCanvas(sec, sec.points[b]);
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
          const twinkle = 0.8 + 0.2 * Math.sin(t * 1.1 + pi * 1.7 + si * 0.9);
          const pulse = isInteractive ? 0.82 + 0.18 * Math.sin(t * 2.2 + pi * 1.3 + si) : 1;
          const radius = isHover ? 8.8 : isInteractive ? 6.2 + pulse * 0.9 : 3.2;

          if (isInteractive) {
            const halo = ctx.createRadialGradient(
              resolved.x + dx,
              resolved.y + dy,
              0,
              resolved.x + dx,
              resolved.y + dy,
              26 + pulse * 8
            );
            halo.addColorStop(0, `${sec.color}66`);
            halo.addColorStop(0.45, `${sec.color}24`);
            halo.addColorStop(1, `${sec.color}00`);
            ctx.globalAlpha = alpha * (isSelected ? 0.65 : 0.42);
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(resolved.x + dx, resolved.y + dy, 26 + pulse * 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = alpha * (isHover || isSelected ? 0.65 : 0.38);
            ctx.strokeStyle = `${sec.color}88`;
            ctx.lineWidth = isHover || isSelected ? 1.5 : 1;
            ctx.beginPath();
            ctx.arc(resolved.x + dx, resolved.y + dy, radius + 5 + pulse * 1.5, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.globalAlpha = alpha * (isInteractive ? 0.98 : 0.35) * twinkle;
          ctx.shadowColor = sec.color;
          ctx.shadowBlur = isHover || isSelected ? 32 : isInteractive ? 20 : 4;
          ctx.fillStyle = sec.color;
          ctx.beginPath();
          ctx.arc(resolved.x + dx, resolved.y + dy, radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = isInteractive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.68)";
          ctx.shadowBlur = 0;
          ctx.globalAlpha = alpha * (isInteractive ? 0.82 : 0.42) * twinkle;
          ctx.beginPath();
          ctx.arc(resolved.x + dx, resolved.y + dy, isInteractive ? 1.5 : 1.05, 0, Math.PI * 2);
          ctx.fill();

          if (isSelected) {
            const selectedPulse = 0.5 + 0.5 * Math.sin(t * 3.2);
            ctx.globalAlpha = alpha * (0.4 + 0.2 * selectedPulse);
            ctx.strokeStyle = sec.color;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.arc(resolved.x + dx, resolved.y + dy, radius + 7 + selectedPulse * 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = alpha * (0.15 + 0.08 * selectedPulse);
            ctx.beginPath();
            ctx.arc(resolved.x + dx, resolved.y + dy, radius + 16 + selectedPulse * 4, 0, Math.PI * 2);
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

      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 98, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 128, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "700 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ESTIMATED ACT SCORE", W / 2, H / 2 - 32);
      ctx.globalAlpha = 0.88;
      ctx.font = "italic bold 48px serif";
      ctx.fillText("--", W / 2, H / 2 + 18);
      ctx.globalAlpha = 0.16;
      ctx.font = "13px sans-serif";
      ctx.fillText("out of 36", W / 2, H / 2 + 44);
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      canvasEl.removeEventListener("mousemove", onMove);
      canvasEl.removeEventListener("click", onClick);
    };
  }, [status]);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
  };

  const selSec = selected ? SECS[selected.si] : null;
  const selTopic = selected ? getPointTopic(SECS[selected.si], selected.pi) : null;
  const selTopicContext = selSec && selTopic ? getTopicContext(selSec.key, selTopic) : null;

  if (status === "loading") {
    return (
      <div
        style={{
          background: "linear-gradient(180deg,#0d1b2a 0%,#060d1e 45%,#020408 100%)",
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
        background: "linear-gradient(180deg,#0d1b2a 0%,#060d1e 45%,#020408 100%)",
        minHeight: "100vh",
        color: "#fff",
        fontFamily: "DM Sans,sans-serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500&display=swap"
        rel="stylesheet"
      />

      <div
        style={{
          padding: "1.5rem 1.5rem 0.9rem",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#0d1b2a",
          backgroundImage: `
            radial-gradient(circle at 8% 18%, rgba(255,255,255,0.9) 0 1.5px, transparent 2.5px),
            radial-gradient(circle at 21% 34%, rgba(255,255,255,0.55) 0 1px, transparent 2px),
            radial-gradient(circle at 34% 12%, rgba(255,255,255,0.75) 0 1.2px, transparent 2.2px),
            radial-gradient(circle at 48% 28%, rgba(255,255,255,0.45) 0 1px, transparent 2px),
            radial-gradient(circle at 63% 16%, rgba(255,255,255,0.8) 0 1.4px, transparent 2.4px),
            radial-gradient(circle at 77% 32%, rgba(255,255,255,0.5) 0 1px, transparent 2px),
            radial-gradient(circle at 92% 20%, rgba(255,255,255,0.85) 0 1.3px, transparent 2.3px),
            radial-gradient(circle at 15% 62%, rgba(255,255,255,0.45) 0 1px, transparent 2px),
            radial-gradient(circle at 58% 68%, rgba(255,255,255,0.55) 0 1px, transparent 2px),
            radial-gradient(circle at 88% 58%, rgba(255,255,255,0.4) 0 1px, transparent 2px)
          `,
        }}
      >
        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px" }}>
            Aced<em style={{ color: "#1D9E75" }}>.</em>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
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
            fontSize: "clamp(1.5rem,3vw,2.2rem)",
            fontWeight: 400,
            marginBottom: "4px",
          }}
        >
          ready to <em style={{ color: "#1D9E75" }}>ace it,</em> {firstName}?
        </h1>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)", marginBottom: "1rem" }}>
          your universe is waiting - click any bright star
        </p>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.24)", marginBottom: "1rem" }}>
          english stars now drill the exact skills inside the official ACT categories.
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

      <canvas ref={canvasRef} style={{ width: "100%", display: "block", border: "none", outline: "none" }} />

      <div ref={detailRef} style={{ padding: "1rem 1.5rem 2rem", minHeight: "80px" }}>
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
                  0%
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>mastery</div>
              </div>
            </div>
            <div
              style={{
                height: "4px",
                background: "rgba(255,255,255,0.07)",
                borderRadius: "2px",
                marginBottom: "1rem",
              }}
            >
              <div style={{ height: "100%", width: "0%", background: selSec.color, borderRadius: "2px" }} />
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
              {selTopicContext
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
