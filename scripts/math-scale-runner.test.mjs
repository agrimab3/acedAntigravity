import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireLocalExperimentLock } from "./run-math-scale-validation.mjs";

test("a second local Math scale runner is blocked before it can schedule a candidate", async () => {
  const lockDirectory = await mkdtemp(path.join(os.tmpdir(), "aced-math-scale-lock-"));
  const first = await acquireLocalExperimentLock({ experimentId: "math-scale-validation-02", lockDirectory });

  try {
    await assert.rejects(
      acquireLocalExperimentLock({ experimentId: "math-scale-validation-02", lockDirectory }),
      /Local experiment lock is active.*math-scale-validation-02/
    );
  } finally {
    await first.release();
    await rm(lockDirectory, { recursive: true, force: true });
  }
});

