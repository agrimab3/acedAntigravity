import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { FACTORY_JOB_TIMEOUT_MS, FACTORY_BATCH_TIMEOUT_MS, describeFactoryProcessError } from '../lib/content-factory-process.mjs';
import { parseContentFactoryArgs } from '../lib/content-factory-args.mjs';

test('manual factory flag is recognized without an equals value', () => {
  assert.deepEqual(parseContentFactoryArgs(['--manual', '--limit=3']), {
    manual: true,
    limit: '3',
  });
});

test('timeout keeps its cause before long progress output and redacts credentials', async () => {
  let error;
  try {
    await promisify(execFile)(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], { timeout: 40 });
  } catch (caught) { error = caught; }
  assert.ok(error.killed);
  error.stderr = 'progress '.repeat(600) + ' private-test-key https://example.test?key=url-secret';
  const detail = describeFactoryProcessError(error, 40, 'private-test-key');
  assert.match(detail, /^Generator timed out after 0.04s/);
  assert.ok(detail.length <= 1400);
  assert.ok(!detail.includes('private-test-key'));
  assert.ok(!detail.includes('url-secret'));
});

test('process budgets allow sequential review work within the factory budget', () => {
  assert.ok(FACTORY_JOB_TIMEOUT_MS > 300000);
  assert.ok(FACTORY_BATCH_TIMEOUT_MS >= 7 * FACTORY_JOB_TIMEOUT_MS);
  assert.match(describeFactoryProcessError(new Error('provider unavailable'), FACTORY_JOB_TIMEOUT_MS), /^Generator failed: provider unavailable/);
});
