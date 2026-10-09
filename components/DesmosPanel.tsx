"use client";

import { useEffect, useRef, type RefObject } from "react";
import DesmosCalculator from "@/components/DesmosCalculator";
import styles from "./DesmosPanel.module.css";

export default function DesmosPanel({
  id,
  isOpen,
  onClose,
  storageKey,
  returnFocusRef,
  variant = "mock",
}: {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  storageKey: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  variant?: "mock" | "practice";
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const close = () => {
    onClose();
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  };

  return (
    <aside
      ref={panelRef}
      id={id}
      className={
        styles.panel +
        " " +
        (variant === "mock" ? styles.mockPanel : styles.practicePanel)
      }
      data-open={isOpen ? "true" : "false"}
      data-desmos-panel
      aria-hidden={!isOpen}
      aria-label="Desmos graphing calculator"
      tabIndex={-1}
    >
      <div className={styles.dragHandle} aria-hidden="true" />
      <header className={styles.header}>
        <div>
          <div className={styles.title}>calculator</div>
          <div className={styles.credit}>powered by Desmos</div>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={close}
          aria-label="Close calculator"
          tabIndex={isOpen ? 0 : -1}
        >
          ×
        </button>
      </header>

      <div className={styles.calculatorBody}>
        <DesmosCalculator
          isOpen={isOpen}
          storageKey={storageKey}
          fillContainer
          autoFocus
        />
      </div>
    </aside>
  );
}
