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
  return <section aria-label="Live lesson" className="dashboard-live-tile" style={{ position: "relative", overflow: "hidden", width: 340, height: 174, padding: "18px 64px 16px 20px", borderRadius: 20, border: "1px solid rgba(93,202,165,.38)", background: "linear-gradient(135deg,rgba(13,32,43,.96),rgba(10,17,31,.98))", boxShadow: "0 14px 35px rgba(0,0,0,.25)", color: "#fff" }}>
    <div style={{ color: "#5DCAA5", fontSize: 11, fontWeight: 800, letterSpacing: ".1em", whiteSpace: "nowrap" }}>✦ LIVE · {date.toUpperCase()} {time} PT</div>
    <h2 title={title} style={{ fontFamily: "Playfair Display,serif", fontSize: 20, lineHeight: 1.15, margin: "9px 0 6px", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title.replace(" + 3 Quick Wins", "")}</h2>
    <p style={{ color: "rgba(255,255,255,.65)", margin: "0 0 13px", fontSize: 13, whiteSpace: "nowrap" }}>with Astra, our AI tutor</p>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <a href={zoomUrl} target="_blank" rel="noreferrer" style={{ background: "#5DCAA5", color: "#062018", padding: "8px 13px", borderRadius: 999, fontSize: 12, fontWeight: 800, textDecoration: "none" }}>Join</a>
      <a href={calendarUrl(title, start, zoomUrl)} target="_blank" rel="noreferrer" style={{ color: "#aeeedb", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>Add to calendar</a>
    </div>
    <div aria-hidden="true" style={{ position: "absolute", right: 12, top: 12, width: 48, filter: "drop-shadow(0 5px 8px rgba(0,0,0,.35))" }}><AstraIcon /></div>
  </section>;
}
