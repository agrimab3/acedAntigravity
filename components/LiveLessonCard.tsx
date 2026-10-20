function AstraIcon() {
  return <svg viewBox="0 0 200 264" role="img" aria-label="Astra astronaut"><ellipse cx="100" cy="250" rx="60" ry="8" fill="#000" opacity=".35"/><rect x="48" y="132" width="104" height="92" rx="26" fill="#C9D2E0"/><rect x="48" y="136" width="104" height="100" rx="30" fill="#F2F5FA"/><rect x="52" y="186" width="96" height="12" fill="#5DCAA5"/><circle cx="100" cy="82" r="66" fill="#F4F6FA" stroke="#5DCAA5" strokeWidth="5"/><ellipse cx="100" cy="88" rx="50" ry="41" fill="#0A1120"/><ellipse cx="83" cy="86" rx="6" ry="7" fill="#F4F8FF"/><ellipse cx="117" cy="86" rx="6" ry="7" fill="#F4F8FF"/><ellipse cx="100" cy="106" rx="8" ry="2" fill="#FF9EA8"/><rect x="62" y="228" width="30" height="26" rx="10" fill="#E9EEF5"/><rect x="108" y="228" width="30" height="26" rx="10" fill="#E9EEF5"/></svg>;
}

function calendarUrl(title: string, start: Date, zoomUrl: string) {
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

export default function LiveLessonCard() {
  const title = process.env.LIVE_LESSON_TITLE?.trim();
  const rawStart = process.env.LIVE_LESSON_START?.trim();
  const zoomUrl = process.env.LIVE_LESSON_URL?.trim();
  const start = rawStart ? new Date(rawStart) : null;
  if (!title || !zoomUrl || !start || Number.isNaN(start.getTime()) || start.getTime() + 60 * 60 * 1000 < Date.now()) return null;
  try { if (!/^https:\/\//.test(zoomUrl)) return null; } catch { return null; }
  const date = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Los_Angeles" }).format(start);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "America/Los_Angeles" }).format(start).replace(" ", " ");
  return <section aria-label="Live lesson" style={{ position: "relative", overflow: "hidden", maxWidth: 990, margin: "32px auto 20px", padding: "28px 190px 28px 32px", borderRadius: 28, border: "1px solid rgba(93,202,165,.5)", background: "linear-gradient(110deg,rgba(14,42,52,.96),rgba(12,27,47,.96))", boxShadow: "0 0 48px rgba(93,202,165,.12)" }}>
    <div style={{ color: "#5DCAA5", fontSize: 12, fontWeight: 800, letterSpacing: ".12em" }}>✦ LIVE LESSON · FREE FOR ACED STUDENTS</div>
    <h2 style={{ fontFamily: "Playfair Display,serif", fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.08, margin: "12px 0", color: "#fff" }}>{title}</h2>
    <p style={{ color: "rgba(255,255,255,.76)", margin: "0 0 18px", fontSize: 16 }}>{date} · {time} PT · with Astra, our AI tutor</p>
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <a href={zoomUrl} target="_blank" rel="noreferrer" style={{ background: "#5DCAA5", color: "#062018", padding: "12px 18px", borderRadius: 999, fontWeight: 800, textDecoration: "none" }}>Join on Zoom</a>
      <a href={calendarUrl(title, start, zoomUrl)} target="_blank" rel="noreferrer" style={{ color: "#aeeedb", fontWeight: 700 }}>Add to Google Calendar</a>
    </div>
    <p style={{ margin: "18px 0 0", color: "rgba(255,255,255,.55)", fontSize: 13 }}>Cameras and mics stay off. Answer questions in the chat!</p>
    <div aria-hidden="true" style={{ position: "absolute", right: 18, bottom: -62, width: 170, filter: "drop-shadow(0 8px 15px rgba(0,0,0,.35))" }}><AstraIcon /></div>
  </section>;
}
