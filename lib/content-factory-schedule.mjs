export const FACTORY_SECTION_WEIGHTS = Object.freeze([
  { sectionKey: 'english', weight: 0.30 },
  { sectionKey: 'math', weight: 0.30 },
  { sectionKey: 'reading', weight: 0.20 },
  { sectionKey: 'science', weight: 0.20 },
]);

export const FACTORY_NIGHTLY_TARGET = 40;
export const FACTORY_BATCH_SIZE = 5;

// Largest-remainder allocation keeps small manual runs balanced too: an
// eight-item run becomes two candidates in each section.
export function allocateSectionTargets(total) {
  if (!Number.isInteger(total) || total < 1) throw new Error('total must be a positive integer.');
  const rows = FACTORY_SECTION_WEIGHTS.map((entry, index) => {
    const exact = total * entry.weight;
    return { ...entry, index, count: Math.floor(exact), remainder: exact % 1 };
  });
  let remaining = total - rows.reduce((sum, row) => sum + row.count, 0);
  for (const row of [...rows].sort((left, right) => right.remainder - left.remainder || left.index - right.index)) {
    if (remaining <= 0) break;
    row.count += 1;
    remaining -= 1;
  }
  return Object.fromEntries(rows.map(({ sectionKey, count }) => [sectionKey, count]));
}

export function buildPacedFactoryBatches(total, batchSize = FACTORY_BATCH_SIZE) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize must be a positive integer.');
  const targets = allocateSectionTargets(total);
  return FACTORY_SECTION_WEIGHTS.flatMap(({ sectionKey }) => {
    const batches = [];
    let remaining = targets[sectionKey];
    while (remaining > 0) {
      const requested = Math.min(batchSize, remaining);
      batches.push({ sectionKey, requested });
      remaining -= requested;
    }
    return batches;
  });
}
