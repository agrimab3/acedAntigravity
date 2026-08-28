export const DEFAULT_OPENROUTER_GENERATION_MODEL = "openai/gpt-4.1-mini";
export const DEFAULT_OPENROUTER_REVIEW_MODEL = "openai/gpt-4.1-mini";

function normalizeModel(value?: string | null) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function resolvePreferredOpenRouterGenerationModel(
  ...candidates: Array<string | null | undefined>
) {
  for (const candidate of candidates) {
    const normalized = normalizeModel(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_OPENROUTER_GENERATION_MODEL;
}

export function resolvePreferredOpenRouterReviewModel(
  ...candidates: Array<string | null | undefined>
) {
  for (const candidate of candidates) {
    const normalized = normalizeModel(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_OPENROUTER_REVIEW_MODEL;
}
