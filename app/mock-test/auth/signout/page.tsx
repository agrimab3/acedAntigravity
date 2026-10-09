"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { sanitizeInternalCallbackUrl } from "@/lib/safe-callback";

export default function MockTestSignOutPage() {
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    const returnTo = sanitizeInternalCallbackUrl(requested, "/mock-test");
    void signOut({ callbackUrl: returnTo });
  }, []);

  return null;
}
