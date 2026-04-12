"use client";

import { useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";

type WalkthroughTargetKey =
  | "welcome"
  | "universe"
  | "estimate"
  | "filters"
  | "practiceTests"
  | "progress";

type WalkthroughRefs = {
  universeRef: RefObject<HTMLElement | null>;
  filtersRef: RefObject<HTMLElement | null>;
  practiceTestsRef: RefObject<HTMLElement | null>;
  progressRef: RefObject<HTMLElement | null>;
};

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
};

type FirstTimeWalkthroughProps = WalkthroughRefs & {
  firstName: string;
  open: boolean;
  saving?: boolean;
  onClose: () => void;
};

type WalkthroughStep = {
  id: WalkthroughTargetKey;
  title: string;
  body: string;
  eyebrow: string;
};

const STEP_ACCENTS = ["#5DCAA5", "#AFA9EC", "#EF9F27", "#8BB9FF", "#F0997B"] as const;

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: "welcome",
    eyebrow: "welcome to your universe",
    title: "let's light this place up, one star at a time.",
    body: "Aced turns your skills into constellations, your practice into motion, and your progress into something you can actually feel.",
  },
  {
    id: "universe",
    eyebrow: "your star map",
    title: "every bright star is a real ACT skill.",
    body: "As you practice, weak stars wake up, strong stars glow harder, and your universe starts looking more alive.",
  },
  {
    id: "estimate",
    eyebrow: "live estimate",
    title: "the center ring moves with you.",
    body: "This is your live ACT estimate. It updates as your mastery, accuracy, timing, and test performance evolve.",
  },
  {
    id: "filters",
    eyebrow: "zoom in",
    title: "want one constellation at a time?",
    body: "Use these section filters to isolate English, Math, Reading, or Science and focus the map on one part of your universe.",
  },
  {
    id: "practiceTests",
    eyebrow: "timed practice",
    title: "practice tests turn pressure into a plan.",
    body: "Run timed sections or full tests here, then let Aced turn the misses into the next stars you should train.",
  },
  {
    id: "progress",
    eyebrow: "your history",
    title: "progress keeps the receipts.",
    body: "Saved review, trends, and recovery work all live here, so you can see what is actually changing over time.",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function inflateRect(rect: DOMRect, padding: number, radius: number): SpotlightRect {
  return {
    top: clamp(rect.top - padding, 18, window.innerHeight - 100),
    left: clamp(rect.left - padding, 18, window.innerWidth - 100),
    width: clamp(rect.width + padding * 2, 120, window.innerWidth - 36),
    height: clamp(rect.height + padding * 2, 52, window.innerHeight - 36),
    radius,
  };
}

function getSpotlightRect(stepId: WalkthroughTargetKey, refs: WalkthroughRefs): SpotlightRect | null {
  if (stepId === "welcome") {
    return null;
  }

  if (stepId === "practiceTests") {
    const rect = refs.practiceTestsRef.current?.getBoundingClientRect();
    return rect ? inflateRect(rect, 12, 22) : null;
  }

  if (stepId === "progress") {
    const rect = refs.progressRef.current?.getBoundingClientRect();
    return rect ? inflateRect(rect, 12, 22) : null;
  }

  if (stepId === "filters") {
    const rect = refs.filtersRef.current?.getBoundingClientRect();
    return rect ? inflateRect(rect, 14, 24) : null;
  }

  const universeRect = refs.universeRef.current?.getBoundingClientRect();

  if (!universeRect) {
    return null;
  }

  if (stepId === "estimate") {
    const width = Math.min(universeRect.width * 0.32, 340);
    const height = Math.min(universeRect.height * 0.42, 270);
    return {
      top: universeRect.top + universeRect.height * 0.31 - height / 2,
      left: universeRect.left + universeRect.width * 0.5 - width / 2,
      width,
      height,
      radius: 999,
    };
  }

  return inflateRect(universeRect, 16, 32);
}

export default function FirstTimeWalkthrough({
  firstName,
  open,
  saving = false,
  onClose,
  universeRef,
  filtersRef,
  practiceTestsRef,
  progressRef,
}: FirstTimeWalkthroughProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);

  const refs = useMemo(
    () => ({ universeRef, filtersRef, practiceTestsRef, progressRef }),
    [filtersRef, practiceTestsRef, progressRef, universeRef]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const updateSpotlight = () => {
      setSpotlightRect(getSpotlightRect(WALKTHROUGH_STEPS[stepIndex].id, refs));
    };

    updateSpotlight();
    window.addEventListener("resize", updateSpotlight);
    window.addEventListener("scroll", updateSpotlight, true);

    return () => {
      window.removeEventListener("resize", updateSpotlight);
      window.removeEventListener("scroll", updateSpotlight, true);
    };
  }, [open, refs, stepIndex]);

  if (!open) {
    return null;
  }

  const step = WALKTHROUGH_STEPS[stepIndex];
  const isLastStep = stepIndex === WALKTHROUGH_STEPS.length - 1;

  return (
    <>
      <style>{`
        @keyframes walkthroughFramePulse {
          0% { transform: scale(0.985); opacity: 0.78; }
          50% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.985); opacity: 0.78; }
        }
        @keyframes walkthroughCardFade {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 60,
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(2, 6, 15, 0.74)",
            backdropFilter: "blur(10px)",
          }}
        />

        {spotlightRect ? (
          <div
            style={{
              position: "fixed",
              top: spotlightRect.top,
              left: spotlightRect.left,
              width: spotlightRect.width,
              height: spotlightRect.height,
              borderRadius: `${spotlightRect.radius}px`,
              boxShadow:
                "0 0 0 9999px rgba(2, 6, 15, 0.72), 0 0 0 1px rgba(255,255,255,0.14), 0 0 36px rgba(175,169,236,0.22), 0 0 84px rgba(93,202,165,0.16)",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.03)",
              animation: "walkthroughFramePulse 2.8s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
        ) : null}

        <div
          style={{
            position: "fixed",
            top: 26,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 62,
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "10px 14px",
            borderRadius: "999px",
            background: "rgba(7, 14, 28, 0.8)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
          }}
        >
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.76)", letterSpacing: ".06em", textTransform: "uppercase" }}>
            {stepIndex + 1} of {WALKTHROUGH_STEPS.length}
          </span>
          <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
            {WALKTHROUGH_STEPS.map((walkthroughStep, index) => (
              <span
                key={walkthroughStep.id}
                style={{
                  width: index === stepIndex ? "24px" : "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background:
                    index === stepIndex
                      ? `linear-gradient(90deg, ${STEP_ACCENTS[index % STEP_ACCENTS.length]}, rgba(255,255,255,0.92))`
                      : "rgba(255,255,255,0.16)",
                  transition: "all 180ms ease",
                }}
              />
            ))}
          </div>
        </div>

        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 28,
            transform: "translateX(-50%)",
            width: "min(680px, calc(100vw - 32px))",
            zIndex: 62,
            animation: "walkthroughCardFade 320ms ease both",
          }}
          key={step.id}
        >
          <div
            style={{
              borderRadius: "28px",
              background:
                "linear-gradient(180deg, rgba(11, 21, 38, 0.94) 0%, rgba(6, 12, 23, 0.96) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 24px 100px rgba(0,0,0,0.36)",
              padding: "24px 24px 22px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.42)",
                letterSpacing: ".12em",
                textTransform: "uppercase",
                marginBottom: "10px",
              }}
            >
              {step.eyebrow}
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: "DM Serif Display, serif",
                fontStyle: "italic",
                fontWeight: 400,
                fontSize: "clamp(1.9rem, 3vw, 2.7rem)",
                lineHeight: 1.02,
                color: "#fff",
              }}
            >
              {stepIndex === 0 ? `hi ${firstName}. ${step.title}` : step.title}
            </h2>
            <p
              style={{
                margin: "14px 0 0",
                fontSize: "15px",
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.72)",
                maxWidth: "58ch",
              }}
            >
              {step.body}
            </p>

            <div
              style={{
                marginTop: "22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={onClose}
                disabled={saving}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: "13px",
                  cursor: saving ? "progress" : "pointer",
                  padding: 0,
                }}
              >
                skip walkthrough
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {stepIndex > 0 ? (
                  <button
                    onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "999px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.78)",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    back
                  </button>
                ) : null}

                <button
                  onClick={() => {
                    if (isLastStep) {
                      onClose();
                      return;
                    }

                    setStepIndex((current) => Math.min(WALKTHROUGH_STEPS.length - 1, current + 1));
                  }}
                  disabled={saving}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "999px",
                    border: "none",
                    background:
                      "linear-gradient(135deg, rgba(93,202,165,0.94) 0%, rgba(140,176,238,0.94) 52%, rgba(239,159,39,0.92) 100%)",
                    color: "#081221",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: saving ? "progress" : "pointer",
                    minWidth: "168px",
                  }}
                >
                  {isLastStep ? (saving ? "entering..." : "enter my universe →") : stepIndex === 0 ? "show me around →" : "keep going →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
