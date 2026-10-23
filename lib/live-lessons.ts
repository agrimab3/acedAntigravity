// Live lesson data. The next lesson comes from server env (LIVE_LESSON_*),
// so the Zoom link never ships in source. Upcoming topics are a plain list.

export type UpcomingLesson = { date: string; section: "English" | "Math" | "Reading" | "Science" | "Special"; title: string };

export const UPCOMING_LESSONS: UpcomingLesson[] = [
  { date: "2026-11-08", section: "English", title: "Comma rules the ACT loves" },
  { date: "2026-11-15", section: "Math", title: "Solving linear equations" },
  { date: "2026-11-22", section: "Reading", title: "Main idea + inference" },
  { date: "2026-11-29", section: "Science", title: "Reading graphs without the passage" },
  { date: "2026-12-06", section: "Special", title: "Mock test debrief" },
];

export const SECTION_COLORS: Record<UpcomingLesson["section"], string> = {
  English: "#5DCAA5",
  Math: "#AFA9EC",
  Reading: "#EF9F27",
  Science: "#F0997B",
  Special: "#8EE0C4",
};

export function getNextLiveLesson() {
  const title = process.env.LIVE_LESSON_TITLE?.trim();
  const rawStart = "2026-11-01T17:00:00-08:00"; // set in code so a stale server setting can never win
  const zoomUrl = process.env.LIVE_LESSON_URL?.trim();
  const start = rawStart ? new Date(rawStart) : null;
  if (!title || !zoomUrl || !start || Number.isNaN(start.getTime())) return null;
  if (!/^https:\/\//.test(zoomUrl)) return null;
  if (start.getTime() + 60 * 60 * 1000 < Date.now()) return null;
  return { title, start, zoomUrl };
}

export function lessonCalendarUrl(title: string, start: Date, zoomUrl: string) {
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `Join the live Aced lesson on Zoom: ${zoomUrl}\n\nCameras and mics stay off. Answer questions in the chat!`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function lessonTiming(start: Date) {
  const now = Date.now();
  const ms = Math.max(0, start.getTime() - now);
  return {
    todayIso: new Date(now).toISOString().slice(0, 10),
    isLiveNow: now >= start.getTime() - 10 * 60 * 1000,
    countdown: [
      { n: Math.floor(ms / 86400000), unit: "days" },
      { n: Math.floor(ms / 3600000) % 24, unit: "hrs" },
      { n: Math.floor(ms / 60000) % 60, unit: "min" },
    ],
  };
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
