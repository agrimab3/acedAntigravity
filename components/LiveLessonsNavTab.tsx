"use client";

import { usePathname, useRouter } from "next/navigation";

export default function LiveLessonsNavTab() {
  const pathname = usePathname();
  const router = useRouter();
  const active = pathname.startsWith("/lessons");

  return (
    <button
      type="button"
      onClick={() => router.push("/lessons")}
      aria-current={active ? "page" : undefined}
      style={{
        background: "transparent",
        border: "none",
        color: active ? "#fff" : "rgba(255,255,255,0.78)",
        fontSize: "17px",
        fontWeight: 500,
        cursor: active ? "default" : "pointer",
        padding: "6px 4px",
        position: "relative",
        textShadow: active ? "0 0 18px rgba(29,158,117,0.4)" : "0 0 14px rgba(255,255,255,0.18)",
        fontFamily: "DM Sans,sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "calc(100% + 22px)",
          height: "20px",
          transform: "translate(-50%, -50%)",
          borderRadius: "999px",
          background: "radial-gradient(circle, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.045) 58%, transparent 84%)",
          filter: "blur(11px)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <span style={{ position: "relative", zIndex: 1 }}>live lessons</span>
    </button>
  );
}
