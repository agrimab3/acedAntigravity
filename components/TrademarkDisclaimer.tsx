import styles from "./TrademarkDisclaimer.module.css";

export default function TrademarkDisclaimer() {
  return (
    <footer className={styles.footer}>
      <p className={styles.copyright}>© 2026 Aced</p>
      <p className={styles.notice}>
        ACT® is a registered trademark of ACT, Inc. Aced is not affiliated with,
        endorsed by, or sponsored by ACT, Inc.
      </p>
    </footer>
  );
}
