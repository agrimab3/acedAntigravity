import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseLesson, selectPart, spokenText } from "./lib.mjs";

test("lesson parser recognizes narration, board items, and timed chat", async () => {
  const folder = await mkdtemp(join(tmpdir(), "aced-lesson-"));
  const file = join(folder, "lesson.md");
  await writeFile(file, "## Part 5\n[BOARD: Choice A]\nASTRA SAYS: Aced ACT AI\n[CHAT 10s]\n");
  const parts = await parseLesson(file);
  const part = selectPart(parts, "Part 5")[0];
  assert.deepEqual(part.events.map((e) => e.type), ["board", "say", "chat"]);
  assert.equal(part.events[2].seconds, 10);
});
test("pronunciation maps Aced, ACT, and AI consistently", () => {
  assert.equal(spokenText("Aced ACT AI"), "AYST A. C. T. A. I.");
});
