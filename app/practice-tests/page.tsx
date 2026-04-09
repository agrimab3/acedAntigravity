"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  FULL_TESTS,
  PRACTICE_TEST_MODES,
  SECTION_TESTS,
} from "@/lib/practice-tests";

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function seededValue(seed: number) {
  const value = Math.sin(seed * 999.913) * 10000;
  return value - Math.floor(value);
}

function buildPracticeTestAmbientStars(count: number) {
  const columns = 10;
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
      top: `${clampPercent(topBase + (seededValue(seed + 20) - 0.5) * 10, 3, 97)}%`,
      size: 0.9 + seededValue(seed + 40) * 2.8,
      opacity: 0.1 + seededValue(seed + 60) * 0.42,
      duration: 4.5 + seededValue(seed + 80) * 7,
      delay: seededValue(seed + 100) * 6,
      animationName:
        variant === 0
          ? "practiceTestStarDriftA"
          : variant === 1
            ? "practiceTestStarDriftB"
            : "practiceTestStarDriftC",
    };
  });
}

function buildPracticeTestAmbientGlows(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const seed = index + 101;
    return {
      id: index,
      left: `${6 + seededValue(seed) * 88}%`,
      top: `${8 + seededValue(seed + 20) * 82}%`,
      size: 80 + seededValue(seed + 40) * 180,
      opacity: 0.04 + seededValue(seed + 60) * 0.08,
      duration: 14 + seededValue(seed + 80) * 14,
      delay: seededValue(seed + 100) * 5,
    };
  });
}

