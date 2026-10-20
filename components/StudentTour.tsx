"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type TourStop = {
  id: string;
  path: string;
  selector: string;
  title: string;
  body: string;
  optional?: boolean;
};

export const STUDENT_TOUR_STOPS: TourStop[] = [
  { id: "universe", path: "/dashboard", selector: '[data-tour-target="universe"]', title: "Your universe", body: "This is your star map. Every star is an ACT skill." },
  { id: "bright-star", path: "/dashboard", selector: '[data-tour-target="bright-star"]', title: "A bright star", body: "Click any star to practice that skill. Stars get brighter as you improve." },
  { id: "filters", path: "/dashboard", selector: '[data-tour-target="section-filters"]', title: "Section filters", body: "Filter by English, Math, Reading or Science." },
  { id: "live-lesson", path: "/dashboard", selector: '[data-tour-target="live-lesson"]', title: "Live Lesson", body: "Join Astra, our AI tutor, live every Sunday at 5 PM PT. Free for Aced students.", optional: true },
  { id: "mock-tile", path: "/dashboard", selector: '[data-tour-target="mock-test-tile"]', title: "Mock Test", body: "Take the full timed Aced Mock Test on Sat, Dec 5." },
  { id: "practice-tests", path: "/practice-tests", selector: '[data-tour-target="practice-tests"]', title: "Practice tests", body: "Timed practice for each section, just like test day." },
  { id: "progress", path: "/progress", selector: '[data-tour-target="progress"]', title: "Progress", body: "See your scores and which skills need work." },
  { id: "mock-test", path: "/mock-test", selector: '[data-tour-target="mock-test-page"]', title: "Mock test", body: "Sign up and see the test-day details here." },
  { id: "ready", path: "/dashboard", selector: '[data-tour-target="universe"]', title: "You’re ready!", body: "Click a star to start. ✦" },
];

const SESSION_KEY = "aced:student-tour";
const TOUR_EVENT = "aced:tour:start";

