export const MOCK_FORM_SECTION_COUNTS = {
  english: 50,
  math: 45,
  reading: 36,
  science: 40,
};

const DIFFICULTY_ORDER = { hard: 3, medium: 2, easy: 1 };

function stableCompare(left, right) {
  return (
    String(left.topicName).localeCompare(String(right.topicName)) ||
    (DIFFICULTY_ORDER[right.difficulty] ?? 0) - (DIFFICULTY_ORDER[left.difficulty] ?? 0) ||
    String(left.id).localeCompare(String(right.id))
  );
}

function balancePenalty(items) {
  const difficultyCounts = { easy: 0, medium: 0, hard: 0 };
  const topicCounts = new Map();

  for (const item of items) {
    if (item.difficulty in difficultyCounts) difficultyCounts[item.difficulty] += 1;
    topicCounts.set(item.topicName, (topicCounts.get(item.topicName) ?? 0) + 1);
  }

  const difficultyValues = Object.values(difficultyCounts);
  const difficultySpread = Math.max(...difficultyValues) - Math.min(...difficultyValues);
  const topicValues = [...topicCounts.values()];
  const topicSpread = topicValues.length > 0 ? Math.max(...topicValues) - Math.min(...topicValues) : 0;

  return difficultySpread * 4 + topicSpread;
}

export function selectBalancedIndividuals(candidates, targetCount) {
  if (candidates.length < targetCount) return null;

  const remaining = [...candidates].sort(stableCompare);
  const selected = [];
  const topicCounts = new Map();
  const difficultyCounts = { easy: 0, medium: 0, hard: 0 };

  while (selected.length < targetCount) {
    remaining.sort((left, right) => {
      const leftScore =
        (topicCounts.get(left.topicName) ?? 0) * 4 +
        (difficultyCounts[left.difficulty] ?? 0) * 3;
      const rightScore =
        (topicCounts.get(right.topicName) ?? 0) * 4 +
        (difficultyCounts[right.difficulty] ?? 0) * 3;

      return leftScore - rightScore || stableCompare(left, right);
    });

    const next = remaining.shift();
    if (!next) return null;
    selected.push(next);
    topicCounts.set(next.topicName, (topicCounts.get(next.topicName) ?? 0) + 1);
    if (next.difficulty in difficultyCounts) difficultyCounts[next.difficulty] += 1;
  }

  return selected;
}

export function selectWholeSets(setGroups, targetCount) {
  const groups = [...setGroups]
    .filter((group) => group.questions.length > 0 && group.questions.length <= targetCount)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const states = new Map();
  states.set(0, { groups: [], questions: [] });

  for (const group of groups) {
    const snapshot = [...states.entries()];
    for (const [count, state] of snapshot) {
      const nextCount = count + group.questions.length;
      if (nextCount > targetCount) continue;

      const nextQuestions = [...state.questions, ...group.questions];
      const candidate = {
        groups: [...state.groups, group],
        questions: nextQuestions,
      };
      const existing = states.get(nextCount);

      if (
        !existing ||
        balancePenalty(candidate.questions) < balancePenalty(existing.questions) ||
        (balancePenalty(candidate.questions) === balancePenalty(existing.questions) &&
          candidate.groups.length < existing.groups.length)
      ) {
        states.set(nextCount, candidate);
      }
    }
  }

  return states.get(targetCount) ?? null;
}

export function summarizeSelection(selection) {
  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  const byTopic = {};

  for (const question of selection) {
    if (question.difficulty in byDifficulty) byDifficulty[question.difficulty] += 1;
    byTopic[question.topicName] = (byTopic[question.topicName] ?? 0) + 1;
  }

  return { byDifficulty, byTopic };
}
