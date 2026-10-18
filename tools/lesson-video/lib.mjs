import { readFile } from "node:fs/promises";

export function spokenText(text) {
  return text
    .replace(/\bAced\b/gi, "AYST")
    .replace(/\bACT\b/g, "A. C. T.")
    .replace(/\bAI\b/g, "A. I.");
}

export async function parseLesson(file) {
  const source = await readFile(file, "utf8");
  const parts = [];
  let current = { title: "Lesson", events: [] };
  parts.push(current);
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(?:Part\s+)?(.+)$/i);
    if (heading) {
      current = { title: heading[1].trim(), events: [] };
      parts.push(current);
      continue;
    }
    const narration = line.match(/^(?:[-*]\s*)?ASTRA SAYS:\s*(.+)$/i);
    if (narration) { current.events.push({ type: "say", text: narration[1].trim() }); continue; }
    const board = line.match(/^\[BOARD:\s*(.+)\]$/i);
    if (board) { current.events.push({ type: "board", text: board[1].trim() }); continue; }
    const chat = line.match(/^\[CHAT\s+(\d+)s\]$/i);
    if (chat) { current.events.push({ type: "chat", seconds: Number(chat[1]) }); continue; }
  }
  return parts.filter((part) => part.events.length);
}

export function selectPart(parts, selector) {
  if (!selector) return parts;
  const normal = selector.toLowerCase().replace(/^part\s+/, "");
  const result = parts.filter((part) => part.title.toLowerCase().replace(/^part\s+/, "").startsWith(normal));
  if (!result.length) throw new Error(`Part not found: ${selector}`);
  return result;
}
