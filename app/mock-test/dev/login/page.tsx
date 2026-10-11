import { notFound } from "next/navigation";
import NightSky from "@/components/NightSky";
import TestModeBanner from "@/components/TestModeBanner";
import { MOCK_TEST_STUDENTS } from "@/lib/mockTest/testStudents";
import { getMockTestAuthMode, logUnsafeProductionMockTestMode } from "@/lib/mockTest/mode";
import { sanitizeMockTestReturnTo } from "@/lib/mockTest/auth";
import StudentPicker from "./StudentPicker";
import styles from "../dev.module.css";

type LoginPageProps = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function MockTestDevLoginPage({ searchParams }: LoginPageProps) {
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
        <section className={styles.card}>
          <div className={styles.eyebrow}>ACED MOCK TEST</div>
          <h1 className={styles.heading}>
            pick a <em>test student</em>
          </h1>
          <p className={styles.copy}>
            Choose a fake student to test the signup flow. No real account is used.
          </p>

          <StudentPicker students={MOCK_TEST_STUDENTS} returnTo={returnTo} />
        </section>
      </main>
    </div>
  );
}
