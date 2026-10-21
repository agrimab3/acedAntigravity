"use client";

import { useState } from "react";

export default function SendWelcomeButton({ userId }: { userId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  if (state === "done") return <span>✓ sent</span>;
  return <button
    type="button"
    disabled={state === "sending"}
    onClick={async () => {
      setState("sending");
      const response = await fetch("/api/admin/welcome-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) }).catch(() => null);
      setState(response?.ok ? "done" : "error");
    }}
    style={{ border: "1px solid rgba(127,127,127,.4)", background: "transparent", color: "inherit", borderRadius: 999, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
  >{state === "sending" ? "sending…" : state === "error" ? "retry" : "send"}</button>;
}
