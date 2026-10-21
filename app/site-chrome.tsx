"use client";

import { usePathname } from "next/navigation";
import Providers from "./providers";
import FeedbackFooter from "@/components/FeedbackFooter";
import TrademarkDisclaimer from "@/components/TrademarkDisclaimer";
import StudentTour from "@/components/StudentTour";

const publicPaths = new Set(["/", "/how-it-works", "/live-lessons", "/sections", "/faq", "/about", "/join", "/legal", "/terms", "/privacy", "/refunds", "/mock-test-rules", "/accessibility", "/signin", "/signin/complete"]);

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (publicPaths.has(pathname)) return <>{children}</>;
  return <><Providers>{children}<StudentTour /></Providers><TrademarkDisclaimer /><FeedbackFooter /></>;
}
