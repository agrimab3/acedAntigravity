import { ProviderRunStoppedError } from './content-generation-resilience.mjs';

export const FACTORY_REVIEW_MODELS = Object.freeze([
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite-preview',
]);

// The writer uses the stronger Flash model first. These are Gemini model
// fallbacks, not a relaxation of the review gate: every generated item still
// goes through the same deterministic, primary, and blind checks.
export const FACTORY_GENERATION_MODELS = Object.freeze([
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash',
]);

// The blind answer check starts with the strongest configured Gemini model.
// A 429 moves immediately to the established review chain; non-quota failures
// remain terminal rather than silently weakening the verification.
export const FACTORY_BLIND_VERIFIER_MODELS = Object.freeze([
  'gemini-3.1-pro-preview',
  ...FACTORY_REVIEW_MODELS,
]);

// Model quotas must not disable the Gemini generation provider.
export function createFactoryReviewRunner() {
  const exhaustedModels = new Set();
  return async function run({ operation, perform, runState, onEvent }) {
    const emit = (event) => {
      const entry = { at: new Date().toISOString(), operation, provider: 'gemini', ...event };
      runState?.events.push(entry);
      onEvent?.(entry);
    };
    let lastQuota;
    const models = operation.startsWith('blind-verify:')
      ? FACTORY_BLIND_VERIFIER_MODELS
      : operation.startsWith('generation:')
        ? FACTORY_GENERATION_MODELS
        : FACTORY_REVIEW_MODELS;
    for (const model of models) {
      if (exhaustedModels.has(model)) {
        emit({ model, state: 'skipped-model-quota' });
        continue;
      }
      emit({ model, state: 'attempting' });
      try {
        const result = await perform({ provider: 'gemini', model });
        emit({ model, state: 'success' });
        return { ...result, provider: 'gemini', model };
      } catch (error) {
        if (error?.statusCode !== 429 && error?.classification?.kind !== 'hard-quota') throw error;
        lastQuota = error;
        exhaustedModels.add(model);
        emit({ model, state: 'model-quota', statusCode: error.statusCode ?? 429 });
      }
    }
    throw new ProviderRunStoppedError('All content factory Gemini review models exhausted their quota.', {
      provider: 'gemini',
      operation,
      classification: lastQuota?.classification ?? { kind: 'hard-quota', retryable: false, disableForRun: false },
    });
  };
}

// Forward only structured IDs/stages/models; never raw provider output or prompts.
export function factoryReviewAuditLines(output) {
  return String(output || '').split('\n').filter(line =>
    /^Factory review audit: candidate=[a-f0-9-]+ stage=(primary|verifier) model=[a-z0-9.-]+$/.test(line) ||
    /^Factory blind check: candidate=[a-f0-9-]+ key=[A-D] chosen=[A-D] model=[a-z0-9.-]+$/.test(line)
  );
}
