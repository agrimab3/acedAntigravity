import type { Metadata } from "next";
import Link from "next/link";
import {
  getMockTestAdminPicker,
  requireMockTestAdminPage,
} from "@/lib/admin/mockTestAdmin";
import { getMockTestLiveOverview } from "@/lib/admin/mockTestLive";
import MockTestLiveConsole from "./live-console";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "Mock Test Admin · Aced",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
  },
};

export const dynamic = "force-dynamic";

export default async function MockTestAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const session = await requireMockTestAdminPage();
  const params = await searchParams;
  const { tests, selected } = await getMockTestAdminPicker(params.slug);
  const initialOverview = selected
    ? await getMockTestLiveOverview(selected.slug)
    : null;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>ACED MOCK TEST OPS</div>
            <h1>test day admin</h1>
            <p>signed in as {session.user?.email}</p>
          </div>
          <div className={styles.headerActions}>
            {process.env.NODE_ENV !== "production" ? (
              <Link
                className={styles.previewButton}
                href="/admin/mock-test?slug=DEV-ADMIN-BUSY"
              >
                preview busy dashboard
              </Link>
            ) : null}
            <Link className={styles.backLink} href="/dashboard">
              dashboard
            </Link>
          </div>
        </header>

        <section className={styles.card} aria-labelledby="test-picker-title">
          <div className={styles.cardHeading}>
            <div>
              <div className={styles.label}>TEST PICKER</div>
              <h2 id="test-picker-title">choose a mock test</h2>
            </div>
            {selected ? (
              <span className={styles.statusPill} data-status={selected.status}>
                {selected.status}
              </span>
            ) : null}
          </div>

          {tests.length > 0 ? (
            <form className={styles.pickerForm} method="get">
              <label htmlFor="mock-test-slug">Mock test</label>
              <div className={styles.pickerRow}>
                <select
                  id="mock-test-slug"
                  name="slug"
                  defaultValue={selected?.slug ?? tests[0]?.slug}
                >
                  {tests.map((test) => (
                    <option value={test.slug} key={test.id}>
                      {test.slug} · {test.status}
                    </option>
                  ))}
                </select>
                <button type="submit">view test</button>
              </div>
            </form>
          ) : (
            <p className={styles.empty}>No mock tests exist yet.</p>
          )}

          {selected ? (
            <dl className={styles.summaryGrid}>
              <div>
                <dt>test date</dt>
                <dd>{selected.testDate}</dd>
              </div>
              <div>
                <dt>real ACT</dt>
                <dd>{selected.actDate}</dd>
              </div>
              <div>
                <dt>seat limit</dt>
                <dd>{selected.seatLimit}</dd>
              </div>
              <div>
                <dt>results release</dt>
                <dd>
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: "America/Los_Angeles",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  }).format(selected.resultsReleaseAt)}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>

        {selected && initialOverview ? (
          <MockTestLiveConsole
            slug={selected.slug}
            initialOverview={initialOverview}
          />
        ) : (
          <section className={styles.placeholderCard}>
            <div className={styles.label}>LIVE OPS</div>
            <h2>No live test data is available.</h2>
          </section>
        )}
      </div>
    </main>
  );
}
