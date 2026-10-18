import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import { parseLesson, selectPart } from "./lib.mjs";

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
const voice = process.env.LESSON_VOICE || "af_heart";
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
let cursor = 0;
let board = [];
let speech = 0;
for (const part of parts) {
  for (const event of part.events) {
    if (event.type === "board") { board = [...board, event.text]; timeline.push({ ...event, at: cursor, board: [...board] }); continue; }
    if (event.type === "chat") { timeline.push({ ...event, at: cursor, board: [...board] }); cursor += event.seconds; continue; }
    const wav = resolve(work, `speech-${speech++}.wav`);
    run(python, [resolve(root, "tts.py"), "--voice", voice, "--text", event.text, "--output", wav]);
    const seconds = duration(wav);
    timeline.push({ ...event, at: cursor, seconds, audio: wav, board: [...board] });
    cursor += seconds + 0.35;
  }
}
const total = requestedDuration ? Math.max(requestedDuration, cursor) : cursor + 1;
const title = requestedPart || parts.at(-1)?.title || "Aced lesson";
const data = { title, timeline, total, fps };
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,600&display=swap" rel="stylesheet"><style>
*{box-sizing:border-box}body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#fdfcfa;color:#162b34;font-family:'DM Sans',sans-serif}.studio{height:100%;padding:64px 82px;background:radial-gradient(ellipse 58% 48% at 12% 0%,#77d9c244,transparent 68%),radial-gradient(ellipse 52% 45% at 88% 0%,#afa9ec42,transparent 68%),linear-gradient(180deg,#fdfcfa 0%,#f8fbfa 100%);position:relative}.top{display:flex;justify-content:space-between;align-items:center}.brand{font:600 40px 'Playfair Display',serif;letter-spacing:-1.5px}.brand b{color:#1d9e75}.label{border:1px solid #1d9e7566;border-radius:999px;padding:11px 18px;color:#16735b;background:#effaf6;font-weight:700;font-size:20px}.lesson{margin-top:58px;font:600 62px/1.05 'Playfair Display',serif;letter-spacing:-2px;max-width:1050px}.lesson i{color:#6e68b5}.board{position:absolute;left:82px;top:265px;width:1135px;min-height:615px;border-radius:32px;border:1px solid #d9e4e1;background:#fffdfbd9;box-shadow:0 26px 80px #17333b18;padding:58px 64px;overflow:hidden}.board:before{content:'';position:absolute;width:530px;height:110px;top:110px;left:62px;background:#ffe87c99;transform:rotate(-2deg);border-radius:50%;z-index:0}.boardTitle{position:relative;font:700 29px Caveat,cursive;color:#438170;margin-bottom:42px}.boardItem{position:relative;background:#fff;border:1px solid #d7e5e1;border-radius:18px;padding:24px 30px;margin:17px 0;font-size:31px;font-weight:600;box-shadow:0 8px 22px #17333b0b;opacity:0;transform:translateY(22px);transition:opacity .55s ease,transform .55s ease}.boardItem.visible{opacity:1;transform:none}.boardItem:before{content:'✦';color:#1d9e75;margin-right:15px}.sticky{position:absolute;right:115px;top:277px;width:390px;min-height:258px;padding:40px 34px;background:#fff0a9;box-shadow:0 18px 35px #765f2025;transform:rotate(3deg);font:700 33px/1.15 Caveat,cursive;color:#554b23}.heygen{position:absolute;right:94px;bottom:148px;width:420px;height:236px;border:3px dashed #8d88c1;border-radius:26px;color:#726cb1;background:#f7f5ffb8;display:grid;place-items:center;text-align:center;font-size:24px;font-weight:700}.heygen small{display:block;font-size:17px;font-weight:500;margin-top:8px}.caption{position:absolute;left:154px;right:154px;bottom:61px;border-radius:26px;padding:22px 34px;background:#102a32e8;color:#fff;font-size:31px;line-height:1.28;text-align:center;box-shadow:0 12px 28px #0b212433}.chat{position:absolute;left:50%;top:51%;transform:translate(-50%,-50%);padding:28px 45px;border-radius:25px;background:#fff7c9f0;box-shadow:0 15px 40px #3d3b1722;text-align:center;color:#4e4722;font:700 34px Caveat,cursive;display:none}.chat span{display:block;font:700 82px 'DM Sans',sans-serif;color:#1d9e75}.chat.show{display:block}.dots{position:absolute;right:530px;top:136px;color:#1d9e75;letter-spacing:9px;font-size:22px}</style></head><body><main class="studio"><header class="top"><div class="brand">Aced<b>.</b></div><div class="label">✦ Astra · AI tutor</div></header><div class="dots">✦ · ✦ · ✦</div><h1 class="lesson">${title.includes("Part") ? title : `Part <i>${title}</i>`}</h1><section class="board"><div class="boardTitle">let’s make this click</div><div id="items"></div></section><aside class="sticky">small steps, big score energy ✦</aside><aside class="heygen">HEYGEN CLIP SLOT<small>drop intro / outro here</small></aside><div id="chat" class="chat">your turn<br><span>10</span></div><footer id="caption" class="caption">Welcome to Aced.</footer></main><script>const data=${esc(data)};window.render=(t)=>{const says=data.timeline.filter(e=>e.type==='say');const active=says.find(e=>t>=e.at&&t<e.at+e.seconds)||says.filter(e=>e.at<=t).at(-1);const visible=(active?.board||data.timeline.filter(e=>e.type==='board'&&e.at<=t).at(-1)?.board||[]);document.querySelector('#items').innerHTML=visible.map((item,i)=>'<div class="boardItem visible" style="transition-delay:'+i*.12+'s">'+item+'</div>').join('');document.querySelector('#caption').textContent=active?.text||'Take a breath. You’ve got this.';const chat=data.timeline.find(e=>e.type==='chat'&&t>=e.at&&t<e.at+e.seconds);const box=document.querySelector('#chat');box.classList.toggle('show',Boolean(chat));if(chat)box.querySelector('span').textContent=Math.max(0,Math.ceil(chat.at+chat.seconds-t));};window.render(0);</script></body></html>`;
await writeFile(resolve(work, "frame.html"), html);
const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ["--font-render-hinting=medium"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
for (let frame = 0; frame < Math.ceil(total * fps); frame++) {
  await page.evaluate((seconds) => window.render(seconds), frame / fps);
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
