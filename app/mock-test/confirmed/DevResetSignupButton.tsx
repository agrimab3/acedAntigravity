"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./confirmed.module.css";

export default function DevResetSignupButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resetSignup() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/mock-test/dev/reset-signup", {
        method: "POST",
      });
      const data = (await response.json()) as { reset?: boolean; error?: string };

      if (!response.ok || !data.reset) {
        throw new Error(data.error || "Could not reset mock test signup.");
      }

      router.push("/mock-test/signup");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reset mock test signup.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.devResetSignupWrap}>
      <button
        type="button"
        className={styles.devResetSignupButton}
        onClick={() => void resetSignup()}
        disabled={busy}
      >
        {busy ? "resetting signup…" : "DEV: reset mock test signup"}
      </button>
      {error ? <span>{error}</span> : null}
    </div>
  );
}
