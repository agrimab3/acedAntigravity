"use client";

import { useEffect, useRef, useState } from "react";
import { NEXT_MOCK } from "@/lib/mockTests";
import styles from "./confirmed.module.css";

type AddToCalendarProps = {
  timeZone: string;
  shortZone: string;
  localReleaseTime: string;
  siteUrl: string;
};

function compactDate(date: string) {
  return date.replaceAll("-", "");
}

function getCutoffHour() {
  const [hourText, period] = NEXT_MOCK.startCutoffLabel.split(" ");
  const hour = Number(hourText);
  if (period === "PM" && hour !== 12) return hour + 12;
  if (period === "AM" && hour === 12) return 0;
  return hour;
}

function escapeIcs(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function getCalendarDetails(localReleaseTime: string, siteUrl: string) {
  const origin = siteUrl || window.location.origin;
  return `Full practice ACT. Start by ${NEXT_MOCK.startCutoffLabel} your time. Scores come out Sunday at ${localReleaseTime}. ${origin}/mock-test`;
}

export default function AddToCalendar({
  timeZone,
  shortZone,
  localReleaseTime,
  siteUrl,
}: AddToCalendarProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const openGoogleCalendar = () => {
    const day = compactDate(NEXT_MOCK.testDate);
    const cutoff = String(getCutoffHour()).padStart(2, "0");
    const details = getCalendarDetails(localReleaseTime, siteUrl);
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: "ACED Mock Test",
      dates: `${day}T000000/${day}T${cutoff}0000`,
      details,
      ctz: timeZone,
    });
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  const downloadIcs = () => {
    const day = compactDate(NEXT_MOCK.testDate);
    const cutoff = String(getCutoffHour()).padStart(2, "0");
    const details = getCalendarDetails(localReleaseTime, siteUrl);
    const uid = `aced-mock-test-${NEXT_MOCK.mockTestSlug}@aced`;
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Aced//Mock Test//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART;TZID=${timeZone}:${day}T000000`,
      `DTEND;TZID=${timeZone}:${day}T${cutoff}0000`,
      "SUMMARY:ACED Mock Test",
      `DESCRIPTION:${escapeIcs(details)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT12H",
      "ACTION:DISPLAY",
      "DESCRIPTION:ACED Mock Test reminder",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateForName = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    })
      .format(new Date(`${NEXT_MOCK.testDate}T12:00:00Z`))
      .toLowerCase()
      .replace(" ", "-");
    link.href = url;
    link.download = `aced-mock-test-${dateForName}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <div className={styles.calendarWrap} ref={wrapperRef}>
      <button
        type="button"
        className={styles.calendarButton}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        add to my calendar ✦
      </button>

      {open ? (
        <div className={styles.calendarMenu} role="menu" aria-label="Add mock test to calendar">
          <button type="button" role="menuitem" onClick={openGoogleCalendar}>
            Google Calendar
          </button>
          <button type="button" role="menuitem" onClick={downloadIcs}>
            Apple / Outlook (.ics)
          </button>
          <span className={styles.zoneNote}>times saved in {shortZone}</span>
        </div>
      ) : null}
    </div>
  );
}
