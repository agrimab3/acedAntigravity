"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = { storageKey: string; children: ReactNode };

export default function DismissibleLiveLessonTile({ storageKey, children }: Props) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem(storageKey) === "hidden"); } catch {} }, [storageKey]);
  if (hidden) return <button className="dashboard-restore-pill" type="button" onClick={() => { try { localStorage.removeItem(storageKey); } catch {} setHidden(false); }}>✦ Live lesson</button>;
  return <div className="dashboard-tile-shell">{children}<button className="dashboard-tile-hide" type="button" aria-label="Hide" onClick={() => { try { localStorage.setItem(storageKey, "hidden"); } catch {} setHidden(true); }}>×</button></div>;
}
