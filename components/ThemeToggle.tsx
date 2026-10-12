"use client";

import { useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => { try { return localStorage.getItem("aced-theme") !== "light"; } catch { return true; } });
  return <button type="button" onClick={() => { const next = !dark; setDark(next); try { localStorage.setItem("aced-theme", next ? "dark" : "light"); } catch {} document.documentElement.classList.toggle("aced-dark", next); document.documentElement.classList.toggle("aced-light", !next); }} style={{ background: "transparent", border: "0.5px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.78)", padding: "6px 12px", borderRadius: "20px", fontSize: "12px", cursor: "pointer" }} aria-label="Switch light or dark mode">{dark ? "☀ light" : "☾ dark"}</button>;
}
