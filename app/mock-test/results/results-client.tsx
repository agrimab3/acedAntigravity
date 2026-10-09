"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import NightSky from "@/components/NightSky";
import { MOCK_SECTIONS } from "@/lib/mockTests";
import styles from "./results.module.css";

type SectionKey = "english" | "math" | "reading" | "science";
type TransitionPhase =
  | "countdown"
  | "zero"
  | "converge"
  | "hold"
  | "ignite"
  | "form"
  | "sections"
  | "rank"
  | "rest"
  | "done";

type ReleasedPayload = {
  released: true;
  completed: true;
  releaseAt: string;
  timeZone: string;
  scoringLabel: string;
  scoringNote: string;
  composite: number;
  percentile: number;
  sectionScores: Record<SectionKey, number>;
  sectionStats: Record<SectionKey, { correct: number; total: number }>;
  topicBreakdown: Array<{
    sectionKey: SectionKey;
    topicId: string;
    topicName: string;
    correct: number;
    total: number;
    accuracyPct: number;
  }>;
  compositeDistribution: Record<string, number>;
  cohortCount: number;
  actDate: string;
  answers: Array<unknown>;
};

type ResultsPayload =
  | { released: false; releaseAt: string; cohortCount: number }
  | { released: true; completed: false; releaseAt: string }
  | ReleasedPayload;

type SparkVector = {
  key: SectionKey;
  left: number;
  top: number;
  midX: number;
  midY: number;
  endX: number;
  endY: number;
  delayMs: number;
};

const REVEAL_KEY = "aced-mock-reveal-seen-2026-12-05";
const SECTION_ORDER: SectionKey[] = ["english", "math", "reading", "science"];
const PHASE_ORDER: TransitionPhase[] = [
  "countdown",
  "zero",
  "converge",
  "hold",
  "ignite",
  "form",
  "sections",
  "rank",
  "rest",
  "done",
];

const SECTION_META: Record<
  SectionKey,
  { label: string; constellation: string; color: string }
> = {
  english: { label: "english", constellation: "Gemini", color: "#5DCAA5" },
  math: { label: "math", constellation: "Aquarius", color: "#AFA9EC" },
  reading: { label: "reading", constellation: "Virgo", color: "#EF9F27" },
  science: { label: "science", constellation: "Sagittarius", color: "#F0997B" },
};

function phaseAtLeast(phase: TransitionPhase, target: TransitionPhase) {
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(target);
}

function splitRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
  };
}

function revealWasSeen() {
  try {
    return window.localStorage.getItem(REVEAL_KEY) === "1";
  } catch {
    return false;
  }
}

function markRevealSeen() {
  try {
    window.localStorage.setItem(REVEAL_KEY, "1");
  } catch {
    // The visual state still completes if storage is unavailable.
  }
}

