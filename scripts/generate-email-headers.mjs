import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

const require = createRequire(import.meta.url);
const { GifWriter } = require('omggif');
const NeuQuant = require('gif-encoder-2/src/TypedNeuQuant.js');

const WIDTH = 1200;
const HEIGHT = 400;
const FPS = 10;
const FRAME_COUNT = 40;
const FRAME_DELAY_CS = Math.round(100 / FPS);
const OUT_DIR = path.resolve('public/email');
const PREVIEW_PATH = path.join(os.tmpdir(), 'aced-email-middle-frame.png');

const tempFontDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aced-dm-serif-'));
const fontPath = path.join(tempFontDir, 'DMSerifDisplay-Regular.ttf');
const fontResponse = await fetch(
  'https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf'
);
if (!fontResponse.ok) throw new Error(`Could not download DM Serif Display: ${fontResponse.status}`);
fs.writeFileSync(fontPath, Buffer.from(await fontResponse.arrayBuffer()));
if (!GlobalFonts.registerFromPath(fontPath, 'DM Serif Display')) {
  throw new Error('Could not register DM Serif Display.');
}

const colors = {
  teal: '#5DCAA5',
  violet: '#8C84DE',
  amber: '#EF9F27',
  coral: '#E2785A',
  science: '#F0997B',
};

const configs = [
  { file: 'header-in.gif', accent: colors.teal, sparkles: ['#FFFFFF', '#FFFFFF', '#FFFFFF', colors.teal] },
  { file: 'header-tomorrow.gif', accent: colors.amber, sparkles: ['#FFFFFF', '#FFFFFF', '#FFFFFF', colors.amber] },
  { file: 'header-seat-open.gif', accent: colors.violet, sparkles: ['#FFFFFF', '#FFFFFF', '#FFFFFF', colors.violet] },
  { file: 'header-waitlist.gif', accent: colors.violet, sparkles: ['#FFFFFF', '#FFFFFF', '#FFFFFF', colors.violet] },
  { file: 'header-refund.gif', accent: colors.coral, sparkles: ['#FFFFFF', '#FFFFFF', '#FFFFFF', colors.coral] },
  { file: 'header-scores.gif', accent: colors.teal, sparkles: [colors.teal, colors.violet, colors.amber, colors.science] },
];

const stars = [
  { x: 105, y: 92, size: 5, phase: 0.0 },
  { x: 218, y: 294, size: 7, phase: 1.0 },
  { x: 352, y: 72, size: 4, phase: 2.2 },
  { x: 472, y: 318, size: 6, phase: 3.1 },
  { x: 740, y: 78, size: 8, phase: 4.0 },
  { x: 876, y: 310, size: 5, phase: 5.1 },
  { x: 1012, y: 112, size: 6, phase: 0.8 },
  { x: 1110, y: 270, size: 4, phase: 2.7 },
];

const sparklePositions = [
  { x: 165, y: 190, size: 22, phase: 0.4 },
  { x: 392, y: 225, size: 20, phase: 2.0 },
  { x: 842, y: 190, size: 24, phase: 3.8 },
  { x: 1045, y: 212, size: 21, phase: 5.3 },
];

