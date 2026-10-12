/** Display-only translation of passage-local ACT English references to section-global positions. */
export function globalEnglishNumber(local: number, position: number): number {
  return Math.floor((position - 1) / 10) * 10 + local;
}

export function globalEnglishPassage(passage: string, position: number): string {
  return passage.replace(/\[(\d{1,2})\](?=\[underline\]|(?!\w))/g, (marker, raw: string) => {
    const local = Number(raw);
    return local >= 1 && local <= 10 ? `[${globalEnglishNumber(local, position)}]` : marker;
  });
}

export function globalEnglishPrompt(prompt: string, position: number): string {
  return prompt
    .replace(/\b(question\s+)(\d{1,2})\b/gi, (full, prefix: string, raw: string) => {
      const local = Number(raw);
      return local >= 1 && local <= 10 ? `${prefix}${globalEnglishNumber(local, position)}` : full;
    })
    .replace(/\b(At point\s+)(\d{1,2})\b/gi, (full, prefix: string, raw: string) => {
      const local = Number(raw);
      return local >= 1 && local <= 10 ? `${prefix}${globalEnglishNumber(local, position)}` : full;
    });
}
