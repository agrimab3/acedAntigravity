"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./finished.module.css";

function escapeIcs(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function compactUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export default function ScoreReleaseCalendar({
  releaseAt,
  timeZone,
  localReleaseTime,
  siteUrl,
}: {
  releaseAt: string;
  timeZone: string;
  localReleaseTime: string;
  siteUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const openGoogle = () => {
    const start = new Date(releaseAt);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const details =
      "ACED Mock Test scores unlock now. " +
      (siteUrl || window.location.origin) +
      "/mock-test/results";
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: "ACED Mock Test scores release",
      dates: compactUtc(start) + "/" + compactUtc(end),
      details,
      ctz: timeZone,
    });
    window.open(
      "https://calendar.google.com/calendar/render?" + params.toString(),
      "_blank",
      "noopener,noreferrer"
    );
    setOpen(false);
  };

  const downloadIcs = () => {
    const start = new Date(releaseAt);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const details =
      "ACED Mock Test scores unlock now. " +
      (siteUrl || window.location.origin) +
      "/mock-test/results";
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Aced//Mock Test Scores//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:aced-mock-results-" + start.getTime() + "@aced",
      "DTSTART:" + compactUtc(start),
      "DTEND:" + compactUtc(end),
      "SUMMARY:ACED Mock Test scores release",
      "DESCRIPTION:" + escapeIcs(details),
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      "DESCRIPTION:ACED Mock Test scores release soon",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aced-mock-test-score-release.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <div className={styles.calendarWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.primaryButton}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        remind me Sunday ✦
      </button>
      {open ? (
        <div className={styles.calendarMenu} role="menu" aria-label="Score release calendar options">
          <button type="button" role="menuitem" onClick={openGoogle}>
            Google Calendar
          </button>
          <button type="button" role="menuitem" onClick={downloadIcs}>
            Apple / Outlook (.ics)
          </button>
          <span>release: {localReleaseTime}</span>
        </div>
      ) : null}
    </div>
  );
}
