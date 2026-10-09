import styles from "./SeatCounter.module.css";
import type { StudentSeatDisplay } from "@/lib/mockTest/seat-policy";

type SeatCounterProps = {
  display: StudentSeatDisplay;
  align?: "center" | "left";
};

export default function SeatCounter({
  display,
  align = "center",
}: SeatCounterProps) {
  return (
    <div
      className={`${styles.counter} ${align === "left" ? styles.left : ""} ${
        display.kind === "full"
          ? styles.full
          : display.kind === "almost_full"
            ? styles.low
            : ""
      }`}
      aria-label={display.text}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.text}>{display.text}</span>
    </div>
  );
}
