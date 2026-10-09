"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LogoutClient({ returnTo }: { returnTo: string }) {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    void signOut({ redirect: false }).finally(() => {
      if (!active) return;
      router.replace(
        `/mock-test/dev/login?returnTo=${encodeURIComponent(returnTo)}`
      );
      router.refresh();
    });

    return () => {
      active = false;
    };
  }, [returnTo, router]);

  return null;
}
