"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const { status } = useSession();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

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
        background: "#050810",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        color: "white",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap"
        rel="stylesheet"
      />

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
        }}
      >
        the ACT app that <em style={{ color: "#1D9E75" }}>actually</em> gets it
      </h1>

      <p
        style={{
          fontSize: "1.1rem",
          color: "rgba(255,255,255,0.5)",
          maxWidth: "480px",
          lineHeight: 1.7,
          marginBottom: "2.5rem",
        }}
      >
        beautiful AI-powered prep for the ACT. know exactly which stars in your universe need work.
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
    </main>
  );
}
