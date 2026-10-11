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
