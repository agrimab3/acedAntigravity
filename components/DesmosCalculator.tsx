"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DESMOS_VERSION = "v1.12";
const DESMOS_SCRIPT_ID = "aced-desmos-api";
const DESMOS_DEMO_KEY = "dcb31709b452b1cf9dc26972add0fda6";

type DesmosState = unknown;

type DesmosCalculatorInstance = {
  getState: () => DesmosState;
  setState: (state: DesmosState) => void;
  observeEvent: (eventName: string, callback: () => void) => void;
  unobserveEvent: (eventName: string) => void;
  destroy: () => void;
};

type DesmosNamespace = {
  GraphingCalculator: (
    element: HTMLElement,
    options?: Record<string, unknown>
  ) => DesmosCalculatorInstance;
};

declare global {
  interface Window {
    Desmos?: DesmosNamespace;
  }
}

let desmosLoadPromise: Promise<DesmosNamespace> | null = null;

function getApiKey() {
  const configured = process.env.NEXT_PUBLIC_DESMOS_API_KEY?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : DESMOS_DEMO_KEY;
}

function loadDesmosScript(apiKey: string) {
  if (window.Desmos) return Promise.resolve(window.Desmos);
  if (desmosLoadPromise) return desmosLoadPromise;

  desmosLoadPromise = new Promise<DesmosNamespace>((resolve, reject) => {
    const existing = document.getElementById(DESMOS_SCRIPT_ID) as HTMLScriptElement | null;
    const timeoutId = window.setTimeout(() => {
      desmosLoadPromise = null;
      reject(new Error("Desmos took too long to load."));
    }, 10000);

    const finish = () => {
      window.clearTimeout(timeoutId);
      if (window.Desmos) {
        resolve(window.Desmos);
      } else {
        desmosLoadPromise = null;
        reject(new Error("Desmos loaded without exposing its API."));
      }
    };

    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener(
        "error",
        () => {
          window.clearTimeout(timeoutId);
          desmosLoadPromise = null;
          reject(new Error("Desmos failed to load."));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = DESMOS_SCRIPT_ID;
    script.async = true;
    script.src =
      "https://www.desmos.com/api/" +
      DESMOS_VERSION +
      "/calculator.js?apiKey=" +
      encodeURIComponent(apiKey);

    script.addEventListener("load", finish, { once: true });
    script.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeoutId);
        script.remove();
        desmosLoadPromise = null;
        reject(new Error("Desmos failed to load."));
      },
      { once: true }
    );

    document.head.appendChild(script);
  });

  return desmosLoadPromise;
}

function readSavedState(storageKey: string) {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as DesmosState) : null;
  } catch {
    return null;
  }
}

function saveState(storageKey: string, state: DesmosState) {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Calculator use should continue even if browser storage is unavailable.
  }
}

export default function DesmosCalculator({
  isOpen,
  storageKey,
  className,
  fillContainer = false,
  autoFocus = false,
}: {
  isOpen: boolean;
  storageKey: string;
  className?: string;
  fillContainer?: boolean;
  autoFocus?: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const calculatorRef = useRef<DesmosCalculatorInstance | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );

  const destroyCalculator = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const calculator = calculatorRef.current;
    if (calculator) {
      try {
        saveState(storageKey, calculator.getState());
      } catch {
        // Ignore state-read failures during cleanup.
      }
      calculator.unobserveEvent("change");
      calculator.destroy();
      calculatorRef.current = null;
    }
  }, [storageKey]);

  useEffect(() => {
    if (!isOpen) {
      destroyCalculator();
      const idleFrame = window.requestAnimationFrame(() => setStatus("idle"));
      return () => window.cancelAnimationFrame(idleFrame);
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      const errorFrame = window.requestAnimationFrame(() => setStatus("error"));
      return () => window.cancelAnimationFrame(errorFrame);
    }

    let cancelled = false;
    const loadingFrame = window.requestAnimationFrame(() => setStatus("loading"));

    void loadDesmosScript(apiKey)
      .then((Desmos) => {
        if (cancelled || !mountRef.current) return;

        const calculator = Desmos.GraphingCalculator(mountRef.current, {
          expressions: true,
          keypad: true,
          zoomButtons: true,
          settingsMenu: false,
          border: false,
          links: false,
          images: false,
          notes: false,
          folders: false,
          expressionsCollapsed: false,
          backgroundColor: "#0F1022",
          textColor: "#EEF1F5",
          accentColor: "#AFA9EC",
        });

        calculatorRef.current = calculator;

        const saved = readSavedState(storageKey);
        if (saved) {
          try {
            calculator.setState(saved);
          } catch {
            // A corrupt/old state should not prevent calculator use.
          }
        }

        const onChange = () => {
          if (saveTimerRef.current !== null) {
            window.clearTimeout(saveTimerRef.current);
          }
          saveTimerRef.current = window.setTimeout(() => {
            const active = calculatorRef.current;
            if (!active) return;
            try {
              saveState(storageKey, active.getState());
            } catch {
              // Ignore transient state-read failures.
            }
          }, 500);
        };

        calculator.observeEvent("change", onChange);
        setStatus("ready");
        if (autoFocus) {
          window.requestAnimationFrame(() => {
            const target = mountRef.current?.querySelector<HTMLElement>(
              "textarea, input, [contenteditable=\"true\"], button"
            );
            (target ?? mountRef.current)?.focus();
          });
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(loadingFrame);
      destroyCalculator();
    };
  }, [autoFocus, destroyCalculator, isOpen, loadAttempt, storageKey]);

  if (!isOpen) return null;

  return (
    <div
      className={className}
      data-desmos-calculator
      style={{
        minHeight: fillContainer ? 0 : 480,
        height: fillContainer ? "100%" : undefined,
        position: "relative",
        overflow: "hidden",
        borderRadius: fillContainer ? 0 : 18,
        border: fillContainer ? 0 : "1px solid #3B3870",
        background: "#0F1022",
      }}
    >
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: fillContainer ? "100%" : 520,
          minHeight: fillContainer ? 0 : undefined,
          display: status === "error" ? "none" : "block",
        }}
        aria-label="Desmos graphing calculator"
      />

      {status === "loading" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#A9B2BF",
            fontSize: 14,
            pointerEvents: "none",
          }}
        >
          loading calculator…
        </div>
      ) : null}

      {status === "error" ? (
        <div
          style={{
            minHeight: fillContainer ? "100%" : 480,
            padding: 28,
            display: "grid",
            placeContent: "center",
            justifyItems: "center",
            gap: 16,
            textAlign: "center",
            color: "#B4BCC8",
          }}
        >
          <p style={{ margin: 0, maxWidth: 420, lineHeight: 1.6 }}>
            The calculator didn&apos;t load. You can use your own ACT-approved
            calculator.
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus("idle");
              setLoadAttempt((value) => value + 1);
            }}
            style={{
              minHeight: 44,
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid #3B3870",
              background: "#16152B",
              color: "#CFCBF5",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
