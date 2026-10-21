"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { setTourActiveFlag } from "@/components/useTourActive";

type TourStop = {
  id: string;
  path: string;
  selector: string;
  navSelector?: string;
  title: string;
  body: string;
  optional?: boolean;
};

// Keep this copy in lockstep with docs/homepage-design/Tour.dc.html.
export const STUDENT_TOUR_STOPS: TourStop[] = [
  { id: "universe", path: "/dashboard", selector: '[data-tour-target="universe"]', title: "This is your universe", body: "Every star is an ACT skill. Your four sections are four constellations." },
  { id: "bright-star", path: "/dashboard", selector: '[data-tour-target="bright-star"]', title: "Bright stars = ready to practice", body: "Click any star to practice that skill. It glows brighter as you improve." },
  { id: "filters", path: "/dashboard", selector: '[data-tour-target="section-filters"]', title: "Focus on one section", body: "Filter your map to English, Math, Reading or Science." },
  { id: "live-lesson", path: "/dashboard", selector: 'section[data-tour-target="live-lesson"]', title: "Live lessons with Astra", body: "Join Astra, our AI tutor, live every Sunday at 5 PM PT. Free for Aced students.", optional: true },
  { id: "mock-tile", path: "/dashboard", selector: 'section[aria-label="ACED Mock Test"]', title: "The Aced Mock Test", body: "A full, timed practice test on Sat, Dec 5. Seats are limited." },
  { id: "practice-tests", path: "/practice-tests", selector: '[data-tour-target="practice-tests"]', navSelector: '[data-tour-nav="practice-tests"]', title: "Practice tests", body: "Timed sets for each section, just like test day. Your recent scores show up below." },
  { id: "progress", path: "/progress", selector: '[data-tour-target="progress"]', navSelector: '[data-tour-nav="progress"]', title: "Your progress", body: "See your scores and exactly which skills need work, so you never study blind." },
  { id: "mock-test", path: "/mock-test", selector: '[data-tour-target="mock-test-page"]', navSelector: '[data-tour-nav="mock-test"]', title: "Mock test details", body: "Sign up and see everything about test day right here." },
];

const SESSION_KEY = "aced:student-tour";
const TOUR_EVENT = "aced:tour:start";
const MOTION_MS = 600;

type TourStage = "welcome" | "target" | "traveling" | "finish";
type SpotlightRect = { top: number; left: number; width: number; height: number; radius: number };

function readSessionState() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "null") as { active?: boolean; index?: number } | null;
    return parsed?.active && Number.isInteger(parsed.index) ? parsed : null;
  } catch {
    return null;
  }
}

function saveSessionState(index: number) {
  try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ active: true, index })); } catch {}
}

