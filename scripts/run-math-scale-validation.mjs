import { randomUUID } from "node:crypto";
import { open, readFile, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SLOT_PLAN = [
  ["number-and-quantity", "easy"], ["number-and-quantity", "easy"], ["algebra", "easy"], ["functions", "easy"],
  ["geometry", "easy"], ["statistics-and-probability", "easy"], ["modeling", "easy"], ["integrating-essential-skills", "easy"],
  ["number-and-quantity", "medium"], ["algebra", "medium"], ["algebra", "medium"], ["functions", "medium"],
  ["geometry", "medium"], ["statistics-and-probability", "medium"], ["modeling", "medium"], ["integrating-essential-skills", "medium"],
  ["number-and-quantity", "hard"], ["algebra", "hard"], ["functions", "hard"], ["functions", "hard"],
  ["geometry", "hard"], ["statistics-and-probability", "hard"], ["modeling", "hard"], ["integrating-essential-skills", "hard"],
];

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith("--")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=") || "true"];
  }));
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function readLock(lockPath) {
  try {
    return JSON.parse(await readFile(lockPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function acquireLocalExperimentLock({ experimentId, lockDirectory = os.tmpdir() }) {
  if (!/^math-scale-validation-\d+$/.test(experimentId)) {
    throw new Error("Local Math scale lock requires a math-scale-validation-N experiment ID.");
  }

  const lockPath = path.join(lockDirectory, `aced-${experimentId}.lock`);
  const lockToken = randomUUID();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const record = {
      experimentId,
      runnerPid: process.pid,
      childPid: null,
      lockToken,
      startedAt: new Date().toISOString(),
    };

    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(JSON.stringify(record));
      await handle.close();

      return {
        lockPath,
        record,
        async setChildPid(childPid) {
          record.childPid = childPid;
          await writeFile(lockPath, JSON.stringify(record));
        },
        async release() {
          const current = await readLock(lockPath);
          if (current?.lockToken === lockToken) {
            await unlink(lockPath);
          }
        },
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readLock(lockPath);
      const activePid = [existing?.runnerPid, existing?.childPid].find(isProcessAlive);
      if (activePid) {
        throw new Error(
          `Local experiment lock is active for ${existing?.experimentId ?? experimentId} (PID ${activePid}; lock ${lockPath}).`
        );
      }
      await unlink(lockPath).catch((unlinkError) => {
        if (unlinkError?.code !== "ENOENT") throw unlinkError;
      });
    }
  }

  throw new Error(`Could not acquire local experiment lock: ${lockPath}`);
}

function runGenerator(args, lock) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", async (code, signal) => {
      await lock.setChildPid(null);
      if (code !== 0) {
        reject(new Error(`Generator exited with code ${code ?? "null"}${signal ? ` (${signal})` : ""}: ${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
    lock.setChildPid(child.pid).catch((error) => child.kill() && reject(error));
  });
}

export async function runMathScaleValidation({ experimentId, runId }) {
  const lock = await acquireLocalExperimentLock({ experimentId });
  const results = [];

  try {
    for (const [topic, difficulty] of SLOT_PLAN) {
      const result = await runGenerator([
        "--env-file=.env",
        "generate-questions.mjs",
        "--section=math",
        `--topic=${topic}`,
        `--difficulty-plan=${difficulty}:1`,
        "--candidate-count=1",
        "--status=draft",
        "--provider=groq",
        "--model=openai/gpt-oss-120b",
        `--run-id=${runId}`,
        "--delay-ms=0",
        "--json=true",
      ], lock);
      results.push({ topic, difficulty, completed: true, stderr: result.stderr || null });
      console.log(`Completed ${topic}/${difficulty} (${results.length}/${SLOT_PLAN.length}).`);
    }
    return { experimentId, runId, intendedSlots: SLOT_PLAN.length, results };
  } finally {
    await lock.release();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const experimentId = args["experiment-id"];
  const runId = args["run-id"];
  if (!experimentId || !runId) {
    throw new Error("Usage: --experiment-id=math-scale-validation-N --run-id=<uuid>");
  }
  console.log(JSON.stringify(await runMathScaleValidation({ experimentId, runId }), null, 2));
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

