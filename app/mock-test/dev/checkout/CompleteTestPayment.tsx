"use client";

import { useState } from "react";
import styles from "../dev.module.css";

export default function CompleteTestPayment({ registrationId }: { registrationId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const completePayment = async () => {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/mock-test/dev/complete-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId }),
      });
      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(data.error || "Could not complete the test payment.");
      }

      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the test payment.");
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.testPayButton}
        onClick={() => void completePayment()}
        disabled={busy}
      >
        {busy ? "marking paid…" : "complete test payment ✦"}
      </button>
      {error ? <p className={styles.errorText}>{error}</p> : null}
    </>
  );
}
