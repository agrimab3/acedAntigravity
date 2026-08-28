import { DEFAULT_GROQ_MODEL, resolvePreferredGroqModel } from "./groq-models.ts";
import {
  DEFAULT_OPENROUTER_GENERATION_MODEL,
  DEFAULT_OPENROUTER_REVIEW_MODEL,
  resolvePreferredOpenRouterGenerationModel,
  resolvePreferredOpenRouterReviewModel,
} from "./openrouter-models.ts";

export const SUPPORTED_CONTENT_PROVIDERS = ["gemini", "groq", "openrouter", "ollama"];

export function hasConfiguredOllama(env = process.env) {
  return Boolean(
    env.OLLAMA_GENERATION_MODEL ||
      env.OLLAMA_REVIEW_MODEL ||
      env.OLLAMA_MODEL ||
      env.OLLAMA_API_BASE_URL ||
      env.OLLAMA_BASE_URL
  );
}

export function hasConfiguredGemini(env = process.env) {
  return Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
}

export function hasConfiguredGroq(env = process.env) {
  return Boolean(env.GROQ_API_KEY);
}

export function hasConfiguredOpenRouter(env = process.env) {
  return Boolean(
    env.OPENROUTER_API_KEY ||
      env.OPENROUTER_GENERATION_MODEL ||
      env.OPENROUTER_REVIEW_MODEL ||
      env.OPENROUTER_MODEL
  );
}

export function resolveGenerationProvider(rawProvider, env = process.env) {
  const configured =
    rawProvider ||
    env.QUESTION_GENERATION_PROVIDER ||
    env.CONTENT_GENERATION_PROVIDER ||
    (hasConfiguredOllama(env)
      ? "ollama"
      : hasConfiguredGroq(env)
        ? "groq"
        : hasConfiguredGemini(env)
          ? "gemini"
          : hasConfiguredOpenRouter(env)
            ? "openrouter"
            : "gemini");
  const normalized = configured.trim().toLowerCase();

  if (!SUPPORTED_CONTENT_PROVIDERS.includes(normalized)) {
    throw new Error(`Unsupported generation provider: ${normalized}`);
  }

  return normalized;
}

export function resolveReviewProvider(rawProvider, fallbackProvider, env = process.env) {
  const configured =
    rawProvider ||
    env.QUESTION_REVIEW_PROVIDER ||
    env.CONTENT_REVIEW_PROVIDER ||
    fallbackProvider;
  const normalized = configured.trim().toLowerCase();

  if (!SUPPORTED_CONTENT_PROVIDERS.includes(normalized)) {
    throw new Error(`Unsupported review provider: ${normalized}`);
  }

  return normalized;
}

export function resolveGenerationModel(provider, rawModel, env = process.env) {
  if (provider === "groq") {
    return resolvePreferredGroqModel(
      rawModel,
      env.GROQ_GENERATION_MODEL,
      env.GROQ_MODEL,
      DEFAULT_GROQ_MODEL
    );
  }

  if (rawModel?.trim()) {
    return rawModel.trim();
  }

  if (provider === "openrouter") {
    return resolvePreferredOpenRouterGenerationModel(
      rawModel,
      env.OPENROUTER_GENERATION_MODEL,
      env.OPENROUTER_MODEL,
      DEFAULT_OPENROUTER_GENERATION_MODEL
    );
  }

  if (provider === "ollama") {
    return env.OLLAMA_GENERATION_MODEL || env.OLLAMA_MODEL || "gemma3:4b";
  }

  return env.GEMINI_GENERATION_MODEL || env.GEMINI_MODEL || "gemini-2.5-flash-lite";
}

export function resolveReviewModel(provider, rawModel, fallbackModel, env = process.env) {
  if (provider === "groq") {
    return resolvePreferredGroqModel(
      rawModel,
      env.GROQ_REVIEW_MODEL,
      env.GROQ_GENERATION_MODEL,
      env.GROQ_MODEL,
      fallbackModel
    );
  }

  if (rawModel?.trim()) {
    return rawModel.trim();
  }

  if (provider === "openrouter") {
    return resolvePreferredOpenRouterReviewModel(
      rawModel,
      env.OPENROUTER_REVIEW_MODEL,
      env.OPENROUTER_GENERATION_MODEL,
      env.OPENROUTER_MODEL,
      fallbackModel,
      DEFAULT_OPENROUTER_REVIEW_MODEL
    );
  }

  if (provider === "ollama") {
    return env.OLLAMA_REVIEW_MODEL || env.OLLAMA_GENERATION_MODEL || env.OLLAMA_MODEL || fallbackModel;
  }

  return env.GEMINI_REVIEW_MODEL || env.GEMINI_GENERATION_MODEL || env.GEMINI_MODEL || fallbackModel;
}

export function resolveFallbackProviders(primaryProvider, env = process.env) {
  if (primaryProvider === "ollama") {
    return [
      hasConfiguredGemini(env) ? "gemini" : null,
      hasConfiguredGroq(env) ? "groq" : null,
      hasConfiguredOpenRouter(env) ? "openrouter" : null,
    ].filter(Boolean);
  }

  if (hasConfiguredOllama(env)) {
    return ["ollama"];
  }

  if (primaryProvider === "groq") {
    return [
      hasConfiguredGemini(env) ? "gemini" : null,
      hasConfiguredOpenRouter(env) ? "openrouter" : null,
    ].filter(Boolean);
  }

  if (primaryProvider === "gemini") {
    return [
      hasConfiguredGroq(env) ? "groq" : null,
      hasConfiguredOpenRouter(env) ? "openrouter" : null,
    ].filter(Boolean);
  }

  if (primaryProvider === "openrouter") {
    return [
      hasConfiguredGroq(env) ? "groq" : null,
      hasConfiguredGemini(env) ? "gemini" : null,
    ].filter(Boolean);
  }

  return [];
}

export function buildVerifierProviderOrder(
  generationSourceProvider,
  preferredReviewProvider,
  env = process.env
) {
  const configuredOrder =
    generationSourceProvider === "groq"
      ? ["gemini", "openrouter", "groq"]
      : generationSourceProvider === "gemini"
        ? ["groq", "openrouter", "gemini"]
        : generationSourceProvider === "openrouter"
          ? ["groq", "gemini", "openrouter"]
          : [
              preferredReviewProvider,
              ...resolveFallbackProviders(preferredReviewProvider, env),
              generationSourceProvider,
            ];

  return Array.from(
    new Set(
      configuredOrder.filter((provider) => {
        if (!provider) {
          return false;
        }

        if (provider === "groq") {
          return hasConfiguredGroq(env);
        }

        if (provider === "gemini") {
          return hasConfiguredGemini(env);
        }

        if (provider === "openrouter") {
          return hasConfiguredOpenRouter(env);
        }

        return provider === "ollama" ? hasConfiguredOllama(env) : false;
      })
    )
  );
}
