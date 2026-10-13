import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display, Playfair_Display } from "next/font/google";
import "./globals.css";
import SiteChrome from "./site-chrome";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
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
    <html lang="en" className={`h-full antialiased ${dmSans.variable} ${dmSerif.variable} ${playfair.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('aced-theme')||'dark';document.documentElement.classList.add(t==='light'?'aced-light':'aced-dark')}catch(e){document.documentElement.classList.add('aced-dark')}})();` }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
