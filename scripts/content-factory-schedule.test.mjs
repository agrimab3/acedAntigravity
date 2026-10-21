import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateSectionTargets, buildPacedFactoryBatches, FACTORY_BATCH_SIZE, FACTORY_NIGHTLY_TARGET } from '../lib/content-factory-schedule.mjs';

test('nightly target is balanced 30/30/20/20 and paced in batches of five', () => {
  assert.deepEqual(allocateSectionTargets(FACTORY_NIGHTLY_TARGET), {
    english: 12, math: 12, reading: 8, science: 8,
  });
  const batches = buildPacedFactoryBatches(FACTORY_NIGHTLY_TARGET);
  assert.equal(batches.reduce((sum, batch) => sum + batch.requested, 0), 40);
  assert.ok(batches.every((batch) => batch.requested <= FACTORY_BATCH_SIZE));
});

test('an eight-item manual run allocates two candidates per section', () => {
  assert.deepEqual(allocateSectionTargets(8), {
    english: 2, math: 2, reading: 2, science: 2,
  });
});
