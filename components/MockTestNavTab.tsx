"use client";

import { usePathname, useRouter } from "next/navigation";

export default function MockTestNavTab() {
  const pathname = usePathname();
  const router = useRouter();
  const active = pathname.startsWith("/mock-test");

  return (
    <button
      type="button"
      onClick={() => router.push("/mock-test")}
      style={{
        background: "transparent",
        border: "none",
        color: active ? "#fff" : "rgba(255,255,255,0.78)",
        fontSize: "17px",
        fontWeight: 500,
        cursor: active ? "default" : "pointer",
        padding: "6px 4px",
        position: "relative",
        textShadow: active
          ? "0 0 18px rgba(29,158,117,0.4)"
          : "0 0 14px rgba(255,255,255,0.18)",
        fontFamily: "DM Sans,sans-serif",
      }}
      aria-current={active ? "page" : undefined}
    >
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: active ? "calc(100% + 26px)" : "calc(100% + 22px)",
          height: active ? "24px" : "20px",
          transform: "translate(-50%, -50%)",
          borderRadius: "999px",
          background: active
            ? "radial-gradient(circle, rgba(29,158,117,0.26) 0%, rgba(29,158,117,0.12) 54%, transparent 82%)"
            : "radial-gradient(circle, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.045) 58%, transparent 84%)",
          filter: active ? "blur(12px)" : "blur(11px)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          position: "relative",
          zIndex: 1,
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        mock test
        <span
          aria-hidden="true"
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "999px",
            background: "#5DCAA5",
            boxShadow: "0 0 8px #5DCAA5",
          }}
        />
      </span>
    </button>
  );
}
