export const RESERVE_PREVIEW_SECTION_TOTALS = {
  english: 50,
  math: 45,
  reading: 36,
  science: 40,
} as const;

export type ReservePreviewSection = keyof typeof RESERVE_PREVIEW_SECTION_TOTALS;

type PreviewParams = { section?: string; question?: string };

export function getReservePreviewLocation(params: PreviewParams) {
  const section = Object.hasOwn(RESERVE_PREVIEW_SECTION_TOTALS, params.section ?? '')
    ? (params.section as ReservePreviewSection)
    : 'reading';
  const total = RESERVE_PREVIEW_SECTION_TOTALS[section];
  // Keep the existing Reading IV shortcut, while every other section begins at Q1.
  const defaultQuestion = section === 'reading' ? 35 : 1;
  const question = Number(params.question ?? defaultQuestion);
  return { section, question, total };
}

export function reservePreviewHref(section: ReservePreviewSection, question: number) {
  return `?section=${section}&question=${question}`;
}

export function getReservePreviewNavigation(section: ReservePreviewSection, question: number) {
  const total = RESERVE_PREVIEW_SECTION_TOTALS[section];
  return {
    previous: question > 1 ? reservePreviewHref(section, question - 1) : null,
    next: question < total ? reservePreviewHref(section, question + 1) : null,
  };
}
