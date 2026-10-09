import ShootingStars from "./ShootingStars";
import styles from "./NightSky.module.css";

interface NightSkyProps {
  className?: string;
  showNebulae?: boolean;
  density?: "default" | "more";
  shootingZone?: "default" | "upper";
  calm?: boolean;
}

export default function NightSky({
  className,
  showNebulae = true,
  density = "default",
  shootingZone = "default",
  calm = false,
}: NightSkyProps) {
  return (
    <div
      className={styles.nightSky + " " + (calm ? styles.calm : "") + " " + (className ?? "")}
      aria-hidden="true"
    >
      <div className={styles.topGlow} />
      {showNebulae && (
        <>
          <div className={styles.nebulaTeal} />
          <div className={styles.nebulaLavender} />
        </>
      )}

      <div className={styles.starLayer + " " + styles.starsA} />
      <div className={styles.starLayer + " " + styles.starsB} />
      <div className={styles.starLayer + " " + styles.starsC} />
      {density === "more" ? <div className={styles.starLayer + " " + styles.starsD} /> : null}

      {!calm ? <ShootingStars avoidCenter={shootingZone === "upper"} /> : null}
    </div>
  );
}
