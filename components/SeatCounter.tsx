import styles from "./SeatCounter.module.css";

type SeatCounterProps = {
  limit: number;
  remaining: number;
  isFull: boolean;
  align?: "center" | "left";
};

export default function SeatCounter({
  limit,
  remaining,
  isFull,
  align = "center",
}: SeatCounterProps) {
  const taken = Math.max(0, Math.min(limit, limit - remaining));
  const percentage = limit > 0 ? Math.min(100, Math.max(0, (taken / limit) * 100)) : 0;
  const isLow = !isFull && remaining <= 20;

  const text = isFull
    ? `all ${limit} seats are taken`
    : isLow
      ? `only ${remaining} seat${remaining === 1 ? "" : "s"} left`
      : `${remaining} of ${limit} seats left`;

  return (
    <div
      className={`${styles.counter} ${align === "left" ? styles.left : ""} ${
        isFull ? styles.full : isLow ? styles.low : ""
      }`}
    >
      <span className={styles.text}>{text}</span>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={taken}
        aria-label={`${remaining} of ${limit} seats left`}
      >
        <span className={styles.fill} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