function clearRevealSeen() {
  try {
    window.localStorage.removeItem(REVEAL_KEY);
  } catch {
    // Reloading still replays in environments where storage is unavailable.
  }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

function CountUp({
  value,
  active,
  instant,
  duration = 1200,
  className,
}: {
  value: number;
  active: boolean;
  instant: boolean;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(instant ? value : 0);

  useEffect(() => {
    if (instant || reduced) {
      const id = window.requestAnimationFrame(() => setDisplay(value));
      return () => window.cancelAnimationFrame(id);
    }
    if (!active) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, duration, instant, reduced, value]);

  return <span className={className}>{display}</span>;
}

function CompositeRing({
  value,
  active,
  instant,
}: {
  value: number;
  active: boolean;
  instant: boolean;
}) {
  const reduced = useReducedMotion();
  const radius = 92;
  const circumference = 2 * Math.PI * radius;
  const [progress, setProgress] = useState(instant ? value / 36 : 0);

  useEffect(() => {
    if (instant || reduced) {
      const id = window.requestAnimationFrame(() => setProgress(value / 36));
      return () => window.cancelAnimationFrame(id);
    }
    if (!active) return;

    const id = window.requestAnimationFrame(() => setProgress(value / 36));
    return () => window.cancelAnimationFrame(id);
  }, [active, instant, reduced, value]);

  return (
    <div className={styles.compositeRingWrap}>
      <svg className={styles.compositeRing} viewBox="0 0 220 220" aria-hidden="true">
        <circle cx="110" cy="110" r={radius} className={styles.ringTrack} />
        <circle
          cx="110"
          cy="110"
          r={radius}
          className={styles.ringProgress}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <div className={styles.compositeRingValue}>
        <CountUp
          value={value}
          active={active}
          instant={instant}
          duration={900}
          className={styles.compositeNumber}
        />
        <span>out of 36</span>
      </div>
    </div>
  );
}

export default function ResultsClient({
  email,
  previewSeconds,
  previewReleased,
  allowDevControls,
  serverNow,
  localReleaseTime,
}: {
  email: string;
  previewSeconds: number | null;
  previewReleased: boolean;
  allowDevControls: boolean;
  serverNow: string;
  localReleaseTime: string;
}) {
  const reducedMotion = useReducedMotion();
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [pendingReleased, setPendingReleased] = useState<ReleasedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [phase, setPhase] = useState<TransitionPhase>("countdown");
  const [transitioning, setTransitioning] = useState(false);
  const [transitionMode, setTransitionMode] = useState<"full" | "short" | null>(null);
  const [playValueAnimations, setPlayValueAnimations] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [sparks, setSparks] = useState<SparkVector[]>([]);

  const transitionStartRef = useRef<number | null>(null);
  const readyStartRef = useRef<number | null>(null);
  const transitionStartedRef = useRef(false);
  const resultFetchStartedRef = useRef(false);
  const pollRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const announcedRef = useRef(false);
  const compositeRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<SectionKey, HTMLElement | null>>({
    english: null,
    math: null,
    reading: null,
    science: null,
  });

  const fetchPayload = useCallback(async (url: string) => {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "Could not load mock-test results.");
    }
    return body as ResultsPayload;
  }, []);

  const beginTransition = useCallback(
    (mode: "full" | "short", ready?: ReleasedPayload) => {
      if (transitionStartedRef.current) return;
      transitionStartedRef.current = true;
      setTransitionMode(mode);
      setTransitioning(true);
      setPlayValueAnimations(true);
      setPhase(mode === "full" ? "zero" : "converge");
      transitionStartRef.current = performance.now() - (mode === "short" ? 300 : 0);
      readyStartRef.current = null;
      if (ready) setPendingReleased(ready);

      window.scrollTo({ top: 0, behavior: "auto" });
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    },
    []
  );

  const acceptReleasedPayload = useCallback((payload: ResultsPayload) => {
    if (payload.released && payload.completed) {
      setPendingReleased(payload);
      return true;
    }
    return false;
  }, []);

  const fetchReleasedAtZero = useCallback(async () => {
    if (resultFetchStartedRef.current) return;
    resultFetchStartedRef.current = true;

    try {
      let payload = await fetchPayload("/api/mock-test/results");
      if (acceptReleasedPayload(payload)) return;

      if (allowDevControls && previewSeconds !== null) {
        const releaseResponse = await fetch("/api/mock-test/dev/release-results", {
          method: "POST",
        });
        const releaseBody = await releaseResponse.json();
        if (!releaseResponse.ok) {
          throw new Error(releaseBody.error || "Could not release DEV results.");
        }
        payload = await fetchPayload("/api/mock-test/results?previewReleased=1");
        acceptReleasedPayload(payload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not release results.");
    }
  }, [
    acceptReleasedPayload,
    allowDevControls,
    fetchPayload,
    previewSeconds,
  ]);

  useEffect(() => {
    let cancelled = false;
    const initialUrl = previewReleased
      ? "/api/mock-test/results?previewReleased=1"
      : allowDevControls && previewSeconds !== null
        ? "/api/mock-test/results?previewCountdown=1"
        : "/api/mock-test/results";

    void fetchPayload(initialUrl)
      .then((body) => {
        if (cancelled) return;

        setData(body);
        if (body.released && body.completed) {
          if (revealWasSeen()) {
            setPhase("done");
            setPlayValueAnimations(false);
          } else {
            setPendingReleased(body);
            beginTransition("short", body);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load results.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    allowDevControls,
    beginTransition,
    fetchPayload,
    previewReleased,
    previewSeconds,
  ]);

  useEffect(() => {
    if (!data || data.released || transitioning) return;

    const releaseMs = new Date(data.releaseAt).getTime();
    const clientStartMs = Date.now();
    const serverStartMs = new Date(serverNow).getTime();
    const previewEnd =
      previewSeconds !== null ? clientStartMs + previewSeconds * 1000 : null;

    const tick = () => {
      const now = Date.now();
      const nextRemaining =
        previewEnd !== null
          ? Math.max(0, previewEnd - now)
          : Math.max(0, releaseMs - (serverStartMs + (now - clientStartMs)));

      setRemainingMs(nextRemaining);

      if (nextRemaining <= 0 && !transitionStartedRef.current) {
        beginTransition("full");
        void fetchReleasedAtZero();
      }
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [
    beginTransition,
    data,
    fetchReleasedAtZero,
    previewSeconds,
    serverNow,
    transitioning,
  ]);

  useEffect(() => {
    if (!transitioning) return;

    const frame = (now: number) => {
      const start = transitionStartRef.current ?? now;
      const beforeReady = now - start;
      let nextPhase: TransitionPhase;

      if (reducedMotion && pendingReleased) {
        if (readyStartRef.current === null) readyStartRef.current = now;
        const reducedElapsed = now - readyStartRef.current;
        nextPhase = reducedElapsed < 300 ? "rest" : "done";
      } else if (beforeReady < 300) {
        nextPhase = "zero";
      } else if (beforeReady < 1100) {
        nextPhase = "converge";
      } else if (!pendingReleased) {
        nextPhase = "hold";
      } else {
        if (readyStartRef.current === null) readyStartRef.current = now;
        const afterReady = now - readyStartRef.current;
        if (afterReady < 350) nextPhase = "ignite";
        else if (afterReady < 1250) nextPhase = "form";
        else if (afterReady < 1850) nextPhase = "sections";
        else if (afterReady < 2350) nextPhase = "rank";
        else if (afterReady < 2850) nextPhase = "rest";
        else nextPhase = "done";
      }

      setPhase((current) => (current === nextPhase ? current : nextPhase));

      if (nextPhase === "done") {
        if (pendingReleased) setData(pendingReleased);
        markRevealSeen();
        setTransitioning(false);
        setTransitionMode(null);
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
        return;
      }

      rafRef.current = window.requestAnimationFrame(frame);
    };

    rafRef.current = window.requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [pendingReleased, reducedMotion, transitioning]);

  useEffect(() => {
    if (!transitioning || phase !== "hold" || pendingReleased) return;

    const poll = () => {
      void fetchPayload("/api/mock-test/results")
        .then((payload) => {
          if (payload.released && payload.completed) setPendingReleased(payload);
        })
        .catch(() => {});
    };

    poll();
    pollRef.current = window.setInterval(poll, 5000);
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [fetchPayload, pendingReleased, phase, transitioning]);

  useEffect(() => {
    if (
      phaseAtLeast(phase, "sections") &&
      pendingReleased &&
      !announcedRef.current
    ) {
      announcedRef.current = true;
      setAnnouncement(
        "Your scores are in. Composite " + pendingReleased.composite + "."
      );
    }
  }, [pendingReleased, phase]);

  useEffect(() => {
    if (phase !== "sections" || reducedMotion || window.innerWidth < 720) {
      setSparks([]);
      return;
    }

    const source = compositeRef.current?.getBoundingClientRect();
    if (!source) return;

    const targets = SECTION_ORDER.map((key) => ({
      key,
      rect: sectionRefs.current[key]?.getBoundingClientRect() ?? null,
    }));

    if (
      targets.some(
        ({ rect }) =>
          !rect ||
          rect.top < 0 ||
          rect.bottom > window.innerHeight ||
          rect.left < 0 ||
          rect.right > window.innerWidth
      )
    ) {
      setSparks([]);
      return;
    }

    const sourceX = source.left + source.width / 2;
    const sourceY = source.top + source.height / 2;

    setSparks(
      targets.map(({ key, rect }, index) => {
        const target = rect!;
        const endX = target.left + target.width / 2 - sourceX;
        const endY = target.top + 8 - sourceY;
        const curve = index < 2 ? -54 : 54;
        return {
          key,
          left: sourceX,
          top: sourceY,
          midX: endX * 0.46 + curve,
          midY: endY * 0.38 - 72,
          endX,
          endY,
          delayMs: index * 80,
        };
      })
    );
  }, [phase, reducedMotion]);

  useEffect(() => {
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const released =
    pendingReleased ??
    (data?.released && data.completed ? (data as ReleasedPayload) : null);
  const instantFinal = phase === "done" && !playValueAnimations;
  const countdown = remainingMs === null ? null : splitRemaining(remainingMs);
  const finalTen = Boolean(
    !transitioning &&
      data &&
      !data.released &&
      countdown &&
      countdown.totalSeconds <= 10 &&
      countdown.totalSeconds > 0
  );

  const timerText = countdown
    ? countdown.hours +
      ":" +
      String(countdown.minutes).padStart(2, "0") +
      ":" +
      String(countdown.seconds).padStart(2, "0")
    : "—:——:——";

  const strongest = released
    ? SECTION_ORDER.reduce(
        (best, key) =>
          released.sectionScores[key] > released.sectionScores[best] ? key : best,
        SECTION_ORDER[0]
      )
    : "english";
  const weakest = released
    ? SECTION_ORDER.reduce(
        (worst, key) =>
          released.sectionScores[key] < released.sectionScores[worst] ? key : worst,
        SECTION_ORDER[0]
      )
    : "english";
  const weakestTopic = released
    ? released.topicBreakdown
        .filter((topic) => topic.sectionKey === weakest)
        .sort((a, b) => a.accuracyPct - b.accuracyPct || b.total - a.total)[0] ??
      null
    : null;
  const actDays = released
    ? Math.max(
        0,
        Math.ceil(
          (new Date(released.actDate + "T12:00:00Z").getTime() -
            new Date(released.releaseAt).getTime()) /
            86_400_000
        )
      )
    : 0;
  const showRank = Boolean(released && released.cohortCount >= 10);
  const maxDistribution = released
    ? Math.max(
        1,
        ...Object.values(released.compositeDistribution).map((value) =>
          Number(value)
        )
      )
    : 1;

  function replayReveal() {
    clearRevealSeen();
    window.location.assign("/mock-test/results?previewReleased=1");
  }

  if (error) {
    return (
      <main className={styles.page}>
        <NightSky />
        <div className={styles.centerState}>
          <div className={styles.brand}>
            Aced<span>.</span>
          </div>
          <h1>results unavailable</h1>
          <p>{error}</p>
          <Link href="/dashboard" className={styles.outlineButton}>
            back to my universe
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className={styles.page}>
        <NightSky />
        <div className={styles.centerState}>Loading results…</div>
      </main>
    );
  }

  if (data.released && !data.completed && !transitioning) {
    return (
      <main className={styles.page}>
        <NightSky />
        <header className={styles.topBar}>
          <Link href="/dashboard" className={styles.brand}>
            Aced<span>.</span>
          </Link>
          <span>signed in as {email}</span>
        </header>
        <div className={styles.centerState}>
          <div className={styles.didNotTakeStar}>✦</div>
          <h1>no score this time.</h1>
          <p>
            This mock wasn&apos;t completed, so there isn&apos;t a score report to
            reveal.
          </p>
          <Link href="/dashboard" className={styles.primaryButton}>
            back to my universe
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className={
        styles.page +
        " " +
        (transitioning ? styles.transitioningPage : "") +
        " " +
        (transitionMode === "short" ? styles.shortTransition : "")
      }
      data-phase={phase}
    >
      <div className={phase === "ignite" ? styles.skyBrighten : ""}>
        <NightSky />
      </div>

      <div className={styles.screenReaderLive} aria-live="polite">
        {announcement}
      </div>

      <header className={styles.topBar}>
        <Link href="/dashboard" className={styles.brand}>
          Aced<span>.</span>
        </Link>
        <span>signed in as {email}</span>
      </header>

      <div className={styles.experienceShell}>
        <section className={styles.heroExperience}>
          <div className={styles.headlineSlot}>
            <div className={styles.countdownHeadline}>
              <h1>
                {finalTen ? (
                  <>
                    here it <em>comes…</em>
                  </>
                ) : (
                  <>
                    scores land <em>soon</em>
                  </>
                )}
              </h1>
              <p>Every student&apos;s results unlock at the exact same moment.</p>
            </div>

            <div className={styles.scoreHeadline}>
              <div className={styles.revealStars} aria-hidden="true">
                {MOCK_SECTIONS.map((section, index) => (
                  <span
                    key={section.key}
                    className={styles["revealStar" + (index + 1)]}
                    style={{ color: section.color }}
                  >
                    ✦
                  </span>
                ))}
              </div>
              <h1>
                your scores are <em>in.</em>
              </h1>
            </div>
          </div>

          <div className={styles.heroStage}>
            <div
              className={
                styles.solarSystem +
                (finalTen ? " " + styles.solarSystemFast : "")
              }
              aria-hidden="true"
            >
              <div className={styles.ringOuter}>
                <span className={styles.planetScience} />
              </div>
              <div className={styles.ringReading}>
                <span className={styles.planetReading} />
              </div>
              <div className={styles.ringMath}>
                <span className={styles.planetMath} />
              </div>
              <div className={styles.ringEnglish}>
                <span className={styles.planetEnglish} />
              </div>

              <div className={styles.solarCore}>
                <div className={styles.timerContents}>
                  <div className={styles.tMinus}>T–MINUS</div>
                  <div
                    className={
                      styles.solarTimer +
                      (finalTen ? " " + styles.solarTimerFinal : "")
                    }
                  >
                    {transitioning ? "0:00:00" : timerText}
                  </div>
                  <div className={styles.timerSubcopy}>
                    {finalTen ? "almost there ✦" : "until results unlock"}
                  </div>
                </div>
                <div className={styles.holdLabel}>unlocking…</div>
              </div>
            </div>

            <div className={styles.scoreFormation} ref={compositeRef}>
              <div className={styles.cardEyebrow}>COMPOSITE</div>
              {released ? (
                <CompositeRing
                  value={released.composite}
                  active={phaseAtLeast(phase, "form")}
                  instant={instantFinal}
                />
              ) : (
                <div className={styles.compositePlaceholder} />
              )}
            </div>

            <span className={styles.shockwave} aria-hidden="true" />
          </div>

          <div className={styles.heroFooterSlot}>
            <div className={styles.countdownFooter}>
              <div className={styles.releaseTimeLine}>
                at {localReleaseTime} <span>your time</span>
              </div>
              {!data.released ? (
                <div className={styles.studentCountLine}>
                  {data.cohortCount} students took the Dec 5 mock test · you&apos;re
                  one of them ✦
                </div>
              ) : null}
              {allowDevControls && !transitioning && !data.released ? (
                <Link
                  href="/mock-test/results?previewSeconds=10"
                  className={styles.devJumpButton}
                >
                  ▶ demo only: jump to the last 10 seconds
                </Link>
              ) : null}
            </div>

            <div className={styles.scoreFooter}>
              average of english, math, and reading
            </div>
          </div>
        </section>

        {released ? (
          <div className={styles.postHeroContent}>
            <article className={styles.percentileCard}>
              {showRank ? (
                <>
                  <h2>
                    You scored higher than{" "}
                    <strong>
                      <CountUp
                        value={released.percentile}
                        active={phaseAtLeast(phase, "rank")}
                        instant={instantFinal}
                        duration={500}
                      />
                      %
                    </strong>{" "}
                    of students on the Dec 5 mock test.
                  </h2>

                  <div
                    className={styles.histogram}
                    aria-label="Composite score distribution"
                  >
                    {Array.from({ length: 36 }, (_, index) => index + 1).map(
                      (score, index) => {
                        const count = Number(
                          released.compositeDistribution[String(score)] ?? 0
                        );
                        const height = Math.max(
                          3,
                          Math.round((count / maxDistribution) * 100)
                        );
                        const current = score === released.composite;

                        return (
                          <div
                            className={
                              styles.histogramColumn +
                              (current ? " " + styles.currentColumn : "")
                            }
                            key={score}
                            style={
                              {
                                "--bar-height": height + "%",
                                "--bar-delay": index * 11 + "ms",
                              } as CSSProperties
                            }
                          >
                            <span
                              className={current ? styles.currentBar : ""}
                            />
                            {current ? (
                              <div className={styles.youTag}>
                                ✦ you · {released.composite}
                              </div>
                            ) : null}
                            {score === 1 ||
                            score === 12 ||
                            score === 24 ||
                            score === 30 ||
                            score === 36 ? (
                              <small>{score}</small>
                            ) : (
                              <small />
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>

                  <div className={styles.chartLegend}>
                    <span>
                      <CountUp
                        value={released.cohortCount}
                        active={phaseAtLeast(phase, "rank")}
                        instant={instantFinal}
                        duration={500}
                      />{" "}
                      students
                    </span>
                    <span>composite score →</span>
                  </div>
                </>
              ) : (
                <div className={styles.privateRankCopy}>
                  <h2>
                    Your rank appears once at least 10 students have results.
                  </h2>
                  <p>Scores stay private while the cohort is still small.</p>
                </div>
              )}
            </article>

            <div className={styles.sectionCardsRow}>
              {SECTION_ORDER.map((key, index) => {
                const meta = SECTION_META[key];
                const stats = released.sectionStats[key];

                return (
                  <article
                    ref={(node) => {
                      sectionRefs.current[key] = node;
                    }}
                    className={styles.sectionCard}
                    key={key}
                    style={
                      {
                        borderTopColor: meta.color,
                        "--section-color": meta.color,
                        "--section-delay": index * 80 + "ms",
                      } as CSSProperties
                    }
                  >
                    <div className={styles.constellation}>
                      {meta.constellation}
                    </div>
                    <h3 style={{ color: meta.color }}>{meta.label}</h3>
                    <div
                      className={styles.sectionScore}
                      style={{
                        textShadow: "0 0 24px " + meta.color + "55",
                      }}
                    >
                      <CountUp
                        value={released.sectionScores[key]}
                        active={phaseAtLeast(phase, "sections")}
                        instant={instantFinal}
                        duration={600}
                      />
                    </div>
                    <p>
                      <CountUp
                        value={stats.correct}
                        active={phaseAtLeast(phase, "sections")}
                        instant={instantFinal}
                        duration={600}
                      />{" "}
                      / {stats.total} correct
                    </p>
                  </article>
                );
              })}
            </div>

            <section className={styles.insightGrid}>
              <article className={styles.brightestCard}>
                <div
                  className={styles.insightStar}
                  style={{
                    color: SECTION_META[strongest].color,
                    textShadow:
                      "0 0 16px " + SECTION_META[strongest].color,
                  }}
                  aria-hidden="true"
                >
                  ✦
                </div>
                <div>
                  <div
                    className={styles.insightLabel}
                    style={{ color: SECTION_META[strongest].color }}
                  >
                    YOUR BRIGHTEST STAR
                  </div>
                  <h2>
                    {strongest} · {released.sectionScores[strongest]}
                  </h2>
                  <p>
                    Your strongest section. Keep it warm with a quick drill
                    before Saturday.
                  </p>
                </div>
              </article>

              <article
                className={styles.nextStarCard}
                style={{
                  borderColor: SECTION_META[weakest].color + "66",
                  background:
                    "color-mix(in srgb, " +
                    SECTION_META[weakest].color +
                    " 12%, #0F1826)",
                }}
              >
                <div
                  className={styles.insightStarDim}
                  style={{ color: SECTION_META[weakest].color }}
                  aria-hidden="true"
                >
                  ✦
                </div>
                <div>
                  <div
                    className={styles.insightLabel}
                    style={{ color: SECTION_META[weakest].color }}
                  >
                    NEXT STAR TO LIGHT
                  </div>
                  <h2>
                    {weakest} · {released.sectionScores[weakest]}
                  </h2>
                  <p>
                    {weakestTopic ? (
                      <>Most missed: {weakestTopic.topicName}. </>
                    ) : null}
                    {actDays} days is enough to move this.
                  </p>
                  <Link
                    href={"/practice?section=" + weakest}
                    className={styles.practiceLink}
                    style={{ color: SECTION_META[weakest].color }}
                  >
                    practice now →
                  </Link>
                </div>
              </article>
            </section>

            <section className={styles.resultsBottom}>
              <div className={styles.bottomActions}>
                <Link href="/dashboard" className={styles.primaryButton}>
                  watch my sky light up ✦
                </Link>
                {allowDevControls ? (
                  <button
                    type="button"
                    className={styles.replayButton}
                    onClick={replayReveal}
                  >
                    replay reveal
                  </button>
                ) : null}
              </div>
              <p>
                Your real ACT is Saturday, Dec 12. {actDays} days to go.
              </p>
              <small>Estimated scores, not official ACT scores.</small>
            </section>
          </div>
        ) : null}
      </div>

      {phase === "ignite" ? (
        <>
          <div className={styles.fullScreenGlow} aria-hidden="true" />
          <div className={styles.backgroundFlash} aria-hidden="true" />
        </>
      ) : null}

      {phase === "sections" && sparks.length > 0
        ? sparks.map((spark) => (
            <span
              key={spark.key}
              className={styles.sectionSpark}
              aria-hidden="true"
              style={
                {
                  left: spark.left + "px",
                  top: spark.top + "px",
                  "--spark-color": SECTION_META[spark.key].color,
                  "--spark-mid-x": spark.midX + "px",
                  "--spark-mid-y": spark.midY + "px",
                  "--spark-end-x": spark.endX + "px",
                  "--spark-end-y": spark.endY + "px",
                  "--spark-delay": spark.delayMs + "ms",
                } as CSSProperties
              }
            />
          ))
        : null}
    </main>
  );
}
