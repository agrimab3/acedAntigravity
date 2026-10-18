import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseLesson, selectPart, spokenText } from "./lib.mjs";

test("lesson parser recognizes narration, board items, and timed chat", async () => {
  const folder = await mkdtemp(join(tmpdir(), "aced-lesson-"));
  const file = join(folder, "lesson.md");
  await writeFile(file, "## Part 5\n[BOARD: Choice A]\n**ASTRA SAYS**\nAced ACT AI\nCOSMO: I have a question.\n[CHAT 10s]\n");
  const parts = await parseLesson(file);
  const part = selectPart(parts, "Part 5")[0];
  assert.deepEqual(part.events.map((e) => e.type), ["board", "say", "say", "chat"]);
  assert.equal(part.events[1].speaker, "astra");
  assert.equal(part.events[2].speaker, "cosmo");
  assert.equal(part.events[3].seconds, 10);
});
test("pronunciation maps Aced, ACT, and AI consistently", () => {
  assert.equal(spokenText("Aced ACT A.C.T. AI A.I."), "AYST A, C, T A, C, T A, I A, I");
});
