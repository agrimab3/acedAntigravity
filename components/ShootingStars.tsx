"use client";

import { useEffect, useRef } from "react";
import styles from "./ShootingStars.module.css";

type ShootingStarsProps = {
  avoidCenter?: boolean;
};

type Path = {
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  angle: number;
  distance: number;
  duration: number;
  length: number;
  teal: boolean;
};

const FIRST_DELAY_MIN = 8_000;
const FIRST_DELAY_MAX = 15_000;
const NEXT_DELAY_MIN = 25_000;
const NEXT_DELAY_MAX = 50_000;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pathCrossesCenter(path: Path, viewportWidth: number, viewportHeight: number) {
  const left = viewportWidth * 0.35;
  const right = viewportWidth * 0.65;
  const top = viewportHeight * 0.35;
  const bottom = viewportHeight * 0.65;

  for (let step = 0; step <= 24; step += 1) {
    const progress = step / 24;
    const x = path.startX + path.dx * progress;
    const y = path.startY + path.dy * progress;
    if (x >= left && x <= right && y >= top && y <= bottom) {
      return true;
    }
  }

  return false;
}

function makePath(avoidCenter: boolean): Path {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const mobile = viewportWidth < 640;

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const angle = randomBetween(20, 35);
    const distance = mobile ? randomBetween(300, 400) : randomBetween(500, 700);
    const radians = (angle * Math.PI) / 180;
    const path: Path = {
      startX: randomBetween(viewportWidth * 0.4, Math.max(viewportWidth * 0.4 + 1, viewportWidth - 24)),
      startY: randomBetween(24, Math.max(25, viewportHeight * 0.4)),
      dx: -Math.cos(radians) * distance,
      dy: Math.sin(radians) * distance,
      angle,
      distance,
      duration: randomBetween(900, 1200),
      length: randomBetween(140, 180),
      teal: Math.random() < 0.25,
    };

    if (!avoidCenter || !pathCrossesCenter(path, viewportWidth, viewportHeight)) {
      return path;
    }
  }

  const fallbackAngle = 24;
  const fallbackDistance = mobile ? 330 : 540;
  const radians = (fallbackAngle * Math.PI) / 180;
  return {
    startX: viewportWidth * 0.9,
    startY: Math.min(viewportHeight * 0.16, 120),
    dx: -Math.cos(radians) * fallbackDistance,
    dy: Math.sin(radians) * fallbackDistance,
    angle: fallbackAngle,
    distance: fallbackDistance,
    duration: 1050,
    length: 160,
    teal: false,
  };
}

export default function ShootingStars({ avoidCenter = false }: ShootingStarsProps) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) return;

    let disposed = false;
    let timerId: number | null = null;
    let timerStartedAt = 0;
    let remainingDelay = randomBetween(FIRST_DELAY_MIN, FIRST_DELAY_MAX);
    let activeAnimation: Animation | null = null;
    let activeStar: HTMLSpanElement | null = null;

    const clearTimer = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    };

    const removeActiveStar = () => {
      activeAnimation?.cancel();
      activeAnimation = null;
      activeStar?.remove();
      activeStar = null;
    };

    const schedule = (delay: number) => {
      if (disposed || document.visibilityState === "hidden" || mediaQuery.matches) return;
      clearTimer();
      remainingDelay = delay;
      timerStartedAt = performance.now();
      timerId = window.setTimeout(() => {
        timerId = null;
        remainingDelay = 0;
        launch();
      }, delay);
    };

    const launch = () => {
      if (disposed || document.visibilityState === "hidden" || mediaQuery.matches) return;

      const path = makePath(avoidCenter);
      const star = document.createElement("span");
      star.className = `${styles.star} ${path.teal ? styles.teal : styles.white}`;
      star.style.left = `${path.startX - path.length}px`;
      star.style.top = `${path.startY - 1}px`;
      star.style.width = `${path.length}px`;
      star.style.transform = `translate3d(0, 0, 0) rotate(${180 - path.angle}deg)`;
      layer.appendChild(star);
      activeStar = star;

      const animation = star.animate(
        [
          {
            opacity: 0,
            transform: `translate3d(0, 0, 0) rotate(${180 - path.angle}deg)`,
            offset: 0,
          },
          {
            opacity: 1,
            transform: `translate3d(${path.dx * 0.1}px, ${path.dy * 0.1}px, 0) rotate(${180 - path.angle}deg)`,
            offset: 0.1,
          },
          {
            opacity: 1,
            transform: `translate3d(${path.dx * 0.7}px, ${path.dy * 0.7}px, 0) rotate(${180 - path.angle}deg)`,
            offset: 0.7,
          },
          {
            opacity: 0,
            transform: `translate3d(${path.dx}px, ${path.dy}px, 0) rotate(${180 - path.angle}deg)`,
            offset: 1,
          },
        ],
        {
          duration: path.duration,
          easing: "ease-out",
          fill: "forwards",
        }
      );

      activeAnimation = animation;
      animation.onfinish = () => {
        if (activeAnimation === animation) activeAnimation = null;
        if (activeStar === star) activeStar = null;
        star.remove();
        if (!disposed) {
          schedule(randomBetween(NEXT_DELAY_MIN, NEXT_DELAY_MAX));
        }
      };
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (timerId !== null) {
          const elapsed = performance.now() - timerStartedAt;
          remainingDelay = Math.max(0, remainingDelay - elapsed);
          clearTimer();
        }
        activeAnimation?.pause();
        return;
      }

      activeAnimation?.play();
      if (!activeAnimation && timerId === null && !disposed) {
        schedule(remainingDelay > 0 ? remainingDelay : randomBetween(NEXT_DELAY_MIN, NEXT_DELAY_MAX));
      }
    };

    const onMotionPreferenceChange = () => {
      if (mediaQuery.matches) {
        clearTimer();
        removeActiveStar();
      } else if (!disposed && document.visibilityState === "visible" && timerId === null) {
        schedule(randomBetween(FIRST_DELAY_MIN, FIRST_DELAY_MAX));
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    mediaQuery.addEventListener("change", onMotionPreferenceChange);
    schedule(remainingDelay);

    return () => {
      disposed = true;
      clearTimer();
      removeActiveStar();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      mediaQuery.removeEventListener("change", onMotionPreferenceChange);
    };
  }, [avoidCenter]);

  return <div ref={layerRef} className={styles.layer} aria-hidden="true" />;
}
