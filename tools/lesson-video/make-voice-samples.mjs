import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve("tools/lesson-video");
const python = resolve(root, ".venv/bin/python");
const line = "Welcome to Aced. Your ACT score is waiting for you. AI can help you practice.";
const output = resolve(root, "output/voice-samples");
await mkdir(output, { recursive: true });
for (const voice of ["af_heart", "af_bella", "af_nicole"]) {
  const file = resolve(output, `${voice}.wav`);
  const result = spawnSync(python, [resolve(root, "tts.py"), "--voice", voice, "--text", line, "--output", file], { stdio: "inherit" });
  if (result.status) process.exit(result.status);
}
console.log(`Created voice samples in ${output}`);
