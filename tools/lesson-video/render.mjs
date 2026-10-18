import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import { parseLesson, selectPart } from "./lib.mjs";
import { astraSvg, cosmoSvg } from "./characters.mjs";

const root = resolve("tools/lesson-video");
const python = resolve(root, ".venv/bin/python");
const chrome = process.env.LESSON_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const fps = Number(process.env.LESSON_FPS || 12);
const args = process.argv.slice(2);
const input = args.find((value) => !value.startsWith("--"));
const partFlag = args.indexOf("--part");
const durationFlag = args.indexOf("--duration");
const requestedPart = partFlag >= 0 ? args[partFlag + 1] : undefined;
const requestedDuration = durationFlag >= 0 ? Number(args[durationFlag + 1]) : undefined;
const astraVoice = process.env.LESSON_ASTRA_VOICE || "af_heart";
const cosmoVoice = process.env.LESSON_COSMO_VOICE || "bm_fable";
if (!input) throw new Error("Usage: npm run lesson -- docs/lesson-1-script.md [--part 'Part 5'] [--duration 60]");

function run(command, commandArgs, options = {}) {
  const child = spawnSync(command, commandArgs, { stdio: "inherit", ...options });
  if (child.status !== 0) throw new Error(`${command} failed`);
}
function duration(file) {
  const child = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], { encoding: "utf8" });
  if (child.status !== 0) throw new Error("ffprobe failed");
  return Number(child.stdout.trim());
}
function esc(value) { return JSON.stringify(value).replace(/</g, "\\u003c"); }

