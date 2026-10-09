import styles from "./TestModeBanner.module.css";

export default function TestModeBanner() {
  return (
    <div className={styles.banner} role="status">
      TEST MODE · no real sign-in or payment
    </div>
  );
}
