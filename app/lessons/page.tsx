import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getNextLiveLesson, lessonCalendarUrl, lessonTiming, SECTION_COLORS, todayIsoDate, UPCOMING_LESSONS } from "@/lib/live-lessons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live lessons · Aced" };

const serif = "var(--font-playfair), Playfair Display, serif";
const card: React.CSSProperties = { background: "rgba(14,22,38,.82)", border: "1px solid #1F2B3D", borderRadius: 22 };
const pt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...options, timeZone: "America/Los_Angeles" });

function Astronaut({ color, label }: { color: string; label: string }) {
  return <svg viewBox="0 0 200 264" style={{ width: "100%", height: "100%" }} role="img" aria-label={label}>
    <ellipse cx="100" cy="252" rx="58" ry="7" fill="#000" opacity=".18" />
    <rect x="48" y="132" width="104" height="92" rx="26" fill="#C9D2E0" />
    <rect x="22" y="146" width="34" height="64" rx="17" fill="#E9EEF5" /><circle cx="39" cy="210" r="13" fill={color} />
    <g transform="rotate(-28 161 150)"><rect x="144" y="146" width="34" height="64" rx="17" fill="#E9EEF5" /><circle cx="161" cy="210" r="13" fill={color} /></g>
    <rect x="52" y="136" width="96" height="100" rx="30" fill="#F2F5FA" /><rect x="52" y="186" width="96" height="12" fill={color} opacity=".9" />
    <rect x="78" y="150" width="44" height="26" rx="8" fill="#DCE3EE" /><text x="100" y="169" textAnchor="middle" fontSize="16" fill={color}>✦</text>
    <rect x="62" y="228" width="30" height="26" rx="10" fill="#E9EEF5" /><rect x="108" y="228" width="30" height="26" rx="10" fill="#E9EEF5" />
    <line x1="100" y1="22" x2="100" y2="4" stroke="#C9D2E0" strokeWidth="4" /><circle cx="100" cy="4" r="7" fill={color} />
    <circle cx="100" cy="82" r="66" fill="#F4F6FA" stroke={color} strokeWidth="5" /><ellipse cx="100" cy="88" rx="50" ry="41" fill="#0D1B2E" />
    <ellipse cx="80" cy="64" rx="15" ry="7" fill="#fff" opacity=".18" transform="rotate(-25 80 64)" />
    <ellipse cx="83" cy="86" rx="6" ry="7" fill="#F4F8FF" /><ellipse cx="117" cy="86" rx="6" ry="7" fill="#F4F8FF" />
    <circle cx="72" cy="100" r="5" fill="#F0997B" opacity=".45" /><circle cx="128" cy="100" r="5" fill="#F0997B" opacity=".45" />
    <ellipse cx="100" cy="106" rx="9" ry="4" fill="#FF9EA8" />
  </svg>;
}

