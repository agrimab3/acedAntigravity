"use client";

import { usePathname } from "next/navigation";
import Providers from "./providers";
import FeedbackFooter from "@/components/FeedbackFooter";
import TrademarkDisclaimer from "@/components/TrademarkDisclaimer";

const publicPaths = new Set(["/", "/how-it-works", "/sections", "/faq", "/about", "/join"]);

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (publicPaths.has(pathname)) return <>{children}</>;
  return <><Providers>{children}</Providers><TrademarkDisclaimer /><FeedbackFooter /></>;
}
