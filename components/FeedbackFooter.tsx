"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import FeedbackForm from "./FeedbackForm";
export default function FeedbackFooter() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (path?.startsWith("/mock-test/run") || path?.startsWith("/practice-tests/run")) return null;
  return <><footer style={{ textAlign: "center", padding: "10px 0 24px", background: "#080f19" }}><div style={{display:"flex",justifyContent:"center",gap:14,flexWrap:"wrap",alignItems:"center"}}><button onClick={() => setOpen(true)} style={{ border: 0, background: "none", color: "#9ba9b7", cursor: "pointer", fontSize: 12 }}>Send feedback</button>{[["Privacy","/privacy"],["Terms","/terms"],["Refunds","/refunds"],["Contact","/contact"]].map(([label,href])=><Link key={href} href={href} style={{color:"#9ba9b7",fontSize:12,textDecoration:"none"}}>{label}</Link>)}</div></footer>{open && <div role="presentation" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 9999, display: "grid", placeItems: "center", padding: 16 }}><div role="dialog" aria-modal="true" aria-label="Send feedback" onClick={e => e.stopPropagation()} style={{ width: "min(100%,520px)", maxHeight: "90vh", overflowY: "auto" }}><button onClick={() => setOpen(false)} aria-label="Close feedback" style={{ float: "right", background: "none", color: "white", border: 0, fontSize: 22, cursor: "pointer" }}>×</button><FeedbackForm source="page_footer" compact /></div></div>}</>;
}
