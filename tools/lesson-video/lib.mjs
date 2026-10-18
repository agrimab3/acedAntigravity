import { readFile } from "node:fs/promises";

export function spokenText(text) {
  return text
    .replace(/(?<![A-Za-z])A\.?\s*C\.?\s*T\.?(?![A-Za-z])/gi, "A, C, T")
    .replace(/(?<![A-Za-z])A\.?\s*I\.?(?![A-Za-z])/gi, "A, I")
    .replace(/\bAced\b/gi, "AYST")
    .replace(/\bACT\b/g, "A, C, T")
    .replace(/\bAI\b/g, "A, I");
}

export async function parseLesson(file) {
  const source = await readFile(file, "utf8");
  const parts = [];
  let current = { title: "Lesson", events: [] };
  let activeSpeaker = null;
  parts.push(current);
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(?:Part\s+)?(.+)$/i);
    if (heading) {
      current = { title: heading[1].trim(), events: [] };
      parts.push(current);
      activeSpeaker = null;
      continue;
    }
    const narration = line.match(/^(?:[-*]\s*)?\**ASTRA SAYS\**(?::\s*(.+))?$/i);
    if (narration) { activeSpeaker = "astra"; if (narration[1]) current.events.push({ type: "say", speaker: "astra", text: narration[1].trim() }); continue; }
    const cosmo = line.match(/^(?:[-*]\s*)?COSMO:\s*(.+)$/i);
    if (cosmo) { activeSpeaker = "cosmo"; current.events.push({ type: "say", speaker: "cosmo", text: cosmo[1].trim() }); continue; }
    const board = line.match(/^\[BOARD:\s*(.+)\]$/i);
    if (board) { current.events.push({ type: "board", text: board[1].trim() }); continue; }
    const chat = line.match(/^\[CHAT\s+(\d+)s\]$/i);
    if (chat) { current.events.push({ type: "chat", seconds: Number(chat[1]) }); activeSpeaker = null; continue; }
    if (activeSpeaker && !line.startsWith("---") && !line.startsWith("**Sunday")) current.events.push({ type: "say", speaker: activeSpeaker, text: line.replace(/^\*\*|\*\*$/g, "") });
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
