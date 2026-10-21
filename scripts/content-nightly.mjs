import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { factoryReviewAuditLines } from '../lib/content-factory-review.mjs';
import { describeFactoryProcessError, redactFactoryError } from '../lib/content-factory-process.mjs';
import { parseContentFactoryArgs } from '../lib/content-factory-args.mjs';
import { buildManualFactoryTestPlan, buildPacedFactoryBatches, FACTORY_NIGHTLY_TARGET } from '../lib/content-factory-schedule.mjs';

const arg = parseContentFactoryArgs(process.argv.slice(2));
const manualTestPlan = arg['section-plan'] ? buildManualFactoryTestPlan(arg['section-plan']) : null;
const limit = manualTestPlan
  ? manualTestPlan.reduce((sum, batch) => sum + batch.requested, 0)
  : Math.min(FACTORY_NIGHTLY_TARGET, Math.max(1, Number(arg.limit || FACTORY_NIGHTLY_TARGET)));
if (!Number.isInteger(limit)) throw Error('Invalid limit');
const pacificHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
if (!arg.manual && pacificHour !== 1) {
  console.log('Skipped: outside 1 AM Pacific hour');
  process.exit(0);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const batchPauseMs = Math.max(0, Number(process.env.CONTENT_FACTORY_BATCH_PAUSE_MS || 5000));
const quotaRetryMs = Math.max(1000, Number(process.env.CONTENT_FACTORY_QUOTA_RETRY_MS || 60000));
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

function parseGeneratorSummary(output) {
  const at = output.lastIndexOf('Generation batch summary:');
  if (at < 0) return null;
  try { return JSON.parse(output.slice(output.indexOf('{', at))); } catch { return null; }
}

function isQuotaFailure(summary, detail) {
  return /quota|rate.limit|RESOURCE_EXHAUSTED|429/i.test(detail || '') ||
    (summary?.jobs || []).some((job) => ['hard-quota', 'temporary-rate-limit'].includes(job.providerFailure?.kind));
}

function addSummary(result, summary, safeError) {
  for (const job of summary?.jobs || []) {
    result.inserted += Number(job.inserted || 0);
    result.rejected += Number(job.reviewRejected || 0);
    result.skipped += Number(job.skipped || 0);
    const detail = safeError(job.providerFailure?.message || job.error || '');
    if (detail) result.note = `${job.providerFailure?.provider || 'gemini'} ${job.providerFailure?.kind || job.pauseReason || 'error'}: ${detail}`;
  }
}

try {
  await db.connect();
  const created = await db.query('insert into content_factory_runs(status,requested_limit) values ($1,$2) returning id', ['running', limit]);
  const runId = created.rows[0].id;
  const result = { inserted: 0, rejected: 0, skipped: 0, quota_paused: 0, status: 'skipped', note: '' };
  const key = process.env.CONTENT_FACTORY_GEMINI_API_KEY;

  try {
    if (!key) {
      result.note = 'Missing CONTENT_FACTORY_GEMINI_API_KEY; skipped';
      console.log(result.note);
    } else {
      // Gemini-only factory: tutor and other provider credentials cannot leak into this child process.
      const env = {
        ...process.env,
        GEMINI_GENERATION_MODEL: 'gemini-3-flash-preview', GEMINI_REVIEW_MODEL: 'gemini-2.5-flash',
        CONTENT_FACTORY_REQUEST_SPACING_MS: '5000', GEMINI_API_KEY: key, GOOGLE_API_KEY: key,
        QUESTION_GENERATION_PROVIDER: 'gemini', QUESTION_REVIEW_PROVIDER: 'gemini', CONTENT_GENERATION_PROVIDER: 'gemini',
        GROQ_API_KEY: '', OPENROUTER_API_KEY: '', OPENROUTER_GENERATION_MODEL: '', OPENROUTER_REVIEW_MODEL: '',
        OLLAMA_GENERATION_MODEL: '', OLLAMA_REVIEW_MODEL: '', OLLAMA_MODEL: '', OLLAMA_API_BASE_URL: '', OLLAMA_BASE_URL: '',
      };
      const safeError = (value) => redactFactoryError(value, key).slice(0, 1400);
      const batches = manualTestPlan ?? buildPacedFactoryBatches(limit);

      for (const [index, batch] of batches.entries()) {
        let remaining = batch.requested;
        let attempts = 0;
        while (remaining > 0 && attempts < 2) {
          attempts += 1;
          console.log(`Factory batch ${index + 1}/${batches.length}: ${batch.label ?? batch.sectionKey}, ${remaining} target(s), attempt ${attempts}.`);
          const child = spawnSync('node', [
            'scripts/content-generate-next.mjs', '--scope=practice', `--section=${batch.sectionKey}`,
            `--limit=${remaining}`, '--provider=gemini', '--model=gemini-3-flash-preview',
          ], { cwd: process.cwd(), env, encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
          const output = child.stdout || '';
          const stderr = child.stderr || '';
          for (const line of factoryReviewAuditLines(output)) console.log(line);
          const summary = parseGeneratorSummary(output);
          const insertedBefore = result.inserted;
          addSummary(result, summary, safeError);
          remaining = Math.max(0, remaining - (result.inserted - insertedBefore));
          const detail = safeError(stderr || child.error?.message || '');
          const quota = isQuotaFailure(summary, `${detail}\n${output.slice(-1800)}`);

          if (child.status === 0 && !child.error) break;
          if (quota && attempts < 2) {
            result.quota_paused += 1;
            result.note = `Gemini quota/rate limit in ${batch.sectionKey}; waited and retried this batch.`;
            console.log(`Factory batch ${index + 1}: provider limited; waiting ${quotaRetryMs}ms before one retry.`);
            await sleep(quotaRetryMs);
            continue;
          }
          if (quota) {
            result.quota_paused += 1;
            result.note = `Gemini quota/rate limit in ${batch.sectionKey}; this batch will be retried on the next scheduled run.`;
          } else {
            result.note = child.error
              ? describeFactoryProcessError({ ...child.error, stderr, stdout: output }, 15 * 60 * 1000, key)
              : detail || 'Generator exited unsuccessfully';
          }
          break;
        }
        if (index < batches.length - 1 && batchPauseMs > 0) await sleep(batchPauseMs);
      }
      result.status = result.quota_paused > 0 ? 'quota_paused' : 'completed';
    }
  } catch (error) {
    result.status = 'failed';
    result.note = redactFactoryError(error.message, key);
    console.log('Factory failed:', result.note);
    process.exitCode = 1;
  } finally {
    await db.query('update content_factory_runs set finished_at=now(),status=$2,inserted=$3,rejected=$4,skipped=$5,quota_paused=$6,note=$7 where id=$1', [runId, result.status, result.inserted, result.rejected, result.skipped, result.quota_paused, result.note]);
    console.log(JSON.stringify({ runId, generationModel: 'gemini-3-flash-preview', reviewModel: 'gemini-2.5-flash', status: result.status, requested: limit, manualTestPlan, inserted: result.inserted, rejected: result.rejected, skipped: result.skipped, quota_paused: result.quota_paused, note: result.note }));
  }
} finally {
  await db.end();
}
