export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const FALLBACK_GROQ_MODEL = "openai/gpt-oss-20b";

function normalizeModel(value?: string | null) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function resolvePreferredGroqModel(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    const normalized = normalizeModel(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_GROQ_MODEL;
}

export function resolveGroqFallbackModel(preferredModel: string) {
  return preferredModel === DEFAULT_GROQ_MODEL ? FALLBACK_GROQ_MODEL : DEFAULT_GROQ_MODEL;
}

export function isGroqModelUnavailableError(message: string) {
  return /model .* does not exist|do not have access|model_not_found|unknown model|invalid model/i.test(
    message
  );
}
