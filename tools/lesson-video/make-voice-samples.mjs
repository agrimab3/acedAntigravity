import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve("tools/lesson-video");
const python = resolve(root, ".venv/bin/python");
const line = "Wait, so where does the comma go in this sentence?";
const output = resolve(root, "output/voice-samples");
await mkdir(output, { recursive: true });
for (const voice of ["am_liam", "am_eric", "am_echo", "am_adam", "bm_lewis", "bm_fable"]) {
  const file = resolve(output, `${voice}.wav`);
  const result = spawnSync(python, [resolve(root, "tts.py"), "--voice", voice, "--text", line, "--output", file], { stdio: "inherit" });
  if (result.status) process.exit(result.status);
}
console.log(`Created voice samples in ${output}`);
