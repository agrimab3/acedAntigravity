"use client";

import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import DesmosPanel from "@/components/DesmosPanel";
import NightSky from "@/components/NightSky";
import {
  MOCK_SECTIONS,
  NEXT_MOCK,
  getMockTimeZoneDisplay,
  mockSectionAllowsCalculator,
} from "@/lib/mockTests";
import styles from "./run.module.css";
import {
  enqueueOutboxEntry,
  clearAllOutboxes,
  clearSessionCache,
  nextClientSequence,
  outboxCount,
  overlayOutboxAnswers,
  readAllOutboxes,
  readOutbox,
  readSessionCache,
  removeResolvedEntries,
  writeSessionCache,
} from "./outbox";

type AnswerLetter = "A" | "B" | "C" | "D";

type Question = {
  id: string;
  position: number;
  topic: string;
  difficulty: string;
  question_text: string;
  choices: Record<AnswerLetter, string>;
  passage: string | null;
  questionSetId: string | null;
  questionSetTitle: string | null;
  selectedAnswer: AnswerLetter | null;
  flagged: boolean;
};

type SessionPayload =
  | {
      sessionId: string;
      registrationId: string;
      status: "completed";
      currentSectionOrder: number;
      serverNow: string;
    }
  | {
      sessionId: string;
      registrationId: string;
      status: "break";
      currentSectionOrder: number;
      serverNow: string;
      break: {
        afterSectionKey: "english" | "math" | "reading";
        afterSectionTitle: string;
        startedAt: string;
        endsAt: string;
        nextSection: {
          key: "math" | "reading" | "science";
          title: string;
          durationMinutes: number;
          questionCount: number;
          constellation: string;
          color: string;
        };
      };
    }
  | {
      sessionId: string;
      registrationId: string;
      status: "transition";
      currentSectionOrder: number;
      serverNow: string;
      break: {
        afterSectionKey: "english" | "math" | "reading";
        afterSectionTitle: string;
        startedAt: string;
        endsAt: string;
        nextSection: {
          key: "math" | "reading" | "science";
          title: string;
          durationMinutes: number;
          questionCount: number;
          constellation: string;
          color: string;
        };
      };
    }
  | {
      sessionId: string;
      registrationId: string;
      status: "in_progress";
      currentSectionOrder: number;
      serverNow: string;
      section: {
        key: "english" | "math" | "reading" | "science";
        title: string;
        durationMinutes: number;
        questionCount: number;
        sectionRunId: string;
        startedAt: string | null;
        deadlineAt: string | null;
        questions: Question[];
      };
    };

type SaveStatus = "saved" | "saving" | "error";

const SECTION_TINTS = {
  english: "#11202A",
  math: "#191934",
  reading: "#2A1F0F",
  science: "#2A1914",
} as const;

const SECTION_TEXT_DARK = {
  english: "#072019",
  math: "#111026",
  reading: "#241606",
  science: "#24110C",
} as const;

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return String(Math.floor(safe / 60)).padStart(2, "0") + ":" + String(safe % 60).padStart(2, "0");
}

function romanNumeral(value: number) {
  const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
  return numerals[value - 1] ?? String(value);
}

