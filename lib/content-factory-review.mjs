import { ProviderRunStoppedError } from './content-generation-resilience.mjs';

export const FACTORY_REVIEW_MODELS = Object.freeze([
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite-preview',
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
    for (const model of FACTORY_REVIEW_MODELS) {
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
    /^Factory review audit: candidate=[a-f0-9-]+ stage=(primary|verifier) model=[a-z0-9.-]+$/.test(line)
  );
}
