import { notFound } from "next/navigation";
import NightSky from "@/components/NightSky";
import TestModeBanner from "@/components/TestModeBanner";
import { getMockTestAuthMode, logUnsafeProductionMockTestMode } from "@/lib/mockTest/mode";
import { sanitizeMockTestReturnTo } from "@/lib/mockTest/auth";
import LogoutClient from "./LogoutClient";
import styles from "../dev.module.css";

type LogoutPageProps = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function MockTestDevLogoutPage({ searchParams }: LogoutPageProps) {
  if (process.env.NODE_ENV === "production" || getMockTestAuthMode() !== "test") {
    logUnsafeProductionMockTestMode();
    notFound();
  }

  const params = await searchParams;
  const returnTo = sanitizeMockTestReturnTo(params.returnTo);

  return (
    <div className={styles.pageRoot}>
      <NightSky />
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,600;1,700&display=swap"
        rel="stylesheet"
      />
      <TestModeBanner />
      <main className={styles.content}>
        <section className={styles.statusCard}>
          <h1>switching test student…</h1>
          <p>Signing out of the current fake student.</p>
          <LogoutClient returnTo={returnTo} />
        </section>
      </main>
    </div>
  );
}
