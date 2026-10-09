import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import GIFEncoder from 'gif-encoder-2';

const width = 1200;
const height = 400;
const frameCount = 3;
const delayMs = 1000;
const outDir = path.resolve('public/email');
const temporaryFontDir = process.env.PLAYFAIR_FONT_PATH ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'aced-email-font-'));
const fontPath = process.env.PLAYFAIR_FONT_PATH || path.join(temporaryFontDir, 'PlayfairDisplay.ttf');
if (!process.env.PLAYFAIR_FONT_PATH) {
  const response = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf');
  if (!response.ok) throw new Error(`Could not download Playfair Display: ${response.status}`);
  fs.writeFileSync(fontPath, Buffer.from(await response.arrayBuffer()));
}
if (!GlobalFonts.registerFromPath(fontPath, 'Playfair Display')) {
  throw new Error('Could not register Playfair Display.');
}


const sectionColors = ['#5DCAA5', '#8C84DE', '#EF9F27', '#F0997B'];
const configs = [
  { file: 'header-in.gif', accents: ['#5DCAA5', '#5DCAA5'] },
  { file: 'header-tomorrow.gif', accents: ['#EF9F27', '#EF9F27'] },
  { file: 'header-seat-open.gif', accents: ['#8C84DE', '#8C84DE'] },
  { file: 'header-waitlist.gif', accents: ['#8C84DE', '#8C84DE'] },
  { file: 'header-refund.gif', accents: ['#E2785A', '#E2785A'] },
  { file: 'header-scores.gif', accents: sectionColors },
];

const stars = [
  [124, 92, 1.3, 0.0],
  [292, 278, 1.1, 0.55],
  [463, 74, 1.2, 1.1],
  [762, 314, 1.4, 1.65],
  [938, 104, 1.15, 2.05],
  [1078, 242, 1.45, 2.55],
];

function drawFrame(ctx, config, frameIndex) {
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0A1328');
  gradient.addColorStop(0.5, '#171A44');
  gradient.addColorStop(1, '#10303A');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const purple = ctx.createRadialGradient(1030, -10, 20, 1030, -10, 360);
  purple.addColorStop(0, 'rgba(62,54,128,0.60)');
  purple.addColorStop(1, 'rgba(62,54,128,0)');
  ctx.fillStyle = purple;
  ctx.fillRect(650, 0, 550, 310);

  const tealGlow = ctx.createRadialGradient(80, 380, 10, 80, 380, 320);
  tealGlow.addColorStop(0, 'rgba(21,80,72,0.72)');
  tealGlow.addColorStop(1, 'rgba(21,80,72,0)');
  ctx.fillStyle = tealGlow;
  ctx.fillRect(0, 120, 480, 280);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 102px "Playfair Display"';
  const main = 'Aced';
  const mainWidth = ctx.measureText(main).width;
  const periodWidth = ctx.measureText('.').width;
  const totalWidth = mainWidth + periodWidth;
  const startX = width / 2 - totalWidth / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(main, startX, height / 2 + 3);
  ctx.fillStyle = '#5DCAA5';
  ctx.fillText('.', startX + mainWidth, height / 2 + 3);

  for (let i = 0; i < stars.length; i++) {
    const [x, y, radius, phase] = stars[i];
    let alpha = 1;
    if (frameIndex > 0) {
      const t = (frameIndex / frameCount) * Math.PI * 2;
      alpha = 0.32 + 0.68 * ((Math.sin(t + phase) + 1) / 2);
    }
    let color = '#FFFFFF';
    if (config.file === 'header-scores.gif') {
      if (i >= 2) color = config.accents[(i - 2) % config.accents.length];
    } else if (i === 1 || i === 4) {
      color = config.accents[i === 1 ? 0 : 1];
    }
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

for (const config of configs) {
  const encoder = new GIFEncoder(width, height, 'neuquant', true, 20);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(delayMs);
  encoder.setQuality(20);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  for (let frame = 0; frame < frameCount; frame++) {
    drawFrame(ctx, config, frame);
    encoder.addFrame(ctx);
  }
  encoder.finish();
  const out = path.join(outDir, config.file);
  fs.writeFileSync(out, encoder.out.getData());
  const bytes = fs.statSync(out).size;
  console.log(`${config.file} ${bytes} bytes`);
  if (bytes >= 250 * 1024) throw new Error(`${config.file} is too large: ${bytes} bytes`);
}

if (temporaryFontDir) fs.rmSync(temporaryFontDir, { recursive: true, force: true });