function clampPercent(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function PracticeTestsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedModeKey, setSelectedModeKey] = useState(PRACTICE_TEST_MODES[0]?.key);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [history, setHistory] = useState<
    Array<{
      sessionId: string;
      title: string;
      shortLabel: string;
      format: "section" | "full";
      accuracyPct: number;
      compositeEstimatedScore: number | null;
      durationSeconds: number;
      completedAt: string | null;
      overallPacing: { label: string; description: string };
      sections: Array<{
        title: string;
        estimatedScore: number | null;
        accuracyPct: number;
        pacingSummary: { label: string };
      }>;
    }>
  >([]);

  const selectedMode = useMemo(
    () => PRACTICE_TEST_MODES.find((mode) => mode.key === selectedModeKey) ?? PRACTICE_TEST_MODES[0],
    [selectedModeKey]
  );
  const backgroundStars = useMemo(
    () => buildPracticeTestAmbientStars(78),
    []
  );
  const backgroundGlows = useMemo(
    () => buildPracticeTestAmbientGlows(16),
    []
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    const canvas = backgroundCanvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const ctx = context;
    const dpr = window.devicePixelRatio || 1;
    const stars = backgroundStars.map((star, index) => ({
      x: ((index % 13) + 0.5) / 13 + (seededValue(index + 1) - 0.5) * 0.035,
      y: (Math.floor(index / 13) + 0.5) / 6 + (seededValue(index + 20) - 0.5) * 0.05,
      r: star.size,
      alpha: star.opacity,
      speed: 0.18 + seededValue(index + 60) * 0.32,
      driftX: (seededValue(index + 80) - 0.5) * 10,
      driftY: -12 - seededValue(index + 100) * 18,
      phase: seededValue(index + 120) * Math.PI * 2,
    }));

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    let raf = 0;

    const draw = (timestamp: number) => {
      const t = timestamp * 0.001;
      const width = window.innerWidth;
      const height = window.innerHeight;
      ctx.clearRect(0, 0, width, height);

      stars.forEach((star) => {
        const driftProgress = (Math.sin(t * star.speed + star.phase) + 1) / 2;
        const x = star.x * width + star.driftX * driftProgress;
        const y = star.y * height + star.driftY * driftProgress;
        const twinkle = 0.45 + 0.55 * Math.sin(t * (1.3 + star.speed) + star.phase);
        const radius = star.r * (0.92 + twinkle * 0.18);
        ctx.globalAlpha = star.alpha * (0.42 + twinkle * 0.58);
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        if (star.r > 2.2) {
          ctx.strokeStyle = "rgba(255,255,255,0.24)";
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(x - radius * 3.2, y);
          ctx.lineTo(x + radius * 3.2, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y - radius * 3.2);
          ctx.lineTo(x, y + radius * 3.2);
          ctx.stroke();
        }
      });

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [backgroundStars]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let active = true;

    const loadHistory = async () => {
      setHistoryLoading(true);

      try {
        const res = await fetch("/api/practice-tests/history", {
          cache: "no-store",
        });

        if (!res.ok) {
          return;
        }

        const data = await res.json();

        if (active) {
          setHistory(data.history ?? []);
        }
      } catch (error) {
        console.error("Failed to load practice test history", error);
      } finally {
        if (active) {
          setHistoryLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      active = false;
    };
  }, [status]);

  if (status === "loading") {
    return (
      <div
        style={{
          background: "linear-gradient(180deg,#0d1b2a 0%,#060d1e 48%,#020408 100%)",
          minHeight: "100vh",
          color: "rgba(255,255,255,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "DM Sans,sans-serif",
        }}
      >
        loading practice tests...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "#fff",
        fontFamily: "DM Sans,sans-serif",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 15% 18%, rgba(38, 95, 143, 0.22), transparent 24%), radial-gradient(circle at 76% 20%, rgba(29, 158, 117, 0.16), transparent 24%), radial-gradient(circle at 50% 78%, rgba(118, 63, 143, 0.18), transparent 30%), linear-gradient(180deg,#0d1b2a 0%,#060d1e 48%,#020408 100%)",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @keyframes practiceTestStarDriftA {
          0% { transform: translate3d(0, 0, 0) scale(0.88); opacity: 0.18; }
          35% { transform: translate3d(14px, -10px, 0) scale(1.08); opacity: 0.9; }
          70% { transform: translate3d(28px, -22px, 0) scale(0.98); opacity: 0.42; }
          100% { transform: translate3d(0, 0, 0) scale(0.88); opacity: 0.18; }
        }
        @keyframes practiceTestStarDriftB {
          0% { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.16; }
          40% { transform: translate3d(-18px, -6px, 0) scale(1.04); opacity: 0.78; }
          72% { transform: translate3d(-30px, -20px, 0) scale(0.96); opacity: 0.34; }
          100% { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.16; }
        }
        @keyframes practiceTestStarDriftC {
          0% { transform: translate3d(0, 0, 0) scale(0.86); opacity: 0.14; }
          42% { transform: translate3d(10px, -18px, 0) scale(1.08); opacity: 0.82; }
          76% { transform: translate3d(22px, -32px, 0) scale(0.94); opacity: 0.3; }
          100% { transform: translate3d(0, 0, 0) scale(0.86); opacity: 0.14; }
        }
        @keyframes practiceTestNebulaPulse {
          0% { transform: scale(0.94); opacity: 0.35; }
          50% { transform: scale(1.05); opacity: 0.7; }
          100% { transform: scale(0.94); opacity: 0.35; }
        }
      `}</style>
      <canvas
        ref={backgroundCanvasRef}
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
      />
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        {backgroundGlows.map((glow) => (
          <span
            key={`glow-${glow.id}`}
            style={{
              position: "absolute",
              left: glow.left,
              top: glow.top,
              width: `${glow.size}px`,
              height: `${glow.size}px`,
              transform: "translate(-50%, -50%)",
              borderRadius: "999px",
              background:
                glow.id % 3 === 0
                  ? "radial-gradient(circle, rgba(93,202,165,0.28) 0%, rgba(93,202,165,0.05) 42%, transparent 72%)"
                  : glow.id % 3 === 1
                    ? "radial-gradient(circle, rgba(116,139,255,0.22) 0%, rgba(116,139,255,0.04) 44%, transparent 74%)"
                    : "radial-gradient(circle, rgba(239,159,39,0.18) 0%, rgba(239,159,39,0.03) 46%, transparent 74%)",
              opacity: glow.opacity,
              filter: "blur(10px)",
              animation: `practiceTestNebulaPulse ${glow.duration}s ease-in-out ${glow.delay}s infinite`,
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
          zIndex: 1,
          background:
            "radial-gradient(circle at 50% 26%, rgba(5, 12, 24, 0.16), transparent 18%), linear-gradient(180deg, rgba(5,12,24,0.34) 0%, rgba(5,12,24,0.24) 18%, rgba(5,12,24,0.18) 38%, rgba(5,12,24,0.22) 60%, rgba(5,12,24,0.3) 100%)",
        }}
      />

      <div style={{ padding: "1.5rem 1.5rem 2.5rem", maxWidth: "1240px", margin: "0 auto", position: "relative", zIndex: 2 }}>
        <nav
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px", justifySelf: "start" }}>
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
              onClick={() => router.push("/dashboard")}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.58)",
                fontSize: "16px",
                fontWeight: 500,
                cursor: "pointer",
                padding: 0,
                fontFamily: "DM Sans,sans-serif",
              }}
            >
              your universe
            </button>
            <button
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                fontSize: "16px",
                fontWeight: 500,
                cursor: "default",
                padding: 0,
                fontFamily: "DM Sans,sans-serif",
              }}
            >
              practice tests
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", justifySelf: "end" }}>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.28)" }}>
              {session?.user?.email}
            </span>
            <button
              onClick={() => void signOut({ callbackUrl: "/" })}
              style={{
                padding: "7px 16px",
                borderRadius: "999px",
                border: "0.5px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "rgba(255,255,255,0.55)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              sign out
            </button>
          </div>
        </nav>

        <div style={{ marginBottom: "2rem", maxWidth: "760px" }}>
          <div
            style={{
              fontSize: "11px",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.42)",
              marginBottom: "10px",
            }}
          >
            Phase 3B
          </div>
          <h1
            style={{
              fontFamily: "DM Serif Display,serif",
              fontWeight: 400,
              fontSize: "clamp(2rem,4.2vw,3.6rem)",
              lineHeight: 1.08,
              marginBottom: "10px",
            }}
          >
            practice tests,
            <br />
            <em style={{ color: "#1D9E75" }}>written in the stars</em>
          </h1>
          <p
            style={{
              maxWidth: "640px",
              fontSize: "15px",
              lineHeight: 1.75,
              color: "rgba(255,255,255,0.56)",
            }}
          >
            Build from official ACT section timing, then level up into a full-test experience with section transitions,
            pacing feedback, and post-test star recovery plans.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.95fr)",
            gap: "18px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "18px" }}>
            <section
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: "18px",
                padding: "1.2rem",
              }}
            >
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "0.9rem" }}>
                section tests
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {SECTION_TESTS.map((mode) => {
                  const selected = mode.key === selectedMode.key;
                  return (
                    <button
                      key={mode.key}
                      onClick={() => setSelectedModeKey(mode.key)}
                      style={{
                        textAlign: "left",
                        borderRadius: "16px",
                        padding: "1rem",
                        border: selected
                          ? `0.5px solid ${mode.accentColor}66`
                          : "0.5px solid rgba(255,255,255,0.08)",
                        background: selected ? `${mode.accentColor}14` : "rgba(255,255,255,0.025)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                        <div>
                          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px", color: mode.accentColor }}>
                            {mode.shortLabel}
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>{mode.constellation}</div>
                        </div>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", textAlign: "right" }}>
                          <div>{mode.questionCount} questions</div>
                          <div>{formatDuration(mode.durationMinutes)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>{mode.description}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: "18px",
                padding: "1.2rem",
              }}
            >
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "0.9rem" }}>
                full test modes
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
                {FULL_TESTS.map((mode) => {
                  const selected = mode.key === selectedMode.key;
                  return (
                    <button
                      key={mode.key}
                      onClick={() => setSelectedModeKey(mode.key)}
                      style={{
                        textAlign: "left",
                        borderRadius: "16px",
                        padding: "1rem",
                        border: selected
                          ? `0.5px solid ${mode.accentColor}66`
                          : "0.5px solid rgba(255,255,255,0.08)",
                        background: selected ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.025)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                        <div>
                          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px", color: mode.accentColor }}>
                            {mode.shortLabel}
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>{mode.constellation}</div>
                        </div>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", textAlign: "right" }}>
                          <div>{mode.questionCount} questions</div>
                          <div>{formatDuration(mode.durationMinutes)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>{mode.description}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: "18px",
                padding: "1.2rem",
              }}
            >
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "0.9rem" }}>
                recent test history
              </div>
              {historyLoading ? (
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)" }}>
                  loading recent timed runs...
                </div>
              ) : history.length === 0 ? (
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                  Your completed practice tests will show up here with score and pacing reads once you start logging timed runs.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {history.map((entry) => (
                    <div
                      key={entry.sessionId}
                      style={{
                        borderRadius: "16px",
                        padding: "1rem",
                        background: "rgba(255,255,255,0.025)",
                        border: "0.5px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          alignItems: "flex-start",
                          marginBottom: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "24px", marginBottom: "4px" }}>
                            {entry.title}
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)" }}>
                            {entry.completedAt
                              ? new Date(entry.completedAt).toLocaleString([], {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : "completed run"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "28px", color: selectedMode.accentColor }}>
                            {entry.compositeEstimatedScore ? `${entry.compositeEstimatedScore}/36` : "--"}
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)" }}>
                            {entry.format === "full" ? "composite estimate" : "section estimate"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginBottom: "10px" }}>
                        {[
                          { value: `${entry.accuracyPct}%`, label: "accuracy" },
                          { value: formatDuration(Math.round(entry.durationSeconds / 60)), label: "duration" },
                          { value: entry.overallPacing.label, label: "pace" },
                        ].map((item) => (
                          <div
                            key={item.label}
                            style={{
                              borderRadius: "12px",
                              background: "rgba(255,255,255,0.03)",
                              padding: "0.8rem",
                              textAlign: "center",
                            }}
                          >
                            <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "20px", color: "#fff" }}>
                              {item.value}
                            </div>
                            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.32)" }}>{item.label}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: "10px" }}>
                        {entry.overallPacing.description}
                      </div>

                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {entry.sections.map((section) => (
                          <div
                            key={`${entry.sessionId}-${section.title}`}
                            style={{
                              padding: "8px 10px",
                              borderRadius: "999px",
                              background: "rgba(255,255,255,0.03)",
                              border: "0.5px solid rgba(255,255,255,0.08)",
                              fontSize: "11px",
                              color: "rgba(255,255,255,0.58)",
                            }}
                          >
                            {section.title} · {section.estimatedScore ?? "--"}/36 · {section.pacingSummary.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `0.5px solid ${selectedMode.accentColor}44`,
              borderRadius: "20px",
              padding: "1.25rem",
              position: "sticky",
              top: "1.5rem",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11px",
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: selectedMode.accentColor,
                marginBottom: "10px",
              }}
            >
              {selectedMode.format === "section" ? "section rehearsal" : "full test rehearsal"}
            </div>

            <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "30px", marginBottom: "10px" }}>
              {selectedMode.title}
            </div>
            <div style={{ fontSize: "13px", lineHeight: 1.7, color: "rgba(255,255,255,0.55)", marginBottom: "1rem" }}>
              {selectedMode.description}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "1rem" }}>
              {[
                { value: selectedMode.questionCount, label: "questions" },
                { value: formatDuration(selectedMode.durationMinutes), label: "timed" },
                { value: selectedMode.includesDesmos ? "desmos" : "focus", label: selectedMode.includesDesmos ? "math tool" : "mode" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    borderRadius: "14px",
                    background: "rgba(255,255,255,0.035)",
                    border: "0.5px solid rgba(255,255,255,0.08)",
                    padding: "0.9rem 0.8rem",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "24px", color: selectedMode.accentColor }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.32)" }}>{item.label}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                borderRadius: "14px",
                background: "rgba(255,255,255,0.03)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                padding: "0.95rem 1rem",
                marginBottom: "1rem",
              }}
            >
              <div style={{ fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,0.34)", marginBottom: "8px" }}>
                section flow
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                {selectedMode.sections.map((section, index) => (
                  <div
                    key={section.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.62)",
                    }}
                  >
                    <span>
                      {index + 1}. {section.label}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.36)" }}>
                      {section.questionCount}q · {section.durationMinutes}m
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                fontSize: "12px",
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.5)",
                padding: "0.95rem 1rem",
                background: "rgba(255,255,255,0.03)",
                borderRadius: "14px",
                borderLeft: `2px solid ${selectedMode.accentColor}`,
                marginBottom: "1rem",
              }}
            >
              Timed section runs, full-test orchestration, database persistence, score reports, missed-question review, and
              Math calculator support are now part of the live practice-test flow.
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => router.push("/dashboard")}
                style={{
                  flex: 1,
                  padding: "11px 12px",
                  borderRadius: "12px",
                  background: "transparent",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                back to universe
              </button>
              <button
                onClick={() => {
                  router.push(`/practice-tests/run?mode=${selectedMode.key}`);
                }}
                style={{
                  flex: 1.4,
                  padding: "11px 12px",
                  borderRadius: "12px",
                  background: selectedMode.accentColor,
                  border: "none",
                  color: "#081018",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                  opacity: 0.92,
                }}
              >
                {selectedMode.format === "section" ? "start timed section →" : "start full test →"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
