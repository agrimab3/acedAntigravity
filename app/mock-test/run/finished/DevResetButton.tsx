"use client";

import { useState } from "react";
import styles from "./finished.module.css";

export default function DevResetButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/mock-test/dev/reset-session", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not reset the DEV mock.");
      window.location.assign("/mock-test/run");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the DEV mock.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.devResetWrap}>
      <button type="button" className={styles.devResetButton} onClick={() => void reset()} disabled={busy}>
        {busy ? "resetting…" : "reset DEV test"}
      </button>
      {error ? <span>{error}</span> : null}
    </div>
  );
}
