"use client";

import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";

export default function Providers({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  // Public pages must not start NextAuth background requests behind Caddy Basic Auth.
  const isPublic = pathname === "/" || ["/how-it-works", "/sections", "/faq", "/about", "/join", "/terms", "/privacy", "/refunds", "/contact"].includes(pathname);
  if (isPublic) return <>{children}</>;
  return <SessionProvider>{children}</SessionProvider>;
}
