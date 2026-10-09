export const CONTENT_SCOPES = ["practice", "mock_reserve"];
export const CONTENT_DIFFICULTIES = ["easy", "medium", "hard"];

export const SECTION_FORM_DEMAND = {
  english: 50,
  math: 45,
  reading: 36,
  science: 40,
};

// Practice keeps the inventory targets Aced already used in its question-health report.
export const PRACTICE_SECTION_TARGETS = {
  english: 250,
  math: 225,
  reading: 180,
  science: 200,
};

// Mock reserve starts at roughly three completely fresh ACT forms.
// These are intentionally separate from practice inventory.
export const MOCK_RESERVE_SECTION_TARGETS = {
  english: SECTION_FORM_DEMAND.english * 3,
  math: SECTION_FORM_DEMAND.math * 3,
  reading: SECTION_FORM_DEMAND.reading * 3,
  science: SECTION_FORM_DEMAND.science * 3,
};

export function getSectionTarget(scope, sectionKey) {
  if (scope === "practice") return PRACTICE_SECTION_TARGETS[sectionKey] ?? 0;
  if (scope === "mock_reserve") return MOCK_RESERVE_SECTION_TARGETS[sectionKey] ?? 0;
  return 0;
}

export function getCellTarget({ scope, sectionKey, activeTopicCount }) {
  const sectionTarget = getSectionTarget(scope, sectionKey);
  if (!sectionTarget || !activeTopicCount) return 0;
  return Math.ceil(sectionTarget / (activeTopicCount * CONTENT_DIFFICULTIES.length));
}
