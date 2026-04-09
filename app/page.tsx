"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const { status } = useSession();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stars = Array.from({ length: 160 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.6,
      opacity: 0.18 + Math.random() * 0.72,
      speed: 0.2 + Math.random() * 1.3,
      phase: Math.random() * Math.PI * 2,
    }));

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(canvas.offsetWidth * dpr);
      canvas.height = Math.floor(canvas.offsetHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const draw = (timestamp: number) => {
      const t = timestamp * 0.001;
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      for (const star of stars) {
        const x = star.x * canvas.offsetWidth;
        const y = star.y * canvas.offsetHeight;
        const twinkle = 0.55 + 0.45 * Math.sin(t * star.speed + star.phase);

        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${star.opacity * twinkle})`;
        ctx.arc(x, y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  async function handleGoogleLogin() {
    try {
      setAuthError(null);
      setIsSigningIn(true);
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch (error) {
      console.error("Google sign-in failed", error);
      setAuthError(
        error instanceof Error
          ? error.message
          : "Google sign-in is not configured yet. Add AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, and AUTH_SECRET to continue."
      );
      setIsSigningIn(false);
    }
  }

  return (
    <main
      style={{
        background:
          "radial-gradient(circle at 20% 20%, rgba(35, 79, 122, 0.34), transparent 30%), radial-gradient(circle at 78% 22%, rgba(36, 124, 104, 0.2), transparent 28%), radial-gradient(circle at 50% 75%, rgba(76, 34, 92, 0.22), transparent 34%), linear-gradient(180deg, #07111f 0%, #050812 50%, #02040b 100%)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        color: "white",
        padding: "2rem",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap"
        rel="stylesheet"
      />

      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          opacity: 0.95,
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-12%",
          left: "-8%",
          width: "34rem",
          height: "34rem",
          borderRadius: "999px",
          background: "radial-gradient(circle, rgba(46, 112, 174, 0.22), rgba(46, 112, 174, 0) 70%)",
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: "-10%",
          bottom: "-16%",
          width: "30rem",
          height: "30rem",
          borderRadius: "999px",
          background: "radial-gradient(circle, rgba(31, 158, 117, 0.18), rgba(31, 158, 117, 0) 68%)",
          filter: "blur(26px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: "28px",
            fontFamily: "'DM Serif Display', serif",
            marginBottom: "2.5rem",
            letterSpacing: "-0.5px",
          }}
        >
          Aced<span style={{ color: "#1D9E75", fontStyle: "italic" }}>.</span>
        </div>

        <h1
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
            lineHeight: 1.1,
            maxWidth: "700px",
            marginBottom: "1.25rem",
            fontWeight: 400,
            textShadow: "0 12px 40px rgba(0,0,0,0.22)",
          }}
        >
          <>
            Are you ready to
            <br />
            <em style={{ color: "#1D9E75" }}>ace it</em>?
          </>
        </h1>

        <p
          style={{
            fontSize: "1.1rem",
            color: "rgba(255,255,255,0.62)",
            maxWidth: "480px",
            lineHeight: 1.7,
            marginBottom: "2.5rem",
          }}
        >
          AI-powered ACT prep, written in the stars. your universe is waiting.
        </p>

        <button
          onClick={handleGoogleLogin}
          disabled={isSigningIn}
          style={{
            background: "#1D9E75",
            border: "none",
            color: "#ffffff",
            padding: "12px 26px",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: isSigningIn ? "wait" : "pointer",
            opacity: isSigningIn ? 0.7 : 1,
            fontFamily: "'DM Sans', sans-serif",
            marginBottom: "1rem",
            boxShadow: "0 12px 32px rgba(29, 158, 117, 0.25)",
          }}
        >
          {isSigningIn ? "connecting..." : "continue with google"}
        </button>

        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)" }}>
          beta
        </p>

        {authError && (
          <p
            style={{
              marginTop: "0.9rem",
              maxWidth: "520px",
              fontSize: "13px",
              lineHeight: 1.6,
              color: "#F0997B",
            }}
          >
            {authError}
          </p>
        )}
      </div>
    </main>
  );
}
