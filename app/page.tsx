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

      <form
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          justifyContent: "center",
          marginBottom: "1rem",
        }}
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          type="email"
          placeholder="your email"
          style={{
            padding: "12px 20px",
            borderRadius: "12px",
            border: "0.5px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.05)",
            color: "white",
            fontSize: "14px",
            width: "260px",
            outline: "none",
            fontFamily: "'DM Sans', sans-serif",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "12px 24px",
            borderRadius: "12px",
            background: "#1D9E75",
            color: "white",
            border: "none",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          sign up
        </button>
      </form>

      <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", marginBottom: "1rem" }}>
        beta
      </p>

      <button
        onClick={handleGoogleLogin}
        disabled={isSigningIn}
        style={{
          background: "transparent",
          border: "0.5px solid rgba(255,255,255,0.15)",
          color: "rgba(255,255,255,0.45)",
          padding: "10px 24px",
          borderRadius: "12px",
          fontSize: "13px",
          cursor: isSigningIn ? "wait" : "pointer",
          opacity: isSigningIn ? 0.7 : 1,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {isSigningIn ? "connecting..." : "continue with google"}
      </button>

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