function rgba(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawStaticBackground(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#0A1328');
  gradient.addColorStop(0.52, '#171A44');
  gradient.addColorStop(1, '#10303A');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const purple = ctx.createRadialGradient(1040, -30, 10, 1040, -30, 390);
  purple.addColorStop(0, 'rgba(62,54,128,0.64)');
  purple.addColorStop(1, 'rgba(62,54,128,0)');
  ctx.fillStyle = purple;
  ctx.fillRect(630, 0, 570, 325);

  const teal = ctx.createRadialGradient(55, 405, 8, 55, 405, 340);
  teal.addColorStop(0, 'rgba(21,80,72,0.78)');
  teal.addColorStop(1, 'rgba(21,80,72,0)');
  ctx.fillStyle = teal;
  ctx.fillRect(0, 100, 470, 300);
}

function measureLetterspaced(ctx, text, spacing) {
  let width = 0;
  for (let i = 0; i < text.length; i += 1) {
    width += ctx.measureText(text[i]).width;
    if (i < text.length - 1) width += spacing;
  }
  return width;
}

function drawLetterspaced(ctx, text, x, y, spacing) {
  let cursor = x;
  for (let i = 0; i < text.length; i += 1) {
    ctx.fillText(text[i], cursor, y);
    cursor += ctx.measureText(text[i]).width + (i < text.length - 1 ? spacing : 0);
  }
  return cursor;
}

function drawLogo(ctx) {
  const targetWidth = WIDTH * 0.30;
  let fontSize = 120;
  let spacing = -fontSize * (0.5 / 28);
  const dotDiameterRatio = 0.16;
  for (let i = 0; i < 8; i += 1) {
    ctx.font = `400 ${fontSize}px "DM Serif Display"`;
    spacing = -fontSize * (0.5 / 28);
    const textWidth = measureLetterspaced(ctx, 'Aced', spacing);
    const dotDiameter = fontSize * dotDiameterRatio;
    const dotGap = fontSize * 0.055;
    const total = textWidth + dotGap + dotDiameter;
    fontSize *= targetWidth / total;
  }
  ctx.font = `400 ${fontSize}px "DM Serif Display"`;
  spacing = -fontSize * (0.5 / 28);
  const textWidth = measureLetterspaced(ctx, 'Aced', spacing);
  const dotDiameter = fontSize * dotDiameterRatio;
  const dotGap = fontSize * 0.055;
  const totalWidth = textWidth + dotGap + dotDiameter;
  const startX = (WIDTH - totalWidth) / 2;
  const baseline = HEIGHT / 2 + fontSize * 0.34;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#F4F6FA';
  const endX = drawLetterspaced(ctx, 'Aced', startX, baseline, spacing);

  const dotRadius = dotDiameter / 2;
  const dotX = endX + dotGap + dotRadius;
  const dotY = baseline - dotRadius * 0.9;
  ctx.save();
  ctx.shadowColor = rgba(colors.teal, 0.78);
  ctx.shadowBlur = dotRadius * 1.25;
  ctx.fillStyle = colors.teal;
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function starTwinkle(frame, phase) {
  if (frame === 0) return { alpha: 0.86, scale: 1 };
  const t = (frame / FRAME_COUNT) * Math.PI * 2;
  const wave = (Math.sin(t + phase) + 1) / 2;
  return { alpha: 0.10 + wave * 0.90, scale: 0.90 + wave * 0.18 };
}

function sparkleTwinkle(frame, index) {
  if (frame === 0) return { alpha: 0.88, scale: 1, rotation: 0 };
  const centers = [6, 16, 26, 36];
  const center = centers[index];
  let distance = Math.abs(frame - center);
  distance = Math.min(distance, FRAME_COUNT - distance);
  if (distance > 5) {
    return { alpha: 0.38, scale: 0.88, rotation: index * 0.06 };
  }
  const wave = (Math.cos((distance / 5) * Math.PI) + 1) / 2;
  return {
    alpha: 0.38 + wave * 0.62,
    scale: 0.88 + wave * 0.18,
    rotation: index * 0.06 + ((frame - center) / 5) * 0.12,
  };
}

function drawRoundStars(ctx, config, frame) {
  stars.forEach((star, index) => {
    const { alpha, scale } = starTwinkle(frame, star.phase);
    const fill = index === 1 || index === 6 ? config.accent : '#FFFFFF';
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(star.x, star.y, (star.size / 2) * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawFourPoint(ctx, x, y, size, color, alpha, rotation, scale) {
  const outer = (size / 2) * scale;
  const inner = outer * 0.19;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 4;
    const radius = i % 2 === 0 ? outer : inner;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSparkles(ctx, config, frame) {
  sparklePositions.forEach((sparkle, index) => {
    const { alpha, scale, rotation } = sparkleTwinkle(frame, index);
    drawFourPoint(
      ctx,
      sparkle.x,
      sparkle.y,
      sparkle.size,
      config.sparkles[index],
      alpha,
      rotation,
      scale
    );
  });
}

function drawShootingStar(ctx, frame) {
  // Keep Outlook's first frame clean; animate for ~0.6s later in the loop.
  const startFrame = 8;
  const durationFrames = 6;
  if (frame < startFrame || frame >= startFrame + durationFrames) return;
  const progress = (frame - startFrame) / (durationFrames - 1);
  const headX = 110 + progress * 960;
  const headY = 34 + progress * 165;
  const angle = Math.atan2(165, 960);
  const tailLength = 175;
  for (let i = 0; i < 14; i += 1) {
    const part = i / 13;
    const alpha = (1 - part) * 0.72;
    const x1 = headX - Math.cos(angle) * tailLength * part;
    const y1 = headY - Math.sin(angle) * tailLength * part;
    const x2 = headX - Math.cos(angle) * tailLength * Math.min(1, part + 0.08);
    const y2 = headY - Math.sin(angle) * tailLength * Math.min(1, part + 0.08);
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 2.2 - part * 1.3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(headX, headY, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawFrame(ctx, config, frame) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawStaticBackground(ctx);
  drawRoundStars(ctx, config, frame);
  drawSparkles(ctx, config, frame);
  drawShootingStar(ctx, frame);
  drawLogo(ctx);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const bayer4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function buildPalette(firstRgba) {
  const rgb = new Uint8Array(WIDTH * HEIGHT * 3);
  let j = 0;
  for (let i = 0; i < firstRgba.length; i += 4) {
    rgb[j++] = firstRgba[i];
    rgb[j++] = firstRgba[i + 1];
    rgb[j++] = firstRgba[i + 2];
  }
  const quantizer = new NeuQuant(rgb, 8);
  quantizer.buildColormap();
  const map = quantizer.getColormap();
  const palette = [];
  for (let i = 0; i < 255; i += 1) {
    palette.push((map[i * 3] << 16) | (map[i * 3 + 1] << 8) | map[i * 3 + 2]);
  }
  palette.push(0xff00ff); // reserved transparent index for delta frames
  return palette;
}

function makePaletteRgb(palette) {
  return palette.slice(0, 255).map((value) => [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255,
  ]);
}

function quantizeFrame(rgba, paletteRgb) {
  const indexed = new Uint8Array(WIDTH * HEIGHT);
  const cache = new Int16Array(32768);
  cache.fill(-1);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const pixel = y * WIDTH + x;
      const base = pixel * 4;
      const dither = (bayer4[y & 3][x & 3] - 7.5) * 1.7;
      const r = Math.max(0, Math.min(255, rgba[base] + dither));
      const g = Math.max(0, Math.min(255, rgba[base + 1] + dither));
      const b = Math.max(0, Math.min(255, rgba[base + 2] + dither));
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let best = cache[key];
      if (best < 0) {
        let bestDistance = Infinity;
        best = 0;
        for (let i = 0; i < paletteRgb.length; i += 1) {
          const [pr, pg, pb] = paletteRgb[i];
          const dr = r - pr;
          const dg = g - pg;
          const db = b - pb;
          const distance = dr * dr + dg * dg + db * db;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
          }
        }
        cache[key] = best;
      }
      indexed[pixel] = best;
    }
  }
  return indexed;
}

for (const config of configs) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  drawFrame(ctx, config, 0);
  const firstRgba = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
  const palette = buildPalette(firstRgba);
  const paletteRgb = makePaletteRgb(palette);
  const output = Buffer.alloc(16 * 1024 * 1024);
  const writer = new GifWriter(output, WIDTH, HEIGHT, { loop: 0, palette });

  let previous = quantizeFrame(firstRgba, paletteRgb);
  writer.addFrame(0, 0, WIDTH, HEIGHT, previous, { delay: FRAME_DELAY_CS, disposal: 1 });

  for (let frame = 1; frame < FRAME_COUNT; frame += 1) {
    drawFrame(ctx, config, frame);
    if (config.file === 'header-in.gif' && frame === Math.floor(FRAME_COUNT / 2)) {
      fs.writeFileSync(PREVIEW_PATH, canvas.toBuffer('image/png'));
    }
    const rgba = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
    const current = quantizeFrame(rgba, paletteRgb);
    const delta = new Uint8Array(WIDTH * HEIGHT);
    for (let i = 0; i < current.length; i += 1) {
      delta[i] = current[i] === previous[i] ? 255 : current[i];
    }
    writer.addFrame(0, 0, WIDTH, HEIGHT, delta, {
      delay: FRAME_DELAY_CS,
      disposal: 1,
      transparent: 255,
    });
    previous = current;
  }

  const used = writer.end();
  const rawPath = path.join(OUT_DIR, `${config.file}.raw.gif`);
  const finalPath = path.join(OUT_DIR, config.file);
  fs.writeFileSync(rawPath, output.subarray(0, used));
  execFileSync('gifsicle', ['--optimize=3', '--loopcount=forever', rawPath, '--output', finalPath]);
  fs.rmSync(rawPath, { force: true });
  const bytes = fs.statSync(finalPath).size;
  console.log(`${config.file} ${bytes} bytes`);
  if (bytes >= 400 * 1024) throw new Error(`${config.file} is too large: ${bytes} bytes`);
}

fs.rmSync(tempFontDir, { recursive: true, force: true });
console.log(`middle-frame-preview ${PREVIEW_PATH}`);