function readSessionState() {
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as { active?: boolean; index?: number };
    return parsed.active && Number.isInteger(parsed.index) ? parsed : null;
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

function rectFor(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return { top: Math.max(8, rect.top - 8), left: Math.max(8, rect.left - 8), width: Math.min(window.innerWidth - 16, rect.width + 16), height: Math.min(window.innerHeight - 16, rect.height + 16), radius: 18 };
}

export default function StudentTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [completedOnAccount, setCompletedOnAccount] = useState<boolean | null>(null);

  const stop = STUDENT_TOUR_STOPS[index];
  const isPhone = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;

  const finish = useCallback(async () => {
    setActive(false);
    clearSessionState();
    setSaving(true);
    try {
      await fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walkthroughCompleted: true }) });
      setCompletedOnAccount(true);
    } finally {
      setSaving(false);
    }
  }, []);

  const moveTo = useCallback((nextIndex: number) => {
    const next = STUDENT_TOUR_STOPS[nextIndex];
    if (!next) return;
    setReady(false);
    setTarget(null);
    setIndex(nextIndex);
    saveSessionState(nextIndex);
    if (pathname !== next.path) router.push(next.path);
  }, [pathname, router]);

  const skipMissing = useCallback(() => {
    if (index >= STUDENT_TOUR_STOPS.length - 1) void finish();
    else moveTo(index + 1);
  }, [finish, index, moveTo]);

  useEffect(() => {
    let alive = true;
    void fetch("/api/onboarding", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!alive || !data?.isComplete) return;
        const persisted = readSessionState();
        setCompletedOnAccount(Boolean(data.profile?.walkthroughCompletedAt));
        if (persisted) {
          setIndex(Math.max(0, Math.min(STUDENT_TOUR_STOPS.length - 1, persisted.index ?? 0)));
          setActive(true);
        } else if (!data.profile?.walkthroughCompletedAt) {
          setActive(true);
          saveSessionState(0);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const start = () => {
      setIndex(0);
      setActive(true);
      setReady(false);
      saveSessionState(0);
      if (pathname !== "/dashboard") router.push("/dashboard");
    };
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, [pathname, router]);

  useEffect(() => {
    if (!active || !stop) return;
    let attempts = 0;
    let timer = 0;
    const findTarget = () => {
      const element = document.querySelector<HTMLElement>(stop.selector);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: isPhone ? "start" : "center", inline: "nearest" });
        window.setTimeout(() => {
          setTarget(element);
          setLayoutTick((value) => value + 1);
          setReady(true);
        }, 260);
        return;
      }
      attempts += 1;
      if (attempts >= 35) {
        skipMissing();
        return;
      }
      timer = window.setTimeout(findTarget, 120);
    };
    const start = window.setTimeout(findTarget, pathname === stop.path ? 90 : 220);
    return () => { window.clearTimeout(start); window.clearTimeout(timer); };
  }, [active, index, isPhone, pathname, skipMissing, stop]);

  const rect = useMemo(() => target ? rectFor(target) : null, [target, layoutTick]);

  useEffect(() => {
    if (!active || !target) return;
    const update = () => setLayoutTick((value) => value + 1);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [active, target]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") void finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active || !stop || completedOnAccount === null || !ready || !rect) return null;

  const cardWidth = Math.min(380, window.innerWidth - 32);
  const cardHeight = 232;
  const placeBelow = rect.top < window.innerHeight / 2;
  const top = placeBelow ? Math.min(window.innerHeight - cardHeight - 18, rect.top + rect.height + 18) : Math.max(18, rect.top - cardHeight - 18);
  const left = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, rect.left + rect.width / 2 - cardWidth / 2));
  const isLast = index === STUDENT_TOUR_STOPS.length - 1;

  return <div aria-live="polite" style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: "none" }}>
    <div style={{ position: "fixed", inset: 0, background: "rgba(2, 7, 17, .58)", pointerEvents: "auto" }} />
    <div aria-hidden="true" style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, height: rect.height, borderRadius: rect.radius, border: "2px solid rgba(195,255,232,.9)", boxShadow: "0 0 0 9999px rgba(2,7,17,.58), 0 0 28px rgba(93,202,165,.82), 0 0 72px rgba(175,169,236,.44)", pointerEvents: "none" }} />
    <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", pointerEvents: "auto", borderRadius: 999, padding: "9px 14px", color: "rgba(255,255,255,.86)", background: "rgba(6,16,31,.96)", border: "1px solid rgba(255,255,255,.12)", font: "700 12px var(--font-dm-sans),sans-serif", letterSpacing: ".08em", textTransform: "uppercase" }}>{index + 1} of {STUDENT_TOUR_STOPS.length}</div>
    <section role="dialog" aria-modal="true" aria-label={`Tour step ${index + 1}`} style={{ position: "fixed", left: isPhone ? 16 : left, right: isPhone ? 16 : undefined, top: isPhone ? undefined : top, bottom: isPhone ? 16 : undefined, width: isPhone ? "auto" : cardWidth, pointerEvents: "auto", borderRadius: 24, padding: "22px", color: "#fff", background: "linear-gradient(145deg, rgba(12,31,47,.98), rgba(6,12,27,.99))", border: "1px solid rgba(175,169,236,.32)", boxShadow: "0 22px 70px rgba(0,0,0,.5)", fontFamily: "var(--font-dm-sans),sans-serif" }}>
      <div style={{ color: "#5DCAA5", fontSize: 11, letterSpacing: ".13em", fontWeight: 800, textTransform: "uppercase" }}>✦ Aced tour</div>
      <h2 style={{ margin: "9px 0 8px", fontFamily: "var(--font-playfair),serif", fontSize: 28, lineHeight: 1.05 }}>{stop.title}</h2>
      <p style={{ margin: 0, color: "rgba(255,255,255,.74)", lineHeight: 1.55, fontSize: 15 }}>{stop.body}</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 20 }}>
        <button type="button" onClick={() => void finish()} disabled={saving} style={{ border: 0, background: "transparent", color: "rgba(255,255,255,.56)", cursor: "pointer", fontSize: 13 }}>Skip tour</button>
        <div style={{ display: "flex", gap: 8 }}>
          {index > 0 && <button type="button" onClick={() => moveTo(index - 1)} style={{ borderRadius: 999, border: "1px solid rgba(255,255,255,.16)", color: "#fff", background: "rgba(255,255,255,.06)", padding: "9px 13px", cursor: "pointer" }}>Back</button>}
          <button type="button" disabled={saving} onClick={() => isLast ? void finish() : moveTo(index + 1)} style={{ border: 0, borderRadius: 999, padding: "10px 16px", color: "#061820", fontWeight: 800, background: "linear-gradient(135deg,#5DCAA5,#a5e3d0)", cursor: saving ? "progress" : "pointer" }}>{isLast ? "Finish" : "Next"}</button>
        </div>
      </div>
    </section>
  </div>;
}

export function startStudentTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}
