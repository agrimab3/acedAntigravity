import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import FeedbackFooter from "@/components/FeedbackFooter";
import TrademarkDisclaimer from "@/components/TrademarkDisclaimer";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
});

export const metadata: Metadata = {
  title: "Aced",
  description: "Online ACT prep and a $2 timed ACED Mock Test.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${dmSans.variable} ${dmSerif.variable}`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <TrademarkDisclaimer />
        <FeedbackFooter />
      </body>
    </html>
  );
}
