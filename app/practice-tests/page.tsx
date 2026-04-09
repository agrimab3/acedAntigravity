"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  FULL_TESTS,
  PRACTICE_TEST_MODES,
  SECTION_TESTS,
  type PracticeTestMode,
} from "@/lib/practice-tests";

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export default function PracticeTestsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [selectedModeKey, setSelectedModeKey] = useState(PRACTICE_TEST_MODES[0]?.key);

  const selectedMode = useMemo(
    () => PRACTICE_TEST_MODES.find((mode) => mode.key === selectedModeKey) ?? PRACTICE_TEST_MODES[0],
    [selectedModeKey]
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

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
        background:
          "radial-gradient(circle at 15% 18%, rgba(38, 95, 143, 0.22), transparent 24%), radial-gradient(circle at 76% 20%, rgba(29, 158, 117, 0.16), transparent 24%), radial-gradient(circle at 50% 78%, rgba(118, 63, 143, 0.18), transparent 30%), linear-gradient(180deg,#0d1b2a 0%,#060d1e 48%,#020408 100%)",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500&display=swap"
        rel="stylesheet"
      />

      <div style={{ padding: "1.5rem 1.5rem 2.5rem", maxWidth: "1240px", margin: "0 auto" }}>
        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "2rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px" }}>
            Aced<em style={{ color: "#1D9E75" }}>.</em>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "2.8rem",
              flex: 1,
              minWidth: "220px",
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
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
            Phase 3A
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
              Phase 3A foundation is live now. Next up is the real timed test shell with answer nav, autosubmit, section reports,
              and Math calculator support.
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
                disabled
                style={{
                  flex: 1.4,
                  padding: "11px 12px",
                  borderRadius: "12px",
                  background: selectedMode.accentColor,
                  border: "none",
                  color: "#081018",
                  cursor: "not-allowed",
                  fontSize: "13px",
                  fontWeight: 600,
                  opacity: 0.92,
                }}
              >
                timed runner next →
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