export default function MockTestRunner({
  email,
  timeZone,
  allowDevReset,
}: {
  email: string;
  timeZone: string;
  allowDevReset: boolean;
}) {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [canStart, setCanStart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [breakRemaining, setBreakRemaining] = useState(0);
  const [pauseProgress, setPauseProgress] = useState(0);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [timerHidden, setTimerHidden] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [online, setOnline] = useState(true);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [isActiveTab, setIsActiveTab] = useState(true);
  const [syncingAfterReconnect, setSyncingAfterReconnect] = useState(false);
  const [connectionBanner, setConnectionBanner] = useState<"offline" | "synced" | null>(null);
  const [timedOutOfflineSection, setTimedOutOfflineSection] = useState<string | null>(null);
  const [rejectedNotice, setRejectedNotice] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"passage" | "question">("question");
  const [showCalculator, setShowCalculator] = useState(false);
  const [advancingSection, setAdvancingSection] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const [devPreviewSeconds, setDevPreviewSeconds] = useState<number | null>(null);
  const [devBreakSeconds, setDevBreakSeconds] = useState<number | null>(null);
  const [devTransitionSeconds, setDevTransitionSeconds] = useState<number | null>(null);

  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const keepWorkingRef = useRef<HTMLButtonElement>(null);
  const calculatorButtonRef = useRef<HTMLButtonElement>(null);
  const choiceRefs = useRef<Array<HTMLInputElement | null>>([]);
  const announcedRef = useRef(new Set<string>());
  const previousSessionStatusRef = useRef<SessionPayload["status"] | null>(null);
  const tabIdRef = useRef("");
  const flushInFlightRef = useRef(false);
  const flushDebounceRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryDelayRef = useRef(1000);
  const activeTabRef = useRef(true);
  const wasOfflineRef = useRef(false);
  const syncedBannerTimerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const cachedFirst = readSessionCache<SessionPayload>();
    if (cachedFirst) {
      if (cachedFirst.status === "in_progress") {
        cachedFirst.section.questions = overlayOutboxAnswers(
          cachedFirst.registrationId,
          cachedFirst.section.key,
          cachedFirst.section.questions
        );
      }
      setSession(cachedFirst);
      setPendingOutboxCount(outboxCount(cachedFirst.registrationId));
      setLoading(false);
    } else {
      setLoading(true);
    }

    setError(null);
    try {
      const res = await fetch("/api/mock-test/session", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load mock test.");
      if (data.session) {
        const nextSession = data.session as SessionPayload;
        if (nextSession.status === "in_progress") {
          nextSession.section.questions = overlayOutboxAnswers(
            nextSession.registrationId,
            nextSession.section.key,
            nextSession.section.questions
          );
        }
        setSession(nextSession);
        writeSessionCache(nextSession);
        setPendingOutboxCount(outboxCount(nextSession.registrationId));
        setServerOffsetMs(new Date(nextSession.serverNow).getTime() - Date.now());
        setOnline(true);
      } else {
        setSession(null);
        setCanStart(Boolean(data.startWindow?.allowed));
      }
    } catch (err) {
      const cached = readSessionCache<SessionPayload>();
      if (cached) {
        if (cached.status === "in_progress") {
          cached.section.questions = overlayOutboxAnswers(
            cached.registrationId,
            cached.section.key,
            cached.section.questions
          );
        }
        setSession(cached);
        setPendingOutboxCount(outboxCount(cached.registrationId));
        setOnline(false);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Could not load mock test.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("previewTime");
      const parsed = raw ? Number(raw) : Number.NaN;
      if (Number.isFinite(parsed) && parsed >= 0) {
        setDevPreviewSeconds(Math.floor(parsed));
      }
      const breakRaw = params.get("devBreakSeconds");
      const breakParsed = breakRaw ? Number(breakRaw) : Number.NaN;
      if (Number.isFinite(breakParsed) && breakParsed >= 1) {
        setDevBreakSeconds(Math.floor(breakParsed));
      }
      const transitionRaw = params.get("devTransitionSeconds");
      const transitionParsed = transitionRaw ? Number(transitionRaw) : Number.NaN;
      if (Number.isFinite(transitionParsed) && transitionParsed >= 1) {
        setDevTransitionSeconds(Math.floor(transitionParsed));
      }
    }
  }, []);

  useEffect(() => {
    const initialOnline = navigator.onLine;
    setOnline(initialOnline);
    if (!initialOnline) {
      wasOfflineRef.current = true;
      setConnectionBanner("offline");
    }

    const goOnline = () => {
      setOnline(true);
      if (wasOfflineRef.current) {
        setSyncingAfterReconnect(true);
        setLiveMessage("Back online. Syncing your saved answers.");
      }
    };
    const goOffline = () => {
      wasOfflineRef.current = true;
      setOnline(false);
      setConnectionBanner("offline");
      setSyncingAfterReconnect(false);
      setLiveMessage(
        "You're offline. Keep answering. Your answers are saved on this device."
      );
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    const registrationId = session?.registrationId;
    if (!registrationId) return;

    if (!tabIdRef.current) {
      tabIdRef.current = crypto.randomUUID();
    }
    const ownerKey = "aced-mock-tab-owner:" + registrationId;
    const claim = () => {
      try {
        window.localStorage.setItem(
          ownerKey,
          JSON.stringify({ tabId: tabIdRef.current, heartbeatAt: Date.now() })
        );
        activeTabRef.current = true;
        setIsActiveTab(true);
      } catch {
        activeTabRef.current = true;
        setIsActiveTab(true);
      }
    };

    claim();

    const heartbeat = window.setInterval(() => {
      try {
        const raw = window.localStorage.getItem(ownerKey);
        const owner = raw ? (JSON.parse(raw) as { tabId?: string }) : null;
        if (owner?.tabId === tabIdRef.current) {
          window.localStorage.setItem(
            ownerKey,
            JSON.stringify({ tabId: tabIdRef.current, heartbeatAt: Date.now() })
          );
        } else {
          activeTabRef.current = false;
          setIsActiveTab(false);
          setError("This test is open somewhere else. Use the newest tab to keep answering.");
        }
      } catch {
        activeTabRef.current = true;
        setIsActiveTab(true);
      }
    }, 2000);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== ownerKey) return;
      if (!event.newValue) {
        claim();
        return;
      }
      try {
        const owner = JSON.parse(event.newValue) as { tabId?: string };
        const active = owner.tabId === tabIdRef.current;
        activeTabRef.current = active;
        setIsActiveTab(active);
        if (!active) {
          setError("This test is open somewhere else. Use the newest tab to keep answering.");
        }
      } catch {
        // Ignore malformed ownership records.
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("storage", onStorage);
      try {
        const raw = window.localStorage.getItem(ownerKey);
        const owner = raw ? (JSON.parse(raw) as { tabId?: string }) : null;
        if (owner?.tabId === tabIdRef.current) {
          window.localStorage.removeItem(ownerKey);
        }
      } catch {
        // Ignore cleanup storage failures.
      }
    };
  }, [session?.registrationId]);

  useEffect(() => {
    if (!session?.sessionId || !session.registrationId) return;
    if (!tabIdRef.current) tabIdRef.current = crypto.randomUUID();

    const sendPresence = async () => {
      if (!navigator.onLine) return;
      try {
        await fetch("/api/mock-test/session/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            clientId: tabIdRef.current,
          }),
          keepalive: true,
        });
      } catch {
        // Presence is best-effort monitoring and must never affect the test.
      }
    };

    void sendPresence();
    const id = window.setInterval(() => {
      void sendPresence();
    }, 30000);
    const onOnline = () => void sendPresence();
    const onVisible = () => {
      if (document.visibilityState === "visible") void sendPresence();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session?.registrationId, session?.sessionId]);

  const flushOutbox = useCallback(async () => {
    const registrationId = session?.registrationId;
    const sessionId = session?.sessionId;
    if (!registrationId || !sessionId || !activeTabRef.current || flushInFlightRef.current) {
      return;
    }

    if (!navigator.onLine) {
      setOnline(false);
      setSaveStatus("error");
      return;
    }

    const pending = readAllOutboxes(registrationId)
      .flatMap((outbox) => outbox.entries)
      .sort((a, b) => a.clientSequence - b.clientSequence);

    if (pending.length === 0) {
      setPendingOutboxCount(0);
      setSaveStatus("saved");
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setSyncingAfterReconnect(false);
        setConnectionBanner("synced");
        setLiveMessage("All answers synced.");
        if (syncedBannerTimerRef.current !== null) {
          window.clearTimeout(syncedBannerTimerRef.current);
        }
        syncedBannerTimerRef.current = window.setTimeout(() => {
          setConnectionBanner(null);
        }, 3000);
      }
      return;
    }

    flushInFlightRef.current = true;
    setSaveStatus("saving");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    try {
      const batch = pending.slice(0, 50);
      const response = await fetch("/api/mock-test/session/answer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ sessionId, answers: batch }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Answers could not be synced.");
      }

      const resolved = new Set<number>();
      for (const item of [...(body.accepted ?? []), ...(body.rejected ?? [])]) {
        resolved.add(Number(item.clientSequence));
      }
      removeResolvedEntries(registrationId, resolved);

      const rejected = Array.isArray(body.rejected) ? body.rejected : [];
      if (rejected.length > 0) {
        const rejectedSectionKey = rejected[0]?.sectionKey as
          | "english"
          | "math"
          | "reading"
          | "science"
          | undefined;
        const rejectedSection =
          MOCK_SECTIONS.find((item) => item.key === rejectedSectionKey)?.title ??
          "this section";
        const rejectedMessage =
          rejected.length +
          " answer" +
          (rejected.length === 1 ? " was" : "s were") +
          " picked after " +
          rejectedSection +
          " ended or couldn't be sent in time, so " +
          (rejected.length === 1 ? "it wasn't" : "they weren't") +
          " counted.";
        setRejectedNotice(rejectedMessage);
        setLiveMessage(rejectedMessage);
      }

      if (body.serverNow) {
        setServerOffsetMs(new Date(body.serverNow).getTime() - Date.now());
      }

      const remainingCount = outboxCount(registrationId);
      setPendingOutboxCount(remainingCount);
      setOnline(true);
      retryDelayRef.current = 1000;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setSaveStatus(remainingCount === 0 ? "saved" : "saving");

      if (remainingCount === 0 && wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setSyncingAfterReconnect(false);
        setConnectionBanner("synced");
        setLiveMessage("All answers synced.");
        if (syncedBannerTimerRef.current !== null) {
          window.clearTimeout(syncedBannerTimerRef.current);
        }
        syncedBannerTimerRef.current = window.setTimeout(() => {
          setConnectionBanner(null);
        }, 3000);
      } else if (remainingCount > 0 && wasOfflineRef.current) {
        setSyncingAfterReconnect(true);
      }

      if (remainingCount > 0) {
        if (flushDebounceRef.current !== null) {
          window.clearTimeout(flushDebounceRef.current);
        }
        flushDebounceRef.current = window.setTimeout(() => {
          void flushOutbox();
        }, 300);
      }
    } catch {
      wasOfflineRef.current = true;
      setOnline(false);
      setConnectionBanner("offline");
      setSyncingAfterReconnect(false);
      setSaveStatus("error");
      setLiveMessage(
        "You're offline. Keep answering. Your answers are saved on this device."
      );
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(15000, retryDelayRef.current * 2);
      retryTimerRef.current = window.setTimeout(() => {
        void flushOutbox();
      }, delay);
    } finally {
      window.clearTimeout(timeout);
      flushInFlightRef.current = false;
    }
  }, [session?.registrationId, session?.sessionId]);

  useEffect(() => {
    if (online && isActiveTab) {
      void flushOutbox();
    }
  }, [online, isActiveTab, flushOutbox]);

  useEffect(() => {
    const registrationId = session?.registrationId;
    if (!registrationId) return;

    const onStorage = (event: StorageEvent) => {
      if (
        !event.key?.startsWith(
          "aced-mock-answer-outbox:" + registrationId + ":"
        )
      ) {
        return;
      }
      setPendingOutboxCount(outboxCount(registrationId));
      if (activeTabRef.current && navigator.onLine) {
        void flushOutbox();
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [session?.registrationId, flushOutbox]);

  useEffect(() => {
    return () => {
      if (flushDebounceRef.current !== null) {
        window.clearTimeout(flushDebounceRef.current);
      }
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
      if (syncedBannerTimerRef.current !== null) {
        window.clearTimeout(syncedBannerTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!online || !isActiveTab || !session?.registrationId) return;

    const syncClock = async () => {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 5000);
        const response = await fetch("/api/mock-test/session/time", {
          cache: "no-store",
          signal: controller.signal,
        });
        window.clearTimeout(timeout);
        if (!response.ok) return;
        const body = await response.json();
        if (body.serverNow) {
          setServerOffsetMs(new Date(body.serverNow).getTime() - Date.now());
        }
      } catch {
        // Answer sync owns connectivity/retry state.
      }
    };

    void syncClock();
    const id = window.setInterval(() => {
      void syncClock();
    }, 60000);
    return () => window.clearInterval(id);
  }, [online, isActiveTab, session?.registrationId]);

  useEffect(() => {
    if (pendingOutboxCount <= 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingOutboxCount]);

  const completeSection = useCallback(async () => {
    if (!session || session.status !== "in_progress" || busy) return;
    setBusy(true);
    setAdvancingSection(true);
    setEndConfirmOpen(false);
    setLiveMessage("Submitting " + session.section.title + " and moving to the next screen.");
    setError(null);
    try {
      await flushOutbox();
      const pendingForSection =
        readOutbox(session.registrationId, session.section.key)?.entries.length ?? 0;
      if (pendingForSection > 0) {
        setOnline(navigator.onLine);
        setError("Your answers are still waiting to sync. Reconnect to continue.");
        return;
      }

      const completeParams = new URLSearchParams();
      if (devBreakSeconds !== null) {
        completeParams.set("devBreakSeconds", String(devBreakSeconds));
      }
      if (devTransitionSeconds !== null) {
        completeParams.set("devTransitionSeconds", String(devTransitionSeconds));
      }
      const completeQuery = completeParams.toString();
      const completeUrl =
        "/api/mock-test/session/complete-section" +
        (completeQuery ? "?" + completeQuery : "");
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 12000);
      let res: Response;
      try {
        res = await fetch(completeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            outboxEmpty: true,
          }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit section.");
      if (data.session?.status === "completed") {
        window.location.assign("/mock-test/run/finished");
        return;
      }
      setSession(data.session);
      writeSessionCache(data.session);
      if (data.session?.serverNow) {
        setServerOffsetMs(new Date(data.session.serverNow).getTime() - Date.now());
      }
      setActiveIndex(0);
      setReviewOpen(false);
      setEndConfirmOpen(false);
      setTimerHidden(false);
      setMobilePane("question");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        await load();
        setError(
          "The section request was slow, so Aced checked the server again. Your submitted section will not be submitted twice."
        );
      } else {
        setError(err instanceof Error ? err.message : "Could not submit section.");
      }
    } finally {
      setBusy(false);
      setAdvancingSection(false);
    }
  }, [
    session,
    busy,
    devBreakSeconds,
    devTransitionSeconds,
    flushOutbox,
    load,
  ]);


  useEffect(() => {
    if (!session || (session.status !== "break" && session.status !== "transition")) return;
    let requestedAdvance = false;
    let lastAdvanceAttemptAt = 0;
    const startedAtMs = new Date(session.break.startedAt).getTime();
    const endsAtMs = new Date(session.break.endsAt).getTime();
    const totalMs = Math.max(1, endsAtMs - startedAtMs);

    const tick = () => {
      const now = Date.now() + serverOffsetMs;
      const seconds = Math.max(0, Math.ceil((endsAtMs - now) / 1000));
      const progress = Math.min(1, Math.max(0, (now - startedAtMs) / totalMs));
      setBreakRemaining(seconds);
      setPauseProgress(progress);
      if (
        seconds <= 0 &&
        !requestedAdvance &&
        Date.now() - lastAdvanceAttemptAt >= 1000
      ) {
        requestedAdvance = true;
        lastAdvanceAttemptAt = Date.now();
        void load().finally(() => {
          requestedAdvance = false;
        });
      }
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [session, serverOffsetMs, load]);

  useEffect(() => {
    if (
      !session ||
      session.status !== "in_progress" ||
      !mockSectionAllowsCalculator(session.section.key)
    ) {
      setShowCalculator(false);
    }
  }, [session]);

  useEffect(() => {
    const previous = previousSessionStatusRef.current;
    const current = session?.status ?? null;

    if (
      (previous === "break" || previous === "transition") &&
      current === "in_progress"
    ) {
      setActiveIndex(0);
      window.requestAnimationFrame(() => choiceRefs.current[0]?.focus());
    }

    previousSessionStatusRef.current = current;
  }, [session?.status]);

  useEffect(() => {
    if (!session || (session.status !== "break" && session.status !== "transition")) {
      return;
    }

    if (session.status === "transition") {
      const key = "transition:" + session.break.afterSectionKey;
      if (!announcedRef.current.has(key)) {
        announcedRef.current.add(key);
        setLiveMessage(
          session.break.afterSectionTitle +
            " done. " +
            session.break.nextSection.title +
            " starting."
        );
      }
      return;
    }

    const oneMinuteKey = "break:" + session.break.afterSectionKey + ":60";
    if (breakRemaining === 60 && !announcedRef.current.has(oneMinuteKey)) {
      announcedRef.current.add(oneMinuteKey);
      setLiveMessage("1 minute left in the break.");
    }

    const tenSecondKey = "break:" + session.break.afterSectionKey + ":10";
    if (breakRemaining === 10 && !announcedRef.current.has(tenSecondKey)) {
      announcedRef.current.add(tenSecondKey);
      setLiveMessage("10 seconds left in the break.");
    }
  }, [session, breakRemaining]);

  useEffect(() => {
    if (!session || session.status !== "in_progress" || !session.section.deadlineAt) return;
    const tick = () => {
      const now = Date.now() + serverOffsetMs;
      const seconds = Math.max(
        0,
        Math.ceil((new Date(session.section.deadlineAt!).getTime() - now) / 1000)
      );
      setRemaining(seconds);
      if (seconds <= 0 && !busy) {
        if (!online || pendingOutboxCount > 0) {
          setTimedOutOfflineSection(session.section.title);
          if (!online) {
            setLiveMessage(
              "Time's up for " +
                session.section.title +
                ". Reconnect to send your answers."
            );
          }
          return;
        }
        void completeSection();
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [
    session,
    serverOffsetMs,
    busy,
    completeSection,
    online,
    pendingOutboxCount,
  ]);

  useEffect(() => {
    if (
      !timedOutOfflineSection ||
      !online ||
      pendingOutboxCount > 0 ||
      !session ||
      session.status !== "in_progress" ||
      busy
    ) {
      return;
    }

    setTimedOutOfflineSection(null);
    void completeSection();
  }, [
    timedOutOfflineSection,
    online,
    pendingOutboxCount,
    session,
    busy,
    completeSection,
  ]);

  useEffect(() => {
    if (!session || session.status !== "in_progress") return;
    const sectionKey = session.section.key;
    const totalSeconds =
      session.section.startedAt && session.section.deadlineAt
        ? Math.max(
            0,
            Math.round(
              (new Date(session.section.deadlineAt).getTime() -
                new Date(session.section.startedAt).getTime()) /
                1000
            )
          )
        : session.section.durationMinutes * 60;
    const effectiveRemaining = devPreviewSeconds ?? remaining;

    if (
      (totalSeconds >= 300 || devPreviewSeconds !== null) &&
      effectiveRemaining <= 300 &&
      effectiveRemaining > 60
    ) {
      setTimerHidden(false);
      const key = sectionKey + ":5";
      if (!announcedRef.current.has(key)) {
        announcedRef.current.add(key);
        setLiveMessage("5 minutes left in " + session.section.title + ".");
      }
    }
    if (effectiveRemaining <= 60 && effectiveRemaining > 0) {
      setTimerHidden(false);
      const key = sectionKey + ":1";
      if (!announcedRef.current.has(key)) {
        announcedRef.current.add(key);
        setLiveMessage("1 minute left in " + session.section.title + ".");
      }
    }
  }, [remaining, session, devPreviewSeconds]);

  const currentQuestion =
    session?.status === "in_progress"
      ? session.section.questions[activeIndex] ?? null
      : null;

  const answeredCount = useMemo(() => {
    if (!session || session.status !== "in_progress") return 0;
    return session.section.questions.filter((q) => q.selectedAnswer).length;
  }, [session]);

  const flaggedCount = useMemo(() => {
    if (!session || session.status !== "in_progress") return 0;
    return session.section.questions.filter((q) => q.flagged).length;
  }, [session]);

  const unansweredCount =
    session?.status === "in_progress"
      ? session.section.questionCount - answeredCount
      : 0;

  const sectionConfig =
    session?.status === "in_progress"
      ? MOCK_SECTIONS.find((item) => item.key === session.section.key) ?? MOCK_SECTIONS[0]
      : MOCK_SECTIONS[0];

  const sectionTint =
    session?.status === "in_progress"
      ? SECTION_TINTS[session.section.key]
      : SECTION_TINTS.english;

  const sectionTextDark =
    session?.status === "in_progress"
      ? SECTION_TEXT_DARK[session.section.key]
      : SECTION_TEXT_DARK.english;

  const themeStyle = {
    "--section-color": sectionConfig.color,
    "--section-tint": sectionTint,
    "--section-text-dark": sectionTextDark,
  } as CSSProperties;

  const passageOrdinal = useMemo(() => {
    if (!session || session.status !== "in_progress" || !currentQuestion?.passage) return 1;
    const identifiers: string[] = [];
    for (const question of session.section.questions) {
      if (!question.passage) continue;
      const id = question.questionSetId ?? question.passage;
      if (!identifiers.includes(id)) identifiers.push(id);
    }
    const currentId = currentQuestion.questionSetId ?? currentQuestion.passage;
    const index = identifiers.indexOf(currentId);
    return index >= 0 ? index + 1 : 1;
  }, [session, currentQuestion]);

  async function resetDevTest() {
    if (!allowDevReset || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/mock-test/dev/reset-session", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not reset the DEV mock test.");
      if (session?.registrationId) clearAllOutboxes(session.registrationId);
      clearSessionCache();
      setPendingOutboxCount(0);
      setSyncingAfterReconnect(false);
      setConnectionBanner(null);
      setTimedOutOfflineSection(null);
      setRejectedNotice(null);
      wasOfflineRef.current = false;
      setSession(null);
      setActiveIndex(0);
      setRemaining(0);
      setTimerHidden(false);
      setSaveStatus("saved");
      setReviewOpen(false);
      setEndConfirmOpen(false);
      setMobilePane("question");
      setLiveMessage("");
      announcedRef.current.clear();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the DEV mock test.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mock-test/session", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start mock test.");
      setSession(data.session);
      writeSessionCache(data.session);
      setPendingOutboxCount(outboxCount(data.session.registrationId));
      setServerOffsetMs(new Date(data.session.serverNow).getTime() - Date.now());
      setActiveIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start mock test.");
    } finally {
      setBusy(false);
    }
  }

  const saveQuestion = useCallback((
    questionId: string,
    patch: { selectedAnswer?: AnswerLetter | null; flagged?: boolean }
  ) => {
    if (!session || session.status !== "in_progress") return;
    if (!activeTabRef.current) {
      setError("This test is open somewhere else. Use the newest tab to keep answering.");
      return;
    }

    const current = session.section.questions.find(
      (question) => question.id === questionId
    );
    if (!current) return;

    const nextQuestion = { ...current, ...patch };
    const clientSequence = nextClientSequence(session.registrationId);
    const pickedAtServer = new Date(Date.now() + serverOffsetMs).toISOString();

    const stored = enqueueOutboxEntry(
      session.registrationId,
      session.sessionId,
      session.section.sectionRunId,
      session.section.key,
      {
        questionId,
        selectedAnswer: nextQuestion.selectedAnswer,
        flagged: nextQuestion.flagged,
        clientSequence,
        pickedAtServer,
      }
    );

    if (!stored) {
      setError(
        "This browser could not save the answer on this device. Keep this tab open and reconnect."
      );
    }

    const nextSession: SessionPayload = {
      ...session,
      section: {
        ...session.section,
        questions: session.section.questions.map((question) =>
          question.id === questionId ? nextQuestion : question
        ),
      },
    };

    setSession(nextSession);
    writeSessionCache(nextSession);
    setPendingOutboxCount(outboxCount(session.registrationId));

    if (!navigator.onLine) {
      setOnline(false);
      setSaveStatus("error");
      return;
    }

    setSaveStatus("saving");
    if (flushDebounceRef.current !== null) {
      window.clearTimeout(flushDebounceRef.current);
    }
    flushDebounceRef.current = window.setTimeout(() => {
      void flushOutbox();
    }, 300);
  }, [session, serverOffsetMs, flushOutbox]);

  const closeReview = useCallback(() => {
    setReviewOpen(false);
    window.requestAnimationFrame(() => reviewButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (endConfirmOpen) {
      window.requestAnimationFrame(() => keepWorkingRef.current?.focus());
    }
  }, [endConfirmOpen]);

  useEffect(() => {
    if (!session || session.status !== "in_progress" || !currentQuestion) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const insideCalculator = Boolean(
        target?.closest("[data-desmos-calculator], [data-desmos-panel]")
      );
      const typingTarget =
        target?.isContentEditable ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        (target?.tagName === "INPUT" &&
          (target as HTMLInputElement).type !== "radio" &&
          (target as HTMLInputElement).type !== "button");

      if (event.key === "Escape") {
        if (reviewOpen) {
          event.preventDefault();
          closeReview();
          return;
        }
        if (endConfirmOpen) {
          event.preventDefault();
          setEndConfirmOpen(false);
          return;
        }
      }

      if (typingTarget || insideCalculator || reviewOpen || endConfirmOpen) return;

      const upper = event.key.toUpperCase();
      if (
        upper === "C" &&
        mockSectionAllowsCalculator(session.section.key)
      ) {
        event.preventDefault();
        setShowCalculator((current) => !current);
        return;
      }

      if (["A", "B", "C", "D"].includes(upper)) {
        event.preventDefault();
        void saveQuestion(currentQuestion.id, { selectedAnswer: upper as AnswerLetter });
        return;
      }

      if (upper === "F") {
        event.preventDefault();
        void saveQuestion(currentQuestion.id, { flagged: !currentQuestion.flagged });
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (activeIndex < session.section.questions.length - 1) {
          setActiveIndex((index) => index + 1);
        } else {
          setReviewOpen(true);
        }
        return;
      }

      if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) {
        event.preventDefault();
        const currentFocused = choiceRefs.current.findIndex(
          (element) => element === document.activeElement
        );
        const selectedIndex = ["A", "B", "C", "D"].indexOf(
          currentQuestion.selectedAnswer ?? "A"
        );
        const base = currentFocused >= 0 ? currentFocused : Math.max(0, selectedIndex);
        const direction =
          event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
        const next = (base + direction + 4) % 4;
        choiceRefs.current[next]?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    session,
    currentQuestion,
    activeIndex,
    reviewOpen,
    endConfirmOpen,
    closeReview,
    saveQuestion,
  ]);

  if (loading) {
    return (
      <main className={styles.page}>
        <NightSky calm showNebulae={false} />
        <div className={styles.centerState}>Loading your mock test…</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className={styles.page}>
        <NightSky calm showNebulae={false} />
        <div className={styles.lobbyShell}>
          <div className={styles.lobbyBrand}>
            Aced<span>.</span>
          </div>
          <section className={styles.lobbyCard}>
            <div className={styles.eyebrow}>ACED MOCK TEST · {NEXT_MOCK.testDateShort}</div>
            <h1>ready when you are.</h1>
            <p>
              Your section timer is controlled by the server and keeps running through
              refreshes or Wi-Fi drops. Submitted sections are locked.
            </p>
            <p className={styles.lobbyRule}>
              Math has a built-in Desmos calculator. You can also use your own ACT-approved calculator.
            </p>
            <button
              className={styles.primaryAction}
              disabled={!canStart || busy}
              onClick={() => void start()}
            >
              {busy ? "starting…" : canStart ? "start English →" : "test not open yet"}
            </button>
            <div className={styles.accountLine}>{email}</div>
            {error ? <div className={styles.error}>{error}</div> : null}
          </section>
        </div>
      </main>
    );
  }

  if (session.status === "completed") {
    return (
      <main className={styles.page}>
        <NightSky calm showNebulae={false} />
        <div className={styles.finishCard}>
          <div className={styles.finishStar}>✦</div>
          <h1>mock test <em>complete.</em></h1>
          <p>Your answers are locked in and saved.</p>
          <p className={styles.releaseText}>
            Results release {NEXT_MOCK.resultsLongLabel}.
          </p>
          <div className={styles.finishActions}>
            <a href="/mock-test/results" className={styles.primaryAction}>
              view results status →
            </a>
            {allowDevReset ? (
              <>
                <button
                  type="button"
                  className={styles.devResetButton}
                  disabled={busy}
                  onClick={() => void resetDevTest()}
                >
                  {busy ? "resetting…" : "reset DEV test"}
                </button>
                <a
                  href="/admin/mock-test?slug=DEV-ADMIN-BUSY"
                  className={styles.devResetButton}
                >
                  preview admin dashboard
                </a>
              </>
            ) : null}
          </div>
          {error ? <div className={styles.error}>{error}</div> : null}
        </div>
      </main>
    );
  }

  if (session.status === "break" || session.status === "transition") {
    const isBreak = session.status === "break";
    const finishedIndex = session.currentSectionOrder;
    const nextIndex = finishedIndex + 1;
    const finishedConfig = MOCK_SECTIONS[finishedIndex];
    const nextConfig = MOCK_SECTIONS[nextIndex];
    const releaseDisplay = getMockTimeZoneDisplay(timeZone);

    if (!isBreak) {
      return (
        <main className={styles.pausePage}>
          <NightSky calm showNebulae={false} />
          <div className={styles.screenReaderLive} aria-live="polite">
            {liveMessage}
          </div>
          <section
            className={styles.transitionScene}
            style={
              {
                "--finished-color": finishedConfig.color,
                "--next-color": nextConfig.color,
              } as CSSProperties
            }
            aria-label={
              session.break.afterSectionTitle +
              " done. " +
              session.break.nextSection.title +
              " starting."
            }
          >
            <div
              className={styles.transitionStar}
              aria-hidden="true"
            >
              ✦
            </div>
            <h1 className={styles.transitionTitle}>
              <span style={{ color: finishedConfig.color }}>
                {session.break.afterSectionTitle.toLowerCase()}
              </span>{" "}
              done <em>✦</em>
            </h1>
            <p className={styles.transitionNext}>
              {session.break.nextSection.title.toLowerCase()} starting
            </p>
            <div
              className={styles.transitionTrack}
              aria-hidden="true"
            >
              <span style={{ transform: "scaleX(" + pauseProgress + ")" }} />
            </div>
            {error ? <div className={styles.error}>{error}</div> : null}
          </section>
        </main>
      );
    }

    return (
      <main className={styles.pausePage}>
        <NightSky calm showNebulae={false} />
        <div className={styles.screenReaderLive} aria-live="polite">
          {liveMessage}
        </div>

        <section className={styles.breakScene}>
          <div
            className={styles.breakProgress}
            role="img"
            aria-label={"section progress: " + (finishedIndex + 1) + " of 4 sections done"}
          >
            {MOCK_SECTIONS.map((section, index) => {
              const finished = index <= finishedIndex;
              const isJustFinished = index === finishedIndex;
              const isNext = index === nextIndex;
              return (
                <div className={styles.breakProgressStep} key={section.key}>
                  <div className={styles.breakProgressStarRow}>
                    <span
                      className={[
                        styles.breakProgressStar,
                        finished ? styles.breakProgressStarFinished : "",
                        isJustFinished ? styles.breakProgressStarPop : "",
                        isNext ? styles.breakProgressStarNext : "",
                      ].join(" ")}
                      style={
                        {
                          "--step-color": section.color,
                        } as CSSProperties
                      }
                      aria-hidden="true"
                    >
                      ✦
                    </span>
                    {index < MOCK_SECTIONS.length - 1 ? (
                      <span
                        className={
                          index === finishedIndex
                            ? styles.breakProgressLineActive
                            : styles.breakProgressLine
                        }
                        style={
                          index === finishedIndex
                            ? ({
                                "--line-from": section.color,
                                "--line-to": MOCK_SECTIONS[index + 1].color,
                              } as CSSProperties)
                            : undefined
                        }
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                  <span
                    className={styles.breakProgressLabel}
                    style={finished || isNext ? { color: section.color } : undefined}
                  >
                    {section.title.toLowerCase()}
                    {isNext ? " · next" : ""}
                  </span>
                </div>
              );
            })}
          </div>

          <div className={styles.breakHero}>
            <h1>
              math <em>done.</em>
            </h1>
            <p>Your answers are locked in. Stretch, grab water, take a breath.</p>
          </div>

          <div className={styles.breakCard}>
            <div className={styles.breakCardTop}>
              <div className={styles.breakLabel}>BREAK ENDS IN</div>
              <div
                className={[
                  styles.breakCountdown,
                  breakRemaining <= 10 ? styles.breakCountdownUrgent : "",
                ].join(" ")}
                role="timer"
                aria-label={"Break ends in " + formatTime(breakRemaining)}
              >
                {formatTime(breakRemaining)}
              </div>
              <p>reading starts on its own when the break ends</p>
            </div>

            <div
              className={styles.breakNextCard}
              style={
                {
                  "--next-color": nextConfig.color,
                } as CSSProperties
              }
            >
              <div>
                <div className={styles.breakConstellation}>
                  {session.break.nextSection.constellation}
                </div>
                <h2>{session.break.nextSection.title.toLowerCase()}</h2>
                <p>
                  {session.break.nextSection.questionCount} questions ·{" "}
                  {session.break.nextSection.durationMinutes} min
                </p>
              </div>
              <span className={styles.breakRequiredNote}>
                full 10-minute break required
              </span>
            </div>
          </div>

          <p className={styles.breakReleaseNote}>
            Scores come out for everyone on Sunday at {releaseDisplay.localReleaseTime}.
          </p>

          {error ? <div className={styles.error}>{error}</div> : null}
        </section>
      </main>
    );
  }

  const questionCount = session.section.questionCount;
  const percent = Math.round((answeredCount / questionCount) * 100);
  const effectiveRemaining = devPreviewSeconds ?? remaining;
  const sectionTotalSeconds =
    session.section.startedAt && session.section.deadlineAt
      ? Math.max(
          0,
          Math.round(
            (new Date(session.section.deadlineAt).getTime() -
              new Date(session.section.startedAt).getTime()) /
              1000
          )
        )
      : session.section.durationMinutes * 60;
  const fiveMinuteWarning =
    (sectionTotalSeconds >= 300 || devPreviewSeconds !== null) &&
    effectiveRemaining <= 300 &&
    effectiveRemaining > 60;
  const oneMinuteWarning = effectiveRemaining <= 60 && effectiveRemaining > 0;
  const warningActive = fiveMinuteWarning || oneMinuteWarning;
  const hasPassage = Boolean(currentQuestion?.passage);
  const releaseDisplay = getMockTimeZoneDisplay(timeZone);

  const saveCopy = !online
    ? "offline · " +
      pendingOutboxCount +
      " answer" +
      (pendingOutboxCount === 1 ? "" : "s") +
      " saved on this device"
    : syncingAfterReconnect
      ? "back online · syncing…"
      : saveStatus === "saving"
        ? "saving…"
        : "saved ✓";

  return (
    <main
      className={styles.page + (showCalculator ? " " + styles.pageCalculatorOpen : "")}
      style={themeStyle}
    >
      <NightSky calm showNebulae={false} />
      <div className={styles.screenReaderLive} aria-live="polite">
        {liveMessage}
      </div>

      <header className={styles.topBar}>
        <div className={styles.topInner}>
          <div className={styles.identityRow}>
            <div className={styles.brand}>
              Aced<span>.</span>
            </div>
            <div className={styles.divider} aria-hidden="true" />
            <div className={styles.sectionIdentity}>
              <span className={styles.sectionDot} aria-hidden="true" />
              <span className={styles.sectionName}>{session.section.key}</span>
              <em>{sectionConfig.constellation}</em>
            </div>
            <div className={styles.sectionCount}>
              section {session.currentSectionOrder + 1} of 4
            </div>
          </div>

          <div className={styles.statusRow}>
            <span
              className={
                styles.saveStatus +
                " " +
                (!online
                  ? styles.saveStatusWarning
                  : syncingAfterReconnect
                    ? styles.saveStatusSyncing
                    : saveStatus === "saved"
                      ? styles.saveStatusSaved
                      : "")
              }
              title={
                !online
                  ? "Keep going. Your answers will send when you're back online."
                  : undefined
              }
              aria-label={
                !online
                  ? saveCopy +
                    ". Keep going. Your answers will send when you're back online."
                  : saveCopy
              }
            >
              {!online ? (
                <span className={styles.cloudOffIcon} aria-hidden="true">
                  ☁
                </span>
              ) : null}
              {saveCopy}
            </span>
            <div className={styles.timerPill + (warningActive ? " " + styles.timerWarning : "")}>
              <span aria-hidden="true">◷</span>
              <span>{timerHidden && !warningActive ? "—:—" : formatTime(effectiveRemaining)}</span>
            </div>
            {!warningActive ? (
              <button
                type="button"
                className={styles.timerToggle}
                onClick={() => setTimerHidden((hidden) => !hidden)}
              >
                {timerHidden ? "show timer" : "hide timer"}
              </button>
            ) : null}
          </div>
        </div>

        {connectionBanner === "offline" && !online ? (
          <div className={styles.connectionBanner}>
            <strong>You&apos;re offline.</strong> Keep answering. Your answers are saved on this
            device and will send when you reconnect. Stay on this device until they sync.{" "}
            <span>(The real ACT won&apos;t be this forgiving.)</span>
          </div>
        ) : null}

        {connectionBanner === "synced" ? (
          <div className={styles.syncedBanner}>all answers synced ✓</div>
        ) : null}

        {timedOutOfflineSection ? (
          <div className={styles.timeUpOfflineBanner}>
            <strong>time&apos;s up for {timedOutOfflineSection}.</strong>{" "}
            {online
              ? "Sending your saved answers now…"
              : "Reconnect to send your answers."}
          </div>
        ) : null}

        {rejectedNotice ? (
          <div className={styles.rejectedSyncBanner}>{rejectedNotice}</div>
        ) : null}

        {fiveMinuteWarning ? (
          <div className={styles.timeBanner}>
            <strong>5 minutes left in {session.section.title}.</strong>{" "}
            Answer what you can; unanswered questions count as wrong, so a guess is better
            than a blank.
          </div>
        ) : null}

        <div className={styles.topProgress} aria-hidden="true">
          <span style={{ width: percent + "%" }} />
        </div>
      </header>

      <div className={styles.contentFrame}>
        {hasPassage ? (
          <div className={styles.mobileTabs} role="tablist" aria-label="Question view">
            <button
              role="tab"
              aria-selected={mobilePane === "passage"}
              className={mobilePane === "passage" ? styles.mobileTabActive : ""}
              onClick={() => setMobilePane("passage")}
            >
              passage
            </button>
            <button
              role="tab"
              aria-selected={mobilePane === "question"}
              className={mobilePane === "question" ? styles.mobileTabActive : ""}
              onClick={() => setMobilePane("question")}
            >
              question
            </button>
          </div>
        ) : null}

        <div
          className={
            styles.mainArea +
            " " +
            (!hasPassage ? styles.singleColumn : "") +
            " " +
            (hasPassage && mobilePane === "passage" ? styles.mobileShowPassage : "") +
            " " +
            (hasPassage && mobilePane === "question" ? styles.mobileShowQuestion : "")
          }
        >
          {hasPassage && currentQuestion ? (
            <article className={styles.passageCard}>
              <div className={styles.passageLabel}>
                PASSAGE {romanNumeral(passageOrdinal)}
              </div>
              {currentQuestion.questionSetTitle ? (
                <h2>{currentQuestion.questionSetTitle}</h2>
              ) : null}
              <div className={styles.passageText}>{currentQuestion.passage}</div>
            </article>
          ) : null}

          <section className={styles.questionColumn}>
            {currentQuestion ? (
              <>
                <div className={styles.questionHeader}>
                  <h1>
                    question <span>{currentQuestion.position}</span>{" "}
                    <small>of {questionCount}</small>
                  </h1>
                  <div className={styles.questionHeaderActions}>
                    {mockSectionAllowsCalculator(session.section.key) ? (
                      <button
                        ref={calculatorButtonRef}
                        type="button"
                        className={styles.calculatorButton}
                        onClick={() => setShowCalculator((current) => !current)}
                        aria-expanded={showCalculator}
                        aria-controls="mock-desmos-panel"
                      >
                        <span className={styles.calculatorIcon} aria-hidden="true">▦</span>
                        {showCalculator ? "hide calculator" : "calculator"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={
                        styles.flagButton +
                        (currentQuestion.flagged ? " " + styles.flagButtonActive : "")
                      }
                      aria-pressed={currentQuestion.flagged}
                      onClick={() =>
                        void saveQuestion(currentQuestion.id, {
                          flagged: !currentQuestion.flagged,
                        })
                      }
                    >
                      <span aria-hidden="true">⚑</span>{" "}
                      {currentQuestion.flagged ? "flagged" : "flag"}
                    </button>
                  </div>
                </div>

                <div className={styles.questionMeta}>
                  {currentQuestion.topic} · {currentQuestion.difficulty}
                </div>

                {currentQuestion.question_text ? (
                  <div className={styles.questionText}>{currentQuestion.question_text}</div>
                ) : null}

                <fieldset className={styles.choiceFieldset}>
                  <legend className={styles.srOnly}>
                    Choose an answer for question {currentQuestion.position}
                  </legend>
                  {(["A", "B", "C", "D"] as AnswerLetter[]).map((letter, index) => (
                    <label
                      key={letter}
                      className={
                        styles.choiceRow +
                        (currentQuestion.selectedAnswer === letter
                          ? " " + styles.choiceRowSelected
                          : "")
                      }
                    >
                      <input
                        ref={(element) => {
                          choiceRefs.current[index] = element;
                        }}
                        className={styles.radioInput}
                        type="radio"
                        name="mock-answer"
                        value={letter}
                        checked={currentQuestion.selectedAnswer === letter}
                        onChange={() =>
                          void saveQuestion(currentQuestion.id, {
                            selectedAnswer: letter,
                          })
                        }
                      />
                      <span className={styles.choiceLetter}>{letter}</span>
                      <span className={styles.choiceText}>
                        {currentQuestion.choices[letter]}
                      </span>
                    </label>
                  ))}
                </fieldset>


              </>
            ) : null}

            {error ? <div className={styles.error}>{error}</div> : null}
          </section>
        </div>
      </div>

      {mockSectionAllowsCalculator(session.section.key) ? (
        <DesmosPanel
          id="mock-desmos-panel"
          isOpen={showCalculator}
          onClose={() => setShowCalculator(false)}
          storageKey={"aced-desmos:mock:" + session.registrationId + ":math"}
          returnFocusRef={calculatorButtonRef}
          variant="mock"
        />
      ) : null}

      <footer className={styles.bottomBar}>
        <div className={styles.bottomInner}>
          <div className={styles.bottomLeftActions}>
            <button
              type="button"
              className={styles.outlineButton}
              onClick={() => setEndConfirmOpen(true)}
            >
              end section
            </button>
            {allowDevReset ? (
              <a
                href="/admin/mock-test?slug=DEV-ADMIN-BUSY"
                className={styles.devAdminPreviewButton}
              >
                admin preview
              </a>
            ) : null}
          </div>

          <div className={styles.bottomActions}>
            <button
              type="button"
              className={styles.outlineButton}
              disabled={activeIndex === 0}
              onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
            >
              ← back
            </button>
            <button
              ref={reviewButtonRef}
              type="button"
              className={styles.reviewButton}
              onClick={() => setReviewOpen(true)}
            >
              <span aria-hidden="true">▦</span> review · {answeredCount}/{questionCount}
            </button>
            <button
              type="button"
              className={styles.nextButton}
              onClick={() => {
                if (activeIndex < session.section.questions.length - 1) {
                  setActiveIndex((index) => index + 1);
                } else {
                  setReviewOpen(true);
                }
              }}
            >
              next →
            </button>
          </div>
        </div>
      </footer>

      {reviewOpen ? (
        <div className={styles.overlay} role="presentation">
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
          >
            <div className={styles.dialogHeader}>
              <h2 id="review-title">
                review <em>{session.section.key}</em>
              </h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={closeReview}
                aria-label="Close review"
              >
                ×
              </button>
            </div>

            <div className={styles.reviewLegend}>
              <span>answered <strong>{answeredCount}</strong></span>
              <span>unanswered <strong>{unansweredCount}</strong></span>
              <span>⚑ flagged <strong>{flaggedCount}</strong></span>
            </div>

            <div className={styles.reviewGrid}>
              {session.section.questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  className={
                    styles.reviewCell +
                    (question.selectedAnswer ? " " + styles.reviewCellAnswered : "") +
                    (index === activeIndex ? " " + styles.reviewCellCurrent : "")
                  }
                  onClick={() => {
                    setActiveIndex(index);
                    closeReview();
                  }}
                  aria-label={
                    "Question " +
                    question.position +
                    (question.flagged ? ", flagged" : "") +
                    (question.selectedAnswer ? ", answered" : ", unanswered")
                  }
                >
                  {question.position}
                  {question.flagged ? (
                    <span className={styles.reviewFlag} aria-hidden="true">⚑</span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className={styles.dialogFooter}>
              <button
                type="button"
                className={styles.outlineButton}
                onClick={() => {
                  setReviewOpen(false);
                  setEndConfirmOpen(true);
                }}
              >
                end section
              </button>
              <button type="button" className={styles.nextButton} onClick={closeReview}>
                keep working
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {advancingSection ? (
        <div className={styles.overlay} role="status" aria-live="polite">
          <section className={styles.dialog + " " + styles.submitDialog}>
            <div className={styles.submitSpinner} aria-hidden="true" />
            <h2>submitting {session.section.key}…</h2>
            <p>locking your answers and moving to the next screen.</p>
          </section>
        </div>
      ) : null}

      {endConfirmOpen ? (
        <div className={styles.overlay} role="presentation">
          <section
            className={styles.dialog + " " + styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-section-title"
          >
            <h2 id="end-section-title">
              end <em>{session.section.key}</em> now?
            </h2>
            <p>
              You have <strong>{unansweredCount}</strong> unanswered questions and{" "}
              <strong>{formatTime(remaining)}</strong> left. You can&apos;t come back to
              this section.
            </p>
            <div className={styles.confirmActions}>
              <button
                ref={keepWorkingRef}
                type="button"
                className={styles.nextButton}
                onClick={() => setEndConfirmOpen(false)}
              >
                keep working
              </button>
              <button
                type="button"
                className={styles.outlineButton}
                disabled={busy}
                onClick={() => void completeSection()}
              >
                {busy ? "ending…" : "end section"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <div className={styles.releaseHint} aria-hidden="true">
        Results: {releaseDisplay.localReleaseTime} on Sunday
      </div>
    </main>
  );
}