function clearSessionState() {
  try { window.sessionStorage.removeItem(SESSION_KEY); } catch {}
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function rectFor(element: HTMLElement): SpotlightRect {
  const rect = element.getBoundingClientRect();
  if (element.dataset.tourShape === "circle") {
    const size = Math.max(rect.width, rect.height) + 28;
    return { top: rect.top + rect.height / 2 - size / 2, left: rect.left + rect.width / 2 - size / 2, width: size, height: size, radius: 999 };
  }
  const padding = 10;
  return {
    top: Math.max(8, rect.top - padding),
    left: Math.max(8, rect.left - padding),
    width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
    height: Math.min(window.innerHeight - 16, rect.height + padding * 2),
    radius: Math.min(24, Math.max(14, Math.min(rect.width, rect.height) / 2)),
  };
}

function overlaps(rect: { top: number; left: number; width: number; height: number }, target: SpotlightRect, gap = 14) {
  return !(rect.left + rect.width + gap <= target.left || rect.left >= target.left + target.width + gap || rect.top + rect.height + gap <= target.top || rect.top >= target.top + target.height + gap);
}

function tooltipPosition(target: SpotlightRect) {
  const width = Math.min(340, window.innerWidth - 32);
  const height = 234;
  const candidates = [
    { top: target.top + target.height + 18, left: target.left + target.width / 2 - width / 2 },
    { top: target.top - height - 18, left: target.left + target.width / 2 - width / 2 },
    { top: target.top + target.height / 2 - height / 2, left: target.left + target.width + 18 },
    { top: target.top + target.height / 2 - height / 2, left: target.left - width - 18 },
  ];
  const safe = candidates.find((candidate) => {
    const rect = { top: candidate.top, left: candidate.left, width, height };
    return rect.top >= 16 && rect.left >= 16 && rect.top + height <= window.innerHeight - 16 && rect.left + width <= window.innerWidth - 16 && !overlaps(rect, target);
  }) ?? candidates[0];
  return { width, top: Math.max(16, Math.min(window.innerHeight - height - 16, safe.top)), left: Math.max(16, Math.min(window.innerWidth - width - 16, safe.left)) };
}

function AstraMark() {
  return <svg width="62" height="62" viewBox="0 0 200 264" aria-hidden="true" style={{ filter: "drop-shadow(0 0 18px rgba(93,202,165,.35))" }}><rect x="48" y="132" width="104" height="92" rx="26" fill="#F2F5FA"/><rect x="52" y="186" width="96" height="12" fill="#5DCAA5"/><circle cx="100" cy="82" r="66" fill="#F4F6FA" stroke="#5DCAA5" strokeWidth="5"/><ellipse cx="100" cy="88" rx="50" ry="41" fill="#0A1120"/><ellipse cx="83" cy="86" rx="6" ry="7" fill="#F4F8FF"/><ellipse cx="117" cy="86" rx="6" ry="7" fill="#F4F8FF"/><ellipse cx="100" cy="106" rx="8" ry="2" fill="#FF9EA8"/><rect x="62" y="218" width="30" height="34" rx="10" fill="#E9EEF5"/><rect x="108" y="218" width="30" height="34" rx="10" fill="#E9EEF5"/></svg>;
}

export default function StudentTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [stage, setStage] = useState<TourStage>("welcome");
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const transitionTimer = useRef<number | null>(null);
  const targetTimer = useRef<number | null>(null);
  const stop = STUDENT_TOUR_STOPS[index];
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;

  useEffect(() => {
    setTourActiveFlag(active);
    return () => setTourActiveFlag(false);
  }, [active]);

  const clearTimers = useCallback(() => {
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    if (targetTimer.current) window.clearTimeout(targetTimer.current);
    transitionTimer.current = null;
    targetTimer.current = null;
  }, []);

  const complete = useCallback(async () => {
    clearTimers();
    setActive(false);
    setTooltipVisible(false);
    setFinishing(false);
    clearSessionState();
    setSaving(true);
    try {
      await fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walkthroughCompleted: true }) });
    } finally {
      setSaving(false);
    }
  }, [clearTimers]);

  const openWelcome = useCallback(() => {
    clearTimers();
    setIndex(0);
    setTarget(null);
    setSpotlight(null);
    setTooltipVisible(false);
    setStage("welcome");
    setActive(true);
    saveSessionState(0);
    if (pathname !== "/dashboard") router.push("/dashboard");
  }, [clearTimers, pathname, router]);

  const skipMissing = useCallback(() => {
    if (index >= STUDENT_TOUR_STOPS.length - 1) {
      setStage("finish");
      setTarget(null);
      setSpotlight(null);
      setTooltipVisible(false);
      return;
    }
    setIndex((value) => {
      const next = value + 1;
      saveSessionState(next);
      return next;
    });
  }, [index]);

  const goTo = useCallback((nextIndex: number) => {
    const next = STUDENT_TOUR_STOPS[nextIndex];
    if (!next) return;
    clearTimers();
    setTooltipVisible(false);
    setIndex(nextIndex);
    saveSessionState(nextIndex);
    if (pathname === next.path) {
      setTarget(null);
      setSpotlight(null);
      setStage("target");
      return;
    }
    const nav = next.navSelector ? document.querySelector<HTMLElement>(next.navSelector) : null;
    if (nav) {
      setTarget(nav);
      setSpotlight(rectFor(nav));
    }
    setStage("traveling");
    transitionTimer.current = window.setTimeout(() => router.push(next.path), prefersReducedMotion() ? 0 : MOTION_MS);
  }, [clearTimers, pathname, router]);

  const beginFinish = useCallback(() => {
    clearTimers();
    setTooltipVisible(false);
    setFinishing(true);
    if (pathname === "/dashboard") {
      setTarget(null);
      setSpotlight(null);
      setStage("finish");
      return;
    }
    const nav = document.querySelector<HTMLElement>('[data-tour-nav="universe"]');
    if (nav) {
      setTarget(nav);
      setSpotlight(rectFor(nav));
    }
    setStage("traveling");
    transitionTimer.current = window.setTimeout(() => router.push("/dashboard"), prefersReducedMotion() ? 0 : MOTION_MS);
  }, [clearTimers, pathname, router]);

  useEffect(() => {
    let mounted = true;
    void fetch("/api/onboarding", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!mounted || !data?.isComplete) return;
        setLoaded(true);
        const resumed = readSessionState();
        if (resumed) {
          setIndex(Math.max(0, Math.min(STUDENT_TOUR_STOPS.length - 1, resumed.index ?? 0)));
          setStage("target");
          setActive(true);
        } else if (!data.profile?.walkthroughCompletedAt) {
          setStage("welcome");
          setActive(true);
          saveSessionState(0);
        }
      })
      .catch(() => setLoaded(true));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const start = () => openWelcome();
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, [openWelcome]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!active || stage !== "target" || !stop) return;
    let attempts = 0;
    let cancelled = false;
    const findTarget = () => {
      if (cancelled) return;
      if (pathname !== stop.path) {
        router.push(stop.path);
        return;
      }
      const element = document.querySelector<HTMLElement>(stop.selector);
      if (element) {
        element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: phone ? "start" : "center", inline: "nearest" });
        targetTimer.current = window.setTimeout(() => {
          if (cancelled) return;
          setTarget(element);
          setSpotlight(rectFor(element));
          setTooltipVisible(false);
          targetTimer.current = window.setTimeout(() => !cancelled && setTooltipVisible(true), prefersReducedMotion() ? 0 : MOTION_MS);
        }, prefersReducedMotion() ? 0 : 140);
        return;
      }
      attempts += 1;
      if (attempts >= 35) {
        skipMissing();
        return;
      }
      targetTimer.current = window.setTimeout(findTarget, 120);
    };
    targetTimer.current = window.setTimeout(findTarget, pathname === stop.path ? 100 : 0);
    return () => { cancelled = true; if (targetTimer.current) window.clearTimeout(targetTimer.current); };
  }, [active, index, pathname, phone, router, skipMissing, stage, stop]);

  useEffect(() => {
    const destination = finishing ? "/dashboard" : stop?.path;
    if (!active || stage !== "traveling" || !destination || pathname !== destination) return;
    setTarget(null);
    setSpotlight(null);
    setStage(finishing ? "finish" : "target");
  }, [active, finishing, pathname, stage, stop]);

  useEffect(() => {
    if (!active || !target || stage !== "target") return;
    const update = () => setSpotlight(rectFor(target));
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [active, stage, target]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") void complete(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, complete]);

  const position = useMemo(() => spotlight ? tooltipPosition(spotlight) : null, [spotlight]);
  if (!loaded || !active || !stop) return null;
  const showWelcome = stage === "welcome";
  const showFinish = stage === "finish";
  const showTip = stage === "target" && Boolean(spotlight) && tooltipVisible && !showWelcome && !showFinish;
  const dim = spotlight ? { top: spotlight.top, left: spotlight.left, right: window.innerWidth - spotlight.left - spotlight.width, bottom: window.innerHeight - spotlight.top - spotlight.height } : null;

  return <div aria-live="polite" style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: "none", fontFamily: "var(--font-dm-sans), DM Sans, sans-serif" }}>
    <style>{`.student-tour-spotlight{transition:left .6s cubic-bezier(.65,0,.35,1),top .6s cubic-bezier(.65,0,.35,1),width .6s cubic-bezier(.65,0,.35,1),height .6s cubic-bezier(.65,0,.35,1),border-radius .6s,box-shadow .5s}.student-tour-tip{transition:opacity .3s ease,transform .3s ease}.student-tour-modal{transition:opacity .35s ease,transform .35s ease}.student-tour-page-fade{animation:student-tour-page-fade .4s ease both}@keyframes student-tour-page-fade{0%{opacity:0}50%{opacity:.25}100%{opacity:0}}@media (prefers-reduced-motion:reduce){.student-tour-spotlight,.student-tour-tip,.student-tour-modal,.student-tour-page-fade{transition:none!important;animation:none!important}}`}</style>
    {stage === "traveling" ? <div aria-hidden="true" className="student-tour-page-fade" style={{ position: "fixed", inset: 0, background: "#070B14", pointerEvents: "none" }} /> : null}
    {dim ? <><div style={{ position: "fixed", top: 0, left: 0, right: 0, height: dim.top, background: "rgba(3,7,14,.74)", pointerEvents: "auto" }} /><div style={{ position: "fixed", top: dim.top, left: 0, width: dim.left, height: spotlight?.height, background: "rgba(3,7,14,.74)", pointerEvents: "auto" }} /><div style={{ position: "fixed", top: dim.top, left: window.innerWidth - dim.right, right: 0, height: spotlight?.height, background: "rgba(3,7,14,.74)", pointerEvents: "auto" }} /><div style={{ position: "fixed", top: window.innerHeight - dim.bottom, left: 0, right: 0, bottom: 0, background: "rgba(3,7,14,.74)", pointerEvents: "auto" }} /><div aria-hidden="true" className="student-tour-spotlight" style={{ position: "fixed", top: spotlight?.top, left: spotlight?.left, width: spotlight?.width, height: spotlight?.height, borderRadius: spotlight?.radius, border: "2px solid #5DCAA5", boxShadow: "0 0 0 1px rgba(238,241,245,.34),0 0 30px 4px rgba(93,202,165,.34)", pointerEvents: "none" }} /></> : <div style={{ position: "fixed", inset: 0, background: "rgba(3,7,14,.68)", pointerEvents: "auto" }} />}
    {showTip && position ? (
      <section role="dialog" aria-modal="true" aria-label={`Tour step ${index + 1}`} className="student-tour-tip" style={{ position: "fixed", zIndex: 2, pointerEvents: "auto", width: phone ? "auto" : position.width, left: phone ? 16 : position.left, right: phone ? 16 : undefined, top: phone ? undefined : position.top, bottom: phone ? 16 : undefined, borderRadius: 18, padding: "20px 22px", background: "#0F1B2C", border: "1px solid #2A3B52", boxShadow: "0 20px 50px rgba(0,0,0,.6)", color: "#EEF1F5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AstraMark />
          <span style={{ fontSize: 12, letterSpacing: ".14em", fontWeight: 700, color: "#5DCAA5" }}>{index + 1} OF {STUDENT_TOUR_STOPS.length}</span>
          <button type="button" onClick={() => void complete()} disabled={saving} style={{ marginLeft: "auto", border: 0, background: "transparent", color: "#8D97A6", cursor: "pointer", fontSize: 13 }}>Skip tour</button>
        </div>
        <h2 style={{ fontFamily: "var(--font-playfair), Playfair Display, serif", margin: "12px 0 0", fontSize: 22, lineHeight: 1.25 }}>{stop.title}</h2>
        <p style={{ color: "#B4BCC8", margin: "6px 0 0", lineHeight: 1.5, fontSize: 15 }}>{stop.body}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <div aria-label={`${index + 1} of ${STUDENT_TOUR_STOPS.length} tour steps`} style={{ display: "flex", gap: 5 }}>
            {STUDENT_TOUR_STOPS.map((item, dot) => <span key={item.id} style={{ width: dot === index ? 18 : 6, height: 6, borderRadius: 999, background: dot <= index ? "#5DCAA5" : "#2A3B52", transition: "width .4s ease" }} />)}
          </div>
          {index > 0 ? <button type="button" onClick={() => goTo(index - 1)} style={{ marginLeft: "auto", border: "1px solid #2A3B52", borderRadius: 999, background: "transparent", color: "#B4BCC8", padding: "8px 14px", cursor: "pointer" }}>Back</button> : <span style={{ marginLeft: "auto" }} />}
          <button type="button" onClick={() => index === STUDENT_TOUR_STOPS.length - 1 ? beginFinish() : goTo(index + 1)} style={{ border: 0, borderRadius: 999, background: "#5DCAA5", color: "#072019", padding: "9px 18px", fontWeight: 700, cursor: "pointer" }}>Next</button>
        </div>
      </section>
    ) : null}
    {(showWelcome || showFinish) ? <section role="dialog" aria-modal="true" aria-label={showFinish ? "Tour complete" : "Welcome to Aced"} className="student-tour-modal" style={{ position: "fixed", zIndex: 2, pointerEvents: "auto", width: "min(460px, calc(100vw - 32px))", boxSizing: "border-box", left: "50%", top: "50%", transform: "translate(-50%,-50%)", borderRadius: 18, padding: "36px 40px", textAlign: "center", background: "#0F1B2C", border: "1px solid #2A3B52", boxShadow: "0 30px 70px rgba(0,0,0,.66)", color: "#EEF1F5" }}><AstraMark /><h2 style={{ fontFamily: "var(--font-playfair), Playfair Display, serif", fontSize: 30, lineHeight: 1.12, margin: "14px 0 0" }}>{showFinish ? "You’re all set! ✦" : "Welcome to Aced!"}</h2><p style={{ color: "#B4BCC8", margin: "10px 0 0", lineHeight: 1.5, fontSize: 16 }}>{showFinish ? "Click any bright star to start practicing." : "I’m Astra, your AI tutor. Want a quick 1-minute tour of your new universe?"}</p><div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 26 }}>{showWelcome ? <button type="button" onClick={() => void complete()} disabled={saving} style={{ border: "1px solid #2A3B52", borderRadius: 999, background: "transparent", color: "#B4BCC8", padding: "12px 20px", cursor: "pointer" }}>Maybe later</button> : null}<button type="button" onClick={() => showFinish ? void complete() : goTo(0)} disabled={saving} style={{ border: 0, borderRadius: 999, background: "#5DCAA5", color: "#072019", padding: "12px 26px", fontWeight: 700, cursor: "pointer" }}>{showFinish ? "Start practicing" : "Show me around"}</button></div></section> : null}
  </div>;
}

export function startStudentTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}
