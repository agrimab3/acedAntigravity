import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allocateSectionTargets, buildManualFactoryTestPlan, buildPacedFactoryBatches, FACTORY_BATCH_SIZE, FACTORY_NIGHTLY_TARGET } from '../lib/content-factory-schedule.mjs';

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

test('the fair manual test plan requests three English, three Math, and one viable shared set per passage section', () => {
  assert.deepEqual(buildManualFactoryTestPlan('english:3,math:3,reading-set:1,science-set:1'), [
    { sectionKey: 'english', requested: 3, label: 'English candidates' },
    { sectionKey: 'math', requested: 3, label: 'Math candidates' },
    { sectionKey: 'reading', requested: 3, setCount: 1, label: 'Reading shared sets' },
    { sectionKey: 'science', requested: 3, setCount: 1, label: 'Science shared sets' },
  ]);
});

test('nightly runner passes its run ID through the generator boundary', () => {
  const nightly = readFileSync('scripts/content-nightly.mjs', 'utf8');
  const generator = readFileSync('scripts/content-generate-next.mjs', 'utf8');
  assert.match(nightly, /`--run-id=\$\{runId\}`/);
  assert.match(generator, /const requestedRunId = args\["run-id"\]/);
  assert.match(generator, /childArgs\.push\(`--run-id=\$\{requestedRunId\}`\)/);
});