const parts = selectPart(await parseLesson(resolve(input)), requestedPart);
const work = resolve(root, "work", `${Date.now()}-${basename(input, ".md")}`);
const outDir = resolve(root, "output");
await mkdir(work, { recursive: true });
await mkdir(outDir, { recursive: true });
const timeline = [];
let board = [];
let speech = 0;
for (const part of parts) {
  for (const event of part.events) {
    if (event.type === "board") { board = [...board, event.text]; timeline.push({ ...event, board: [...board] }); continue; }
    if (event.type === "chat") { timeline.push({ ...event, board: [...board] }); continue; }
    const wav = resolve(work, `speech-${speech++}.wav`);
    const voice = event.speaker === "cosmo" ? cosmoVoice : astraVoice;
    timeline.push({ ...event, audio: wav, voice, board: [...board] });
  }
}
const speechJobs = timeline.filter((event) => event.type === "say").map(({ text, voice, audio }) => ({ text, voice, output: audio }));
const manifest = resolve(work, "narration-jobs.json");
await writeFile(manifest, JSON.stringify(speechJobs));
if (speechJobs.length) run(python, [resolve(root, "tts.py"), "--manifest", manifest, "--output", resolve(work, "unused.wav")]);
let cursor = 0;
for (const event of timeline) {
  event.at = cursor;
  if (event.type === "say") { event.seconds = duration(event.audio); cursor += event.seconds + 0.35; }
  if (event.type === "chat") cursor += event.seconds;
}
const total = requestedDuration ? Math.max(requestedDuration, cursor) : cursor + 1;
const title = requestedPart ? requestedPart.replace(/^part\s+/i, "Part ") : parts.at(-1)?.title || "Aced lesson";
const data = { title, timeline, total, fps };
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,600&display=swap" rel="stylesheet"><style>
*{box-sizing:border-box}body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#fdfcfa;color:#162b34;font-family:'DM Sans',sans-serif}.studio{height:100%;padding:64px 82px;background:radial-gradient(ellipse 58% 48% at 12% 0%,#77d9c244,transparent 68%),radial-gradient(ellipse 52% 45% at 88% 0%,#afa9ec42,transparent 68%),linear-gradient(180deg,#fdfcfa 0%,#f8fbfa 100%);position:relative}.top{display:flex;justify-content:space-between;align-items:center}.brand{font:600 40px 'Playfair Display',serif;letter-spacing:-1.5px}.brand b{color:#1d9e75}.label{border:1px solid #1d9e7566;border-radius:999px;padding:11px 18px;color:#16735b;background:#effaf6;font-weight:700;font-size:20px}.lesson{margin-top:58px;font:600 62px/1.05 'Playfair Display',serif;letter-spacing:-2px;max-width:1050px}.lesson i{color:#6e68b5}.board{position:absolute;left:82px;top:265px;width:1135px;min-height:615px;border-radius:32px;border:1px solid #d9e4e1;background:#fffdfbd9;box-shadow:0 26px 80px #17333b18;padding:58px 64px;overflow:hidden}.board:before{content:'';position:absolute;width:530px;height:110px;top:110px;left:62px;background:#ffe87c99;transform:rotate(-2deg);border-radius:50%;z-index:0}.boardTitle{position:relative;font:700 29px Caveat,cursive;color:#438170;margin-bottom:42px}.boardItem{position:relative;background:#fff;border:1px solid #d7e5e1;border-radius:18px;padding:24px 30px;margin:17px 0;font-size:31px;font-weight:600;box-shadow:0 8px 22px #17333b0b;opacity:0;transform:translateY(22px);transition:opacity .55s ease,transform .55s ease}.boardItem.visible{opacity:1;transform:none}.boardItem:before{content:'✦';color:#1d9e75;margin-right:15px}.sticky{position:absolute;right:748px;top:245px;width:390px;min-height:225px;padding:34px;background:#fff0a9;box-shadow:0 18px 35px #765f2025;transform:rotate(3deg);font:700 33px/1.15 Caveat,cursive;color:#554b23}.slot{position:absolute;right:82px;top:182px;width:525px;height:665px;border-radius:32px;overflow:hidden;background:radial-gradient(440px 300px at 50% 12%,#1b3a5a,#0b1220 76%);box-shadow:0 24px 64px #11182735}.slot:before{content:'';position:absolute;inset:0;background-image:radial-gradient(2px 2px at 20% 18%,#fff 50%,transparent 51%),radial-gradient(1.5px 1.5px at 72% 12%,#fff 50%,transparent 51%),radial-gradient(2px 2px at 86% 46%,#afa9ec 50%,transparent 51%),radial-gradient(1.5px 1.5px at 12% 62%,#fff 50%,transparent 51%),radial-gradient(2px 2px at 55% 78%,#5dcaa5 50%,transparent 51%)}.speaker{position:absolute;inset:0;opacity:0;transform:translateX(120%);transition:opacity .45s ease,transform .45s ease;pointer-events:none}.speaker.active{opacity:1;transform:translateX(0)}.speaker.exit-left{opacity:0;transform:translateX(-120%)}.speaker .astronaut{position:absolute;left:50%;bottom:42px;width:420px;height:554px;transform:translateX(-50%);filter:drop-shadow(0 20px 16px #0006);animation:float 4s ease-in-out infinite}.speaker.cosmo .astronaut{width:360px;height:475px;bottom:68px}.astronaut g[id$='EL'],.astronaut g[id$='ER']{transform-origin:center;animation:blink 5s steps(1,end) infinite}.speaker.talking .astronaut g[id$='M']{transform-origin:center;animation:talk .28s ease-in-out infinite alternate}.speaker.talking .astronaut g[id$='ArmR']{transform-origin:155px 160px;animation:wave .9s ease-in-out infinite alternate}.name{position:absolute;left:24px;bottom:22px;color:#fff;border:1px solid #ffffff2a;border-radius:999px;background:#ffffff1f;padding:9px 15px;font-weight:700;font-size:18px;z-index:2}.caption{position:absolute;left:154px;right:154px;bottom:61px;border-radius:26px;padding:22px 34px;background:#102a32e8;color:#fff;font-size:31px;line-height:1.28;text-align:center;box-shadow:0 12px 28px #0b212433}.chat{position:absolute;left:50%;top:51%;transform:translate(-50%,-50%);padding:28px 45px;border-radius:25px;background:#fff7c9f0;box-shadow:0 15px 40px #3d3b1722;text-align:center;color:#4e4722;font:700 34px Caveat,cursive;display:none}.chat span{display:block;font:700 82px 'DM Sans',sans-serif;color:#1d9e75}.chat.show{display:block}.dots{position:absolute;right:590px;top:136px;color:#1d9e75;letter-spacing:9px;font-size:22px}@keyframes float{50%{transform:translate(-50%,-14px)}}@keyframes blink{0%,92%,100%{transform:scaleY(1)}94%,96%{transform:scaleY(.08)}}@keyframes talk{to{transform:scaleY(2.1)}}@keyframes wave{to{transform:rotate(-14deg)}}</style></head><body><main class="studio"><header class="top"><div class="brand">Aced<b>.</b></div><div class="label">✦ Astra · AI tutor</div></header><div class="dots">✦ · ✦ · ✦</div><h1 class="lesson">${title.includes("Part") ? title : `Part <i>${title}</i>`}</h1><section class="board"><div class="boardTitle">let’s make this click</div><div id="items"></div></section><aside class="sticky">small steps, big score energy ✦</aside><section class="slot"><div id="astraSpeaker" class="speaker astra">${astraSvg()}</div><div id="cosmoSpeaker" class="speaker cosmo">${cosmoSvg()}</div><span id="speakerName" class="name">✦ Astra · AI tutor</span></section><div id="chat" class="chat">answer in the chat!<br><span>10</span></div><footer id="caption" class="caption">Welcome to Aced.</footer></main><script>const data=${esc(data)};let prior='astra';window.render=(t)=>{const says=data.timeline.filter(e=>e.type==='say');const active=says.find(e=>t>=e.at&&t<e.at+e.seconds)||says.filter(e=>e.at<=t).at(-1);const speaker=active?.speaker||prior;const astra=document.querySelector('#astraSpeaker'),cosmo=document.querySelector('#cosmoSpeaker');for(const el of [astra,cosmo])el.classList.remove('active','exit-left','talking');const current=speaker==='cosmo'?cosmo:astra;const leaving=speaker==='cosmo'?astra:cosmo;current.classList.add('active');if(active)current.classList.add('talking');if(prior!==speaker)leaving.classList.add('exit-left');prior=speaker;document.querySelector('#speakerName').textContent=speaker==='cosmo'?'✦ Cosmo · student':'✦ Astra · AI tutor';const visible=(active?.board||data.timeline.filter(e=>e.type==='board'&&e.at<=t).at(-1)?.board||[]);document.querySelector('#items').innerHTML=visible.map((item,i)=>'<div class="boardItem visible" style="transition-delay:'+i*.12+'s">'+item+'</div>').join('');document.querySelector('#caption').textContent=active?.text||'Take a breath. You’ve got this.';const chat=data.timeline.find(e=>e.type==='chat'&&t>=e.at&&t<e.at+e.seconds);const box=document.querySelector('#chat');box.classList.toggle('show',Boolean(chat));if(chat)box.querySelector('span').textContent=Math.max(0,Math.ceil(chat.at+chat.seconds-t));};window.render(0);</script></body></html>`;
await writeFile(resolve(work, "frame.html"), html);
const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ["--font-render-hinting=medium"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
const boardTimes = timeline.filter((event) => event.type === "board").map((event) => event.at);
const boardEvents = timeline.filter((event) => event.type === "board").map(({ at, text }) => ({ at, text }));
const speechWindows = timeline.filter((event) => event.type === "say").map(({ at, seconds }) => ({ at, seconds }));
for (let frame = 0; frame < Math.ceil(total * fps); frame++) {
  await page.evaluate(({ seconds, boardAt, boards, speech }) => {
    window.render(seconds);
    const isSpeaking = speech.some((event) => seconds >= event.at && seconds < event.at + event.seconds);
    document.querySelectorAll(".speaker").forEach((element) => element.classList.toggle("talking", isSpeaking && element.classList.contains("active")));
    const visibleBoards = boards.filter((event) => event.at <= seconds);
    const latestBoard = visibleBoards.at(-1);
    const board = document.querySelector("#items");
    if (latestBoard?.text.includes("3x + 5 = 20") && latestBoard.text.includes("A 3")) {
      board.innerHTML = `<section style="position:relative;opacity:1;transform:none"><div style="font:700 59px 'Playfair Display',serif;text-align:center;margin:10px 0 34px">3x + 5 = 20</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:15px">${[["A", "3"], ["B", "5"], ["C", "8"], ["D", "15"]].map(([letter, value]) => `<div style="border:2px solid #d7e5e1;border-radius:15px;padding:17px 24px;background:#fff;font-size:28px"><b style="color:#5dCAA5;margin-right:18px">${letter}</b>${value}</div>`).join("")}</div></section>`;
    }
    document.querySelectorAll(".boardItem").forEach((item, index) => {
      const progress = Math.max(0, Math.min(1, (seconds - boardAt[index] - index * 0.12) / 0.55));
      item.style.opacity = String(progress);
      item.style.transform = `translateY(${(1 - progress) * 22}px)`;
    });
    const speaker = document.querySelector(".speaker.active .astronaut");
    if (speaker) {
      speaker.style.transform = `translateX(-50%) translateY(${Math.sin(seconds * 1.57) * 12}px)`;
      const mouth = speaker.querySelector("ellipse[id$='M']");
      if (mouth) mouth.setAttribute("ry", String(isSpeaking ? 1.2 + Math.abs(Math.sin(seconds * 19)) * 1.5 : 2));
      const arm = speaker.querySelector("g[id$='ArmR']");
      if (arm) arm.style.transform = `rotate(${isSpeaking ? Math.sin(seconds * 7) * 12 : 0}deg)`;
    }
    const chat = data.timeline.find((event) => event.type === "chat" && seconds >= event.at && seconds < event.at + event.seconds);
    if (chat) {
      document.querySelector("#caption").textContent = "Your turn — answer in the chat.";
      const chatBox = document.querySelector("#chat");
      chatBox.style.left = "auto";
      chatBox.style.right = "112px";
      chatBox.style.top = "650px";
      chatBox.style.transform = "none";
      chatBox.style.padding = "18px 27px";
      chatBox.style.fontSize = "25px";
    }
  }, { seconds: frame / fps, boardAt: boardTimes, boards: boardEvents, speech: speechWindows });
  await page.screenshot({ path: resolve(work, `frame-${String(frame).padStart(5, "0")}.jpg`), type: "jpeg", quality: 88 });
}
await browser.close();
const speechEvents = timeline.filter((event) => event.type === "say");
const audioArgs = ["-f", "lavfi", "-t", String(total), "-i", "anullsrc=r=24000:cl=stereo"];
for (const event of speechEvents) audioArgs.push("-i", event.audio);
const chains = speechEvents.map((event, index) => `[${index + 1}:a]adelay=${Math.round(event.at * 1000)}|${Math.round(event.at * 1000)}[a${index}]`);
const mix = speechEvents.map((_, index) => `[a${index}]`).join("");
const filter = `${chains.join(";")};[0:a]${mix}amix=inputs=${speechEvents.length + 1}:duration=first:normalize=0[aout]`;
const partSlug = requestedPart?.replace(/^part\s+/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
const output = resolve(outDir, `${basename(input, ".md")}${partSlug ? `-part-${partSlug}` : ""}.mp4`);
const frameInput = speechEvents.length + 1;
run(ffmpeg, [...audioArgs, "-framerate", String(fps), "-i", resolve(work, "frame-%05d.jpg"), "-filter_complex", filter, "-map", `${frameInput}:v:0`, "-map", "[aout]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(fps), "-movflags", "+faststart", "-shortest", "-y", output]);
await writeFile(resolve(outDir, `${basename(output, ".mp4")}.timeline.json`), JSON.stringify(data, null, 2));
console.log(`Created ${output}`);
console.log(`Temporary frames: ${work}`);