export default async function LessonsPage() {
  const session = await getAuthSession();
  if (!session?.user) redirect("/");

  const next = getNextLiveLesson();
  const nextKey = next ? pt({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(next.start) : null;
  const nextIso = nextKey ? `${nextKey.find((p) => p.type === "year")?.value}-${nextKey.find((p) => p.type === "month")?.value}-${nextKey.find((p) => p.type === "day")?.value}` : "";
  const todayIso = todayIsoDate();
  const upcoming = UPCOMING_LESSONS.filter((l) => l.date > (nextIso || todayIso)).slice(0, 5);

  const timing = next ? lessonTiming(next.start) : null;
  const countdown = timing?.countdown ?? [];
  const isLiveNow = timing?.isLiveNow ?? false;

  return <main style={{ position: "relative", minHeight: "100vh", overflow: "hidden", fontFamily: "DM Sans, sans-serif", color: "#EEF1F5", background: "radial-gradient(900px 520px at 50% -10%,#16304A 0%,transparent 70%),radial-gradient(700px 500px at 100% 60%,#1A1838 0%,transparent 70%),#070B14" }}>
    <style>{`.ll-stars{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(1.4px 1.4px at 8% 14%,#fff 50%,transparent 51%),radial-gradient(1px 1px at 22% 40%,#fff 50%,transparent 51%),radial-gradient(1.6px 1.6px at 41% 9%,#fff 50%,transparent 51%),radial-gradient(1px 1px at 63% 33%,#fff 50%,transparent 51%),radial-gradient(1.8px 1.8px at 79% 18%,#AFA9EC 50%,transparent 51%),radial-gradient(1px 1px at 92% 52%,#fff 50%,transparent 51%),radial-gradient(1.4px 1.4px at 12% 78%,#5DCAA5 50%,transparent 51%),radial-gradient(1px 1px at 48% 66%,#fff 50%,transparent 51%);opacity:.7}
@keyframes ll-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}.ll-float{animation:ll-float 6s ease-in-out infinite}
.ll-nav a{color:#C9CFD8;text-decoration:none;font-size:15px}
@media (prefers-reduced-motion: reduce){.ll-float{animation:none}}
@media (max-width:640px){.ll-h1{font-size:40px!important}.ll-hero-art{display:none!important}}`}</style>
    <div className="ll-stars" aria-hidden="true" />

    <header style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "24px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <Link href="/dashboard" style={{ fontFamily: serif, fontWeight: 700, fontSize: 28, color: "#fff", textDecoration: "none" }}>Aced<span style={{ color: "#5DCAA5" }}>.</span></Link>
      <nav className="ll-nav" style={{ display: "flex", gap: 26, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/dashboard">your universe</Link><Link href="/practice-tests">practice tests</Link><Link href="/progress">progress</Link>
        <span data-tour-nav="live-lessons" style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>live lessons</span><Link href="/mock-test" data-tour-nav="mock-test">mock test</Link>
      </nav>
    </header>

    <section style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "40px 24px 0", display: "flex", flexWrap: "wrap", gap: 30, alignItems: "center" }}>
      <div style={{ flex: "1 1 520px", display: "flex", flexDirection: "column", gap: 16 }}>
        <span style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: "#CFEFE3", background: "#10261F", border: "1px solid #2A5547", padding: "7px 14px", borderRadius: 999 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F0997B", boxShadow: "0 0 10px #F0997B" }} />LIVE EVERY SUNDAY · 5 PM PT</span>
        <h1 className="ll-h1" style={{ margin: 0, fontFamily: serif, fontSize: 58, lineHeight: 1.05 }}>Astra&apos;s <em style={{ color: "#5DCAA5" }}>Live Lessons</em></h1>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6, color: "#B4BCC8", maxWidth: 520 }}>Short ACT lessons taught by Astra, Aced&apos;s AI tutor. Answer practice questions in the chat and ask anything. Free for Aced students.</p>
      </div>
      <div className="ll-float ll-hero-art" style={{ flex: "0 0 320px", height: 250, position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 190, height: 250 }}><Astronaut color="#5DCAA5" label="Astra, the AI tutor" /></div>
        <div style={{ position: "absolute", right: 0, top: 44, width: 150, height: 200 }}><Astronaut color="#AFA9EC" label="Cosmo" /></div>
        <span style={{ position: "absolute", left: 30, bottom: -14, fontSize: 12, color: "#5DCAA5" }}>Astra · AI tutor</span>
        <span style={{ position: "absolute", right: 40, bottom: -14, fontSize: 12, color: "#AFA9EC" }}>Cosmo</span>
      </div>
    </section>

    <section data-tour-target="live-lessons-page" style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "44px 24px 0" }}>
      {next ? <div style={{ ...card, padding: "30px 32px", display: "flex", flexWrap: "wrap", gap: "24px 40px", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(110deg,rgba(16,38,31,.8),rgba(26,24,48,.8))", borderColor: "#2A4A55" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 260, flex: "1 1 320px" }}>
          <span style={{ fontSize: 13, letterSpacing: ".14em", color: "#8EE0C4", fontWeight: 700 }}>{isLiveNow ? "● HAPPENING NOW" : "NEXT LIVE LESSON"}</span>
          <b style={{ fontFamily: serif, fontSize: 32, lineHeight: 1.15 }}>{next.title}</b>
          <span style={{ fontSize: 15, color: "#A9B2BF" }}>{pt({ weekday: "long", month: "short", day: "numeric" }).format(next.start)} · {pt({ hour: "numeric", minute: "2-digit" }).format(next.start)} PT · on Zoom</span>
        </div>
        {!isLiveNow ? <div style={{ display: "flex", gap: 18, alignItems: "center" }} aria-label="Time until the lesson">{countdown.map((c) => <div key={c.unit} style={{ textAlign: "center" }}><div style={{ fontFamily: serif, fontSize: 40, lineHeight: 1 }}>{c.n}</div><div style={{ fontSize: 12, color: "#8D97A6" }}>{c.unit}</div></div>)}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          <a href={next.zoomUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: 16, padding: "14px 26px", borderRadius: 999, background: "#5DCAA5", color: "#072019", textDecoration: "none" }}>Join on Zoom ✦</a>
          <a href={lessonCalendarUrl(next.title, next.start, next.zoomUrl)} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: "#AFA9EC" }}>add to Google Calendar →</a>
        </div>
      </div> : <div style={{ ...card, padding: "26px 30px", color: "#B4BCC8" }}>The next lesson will show up here soon. Lessons are every Sunday at 5 PM PT.</div>}
    </section>

    <section style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "28px 24px 0", display: "flex", flexWrap: "wrap", gap: 24 }}>
      <div style={{ ...card, flex: "1 1 440px", padding: "24px 26px" }}>
        <b style={{ fontSize: 18 }}>Coming up</b>
        <div style={{ marginTop: 10 }}>
          {upcoming.map((l) => {
            const d = new Date(`${l.date}T12:00:00-08:00`);
            const c = SECTION_COLORS[l.section];
            return <div key={l.date} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderTop: "1px solid #1F2B3D", flexWrap: "wrap" }}>
              <span style={{ width: 62, fontSize: 14, color: "#8D97A6" }}>Sun<br /><b style={{ color: "#EEF1F5", fontSize: 16 }}>{pt({ month: "short", day: "numeric" }).format(d)}</b></span>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", padding: "5px 10px", borderRadius: 999, color: c, background: `${c}1f`, minWidth: 70, textAlign: "center" }}>{l.section}</span>
              <span style={{ flex: 1, fontSize: 16, minWidth: 160 }}>{l.title}</span>
              <span style={{ fontSize: 13, color: "#8D97A6" }}>5 PM PT</span>
            </div>;
          })}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#6F7A8A" }}>Topics may change. Same Zoom link every week.</p>
      </div>
      <div style={{ ...card, flex: "1 1 300px", padding: "24px 26px", display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ fontSize: 18 }}>How it works</b>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "#B4BCC8" }}>
          <li>Add the lesson to your calendar.</li>
          <li>Join on Zoom Sunday at 5 PM PT. Cameras and mics stay off.</li>
          <li>Answer practice questions in the chat before Astra reveals them.</li>
          <li>Practice the skill on your star map afterward.</li>
        </ol>
        <span style={{ fontSize: 13, color: "#8D97A6" }}>Astra is an AI tutor, not a real person.</span>
      </div>
    </section>

    <section style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "40px 24px 80px" }}>
      <b style={{ fontFamily: serif, fontSize: 30 }}>Replays</b>
      <div style={{ ...card, marginTop: 16, padding: "34px 30px", textAlign: "center", color: "#B4BCC8" }}>
        <div style={{ fontSize: 28, color: "#5DCAA5" }}>✦</div>
        <div style={{ fontSize: 17, marginTop: 6 }}>Replays will show up here after each lesson.</div>
        <div style={{ fontSize: 14, color: "#8D97A6", marginTop: 4 }}>The first one airs Sunday, Oct 25.</div>
      </div>
    </section>
  </main>;
}
