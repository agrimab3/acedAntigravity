export class ProviderRequestError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ProviderRequestError";
    this.provider = options.provider ?? null;
    this.statusCode = options.statusCode ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.classification = options.classification ?? null;
  }
}

export class ProviderRunStoppedError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ProviderRunStoppedError";
    this.provider = options.provider ?? null;
    this.operation = options.operation ?? null;
    this.classification = options.classification ?? null;
    this.progress = options.progress ?? null;
  }
}

export function parseRetryAfterMs(value) {
  if (!value) {
    return null;
  }

  const numericSeconds = Number(value);

  if (Number.isFinite(numericSeconds)) {
    return Math.max(0, Math.ceil(numericSeconds * 1000));
  }

  const parsedDate = Date.parse(value);

  if (Number.isNaN(parsedDate)) {
    return null;
  }

  return Math.max(0, parsedDate - Date.now());
}

export function extractRetryDelayMs(message) {
  if (!message) {
    return null;
  }

  const retryInMatch = String(message).match(/(?:please\s+)?retry(?:ing)?\s+in\s+([\d.]+)s/i);

  if (retryInMatch) {
    return Math.ceil(Number(retryInMatch[1]) * 1000);
  }

  const retryAfterMatch = String(message).match(/retry[- ]after[: ]+([\d.]+)\s*(ms|s|seconds?)/i);

  if (!retryAfterMatch) {
    return null;
  }

  const count = Number(retryAfterMatch[1]);

  if (!Number.isFinite(count)) {
    return null;
  }

  return retryAfterMatch[2].toLowerCase().startsWith("ms")
    ? Math.ceil(count)
    : Math.ceil(count * 1000);
}

export function classifyProviderFailure({ message, statusCode = null, retryAfterMs = null }) {
  const normalizedMessage = String(message || "").toLowerCase();
  const inferredRetryAfterMs = retryAfterMs ?? extractRetryDelayMs(normalizedMessage);

  if (
    /quota exceeded|daily quota|billing details|free_tier_requests|resource_exhausted|insufficient_quota|quota has been exceeded|exceeded your current quota/i.test(
      normalizedMessage
    )
  ) {
    return {
      kind: "hard-quota",
      retryable: false,
      disableForRun: true,
      retryAfterMs: inferredRetryAfterMs,
    };
  }

  if (/invalid api key|unauthorized|forbidden|permission denied|access denied|authentication/i.test(normalizedMessage)) {
    return {
      kind: "hard-unavailable",
      retryable: false,
      disableForRun: true,
      retryAfterMs: inferredRetryAfterMs,
    };
  }

  if (
    statusCode === 429 ||
    /rate limit|rate_limit|too many requests|capacity_exceeded|temporarily unavailable|try again later|retry in/i.test(
      normalizedMessage
    )
  ) {
    return {
      kind: "temporary-rate-limit",
      retryable: true,
      disableForRun: false,
      retryAfterMs: inferredRetryAfterMs,
    };
  }

  if (statusCode !== null && statusCode >= 500) {
    return {
      kind: "temporary-transient",
      retryable: true,
      disableForRun: false,
      retryAfterMs: inferredRetryAfterMs,
    };
  }

  return {
    kind: "unknown",
    retryable: false,
    disableForRun: false,
    retryAfterMs: inferredRetryAfterMs,
  };
}

export function createProviderRunState(providers = []) {
  return {
    providers: Object.fromEntries(
      providers.map((provider) => [
        provider,
        {
          disabled: false,
          cooldownUntil: 0,
          lastFailureKind: null,
          lastMessage: null,
        },
      ])
    ),
    events: [],
  };
}

export function recordProviderEvent(runState, event) {
  runState.events.push({
    at: new Date().toISOString(),
    ...event,
  });
}

export function getProviderSnapshot(runState, provider, now = Date.now()) {
  const snapshot = runState.providers[provider];

  if (!snapshot) {
    return {
      provider,
      state: "unconfigured",
      disabled: true,
      cooldownRemainingMs: null,
      lastFailureKind: "unconfigured",
      lastMessage: null,
    };
  }

  if (snapshot.disabled) {
    return {
      provider,
      state: "disabled",
      disabled: true,
      cooldownRemainingMs: null,
      lastFailureKind: snapshot.lastFailureKind,
      lastMessage: snapshot.lastMessage,
    };
  }

  if (snapshot.cooldownUntil > now) {
    return {
      provider,
      state: "cooldown",
      disabled: false,
      cooldownRemainingMs: snapshot.cooldownUntil - now,
      lastFailureKind: snapshot.lastFailureKind,
      lastMessage: snapshot.lastMessage,
    };
  }

  return {
    provider,
    state: "available",
    disabled: false,
    cooldownRemainingMs: 0,
    lastFailureKind: snapshot.lastFailureKind,
    lastMessage: snapshot.lastMessage,
  };
}

export function markProviderCooldown(runState, provider, { retryAfterMs, message, failureKind }, now = Date.now()) {
  const snapshot = runState.providers[provider];

  if (!snapshot) {
    return;
  }

  snapshot.cooldownUntil = Math.max(snapshot.cooldownUntil, now + Math.max(0, retryAfterMs ?? 0));
  snapshot.lastFailureKind = failureKind;
  snapshot.lastMessage = message;
}

export function markProviderDisabled(runState, provider, { message, failureKind }) {
  const snapshot = runState.providers[provider];

  if (!snapshot) {
    return;
  }

  snapshot.disabled = true;
  snapshot.cooldownUntil = 0;
  snapshot.lastFailureKind = failureKind;
  snapshot.lastMessage = message;
}

export function clearProviderCooldown(runState, provider) {
  const snapshot = runState.providers[provider];

  if (!snapshot || snapshot.disabled) {
    return;
  }

  snapshot.cooldownUntil = 0;
}

export function summarizeProviderAvailability(runState, now = Date.now()) {
  const providerSummaries = Object.keys(runState.providers).map((provider) =>
    getProviderSnapshot(runState, provider, now)
  );

  return {
    providers: providerSummaries,
    allProvidersUnavailable:
      providerSummaries.length > 0 &&
      providerSummaries.every((provider) => provider.state !== "available"),
  };
}

export async function executeProviderOperation({
  runState,
  operation,
  primary,
  fallback = null,
  fallbacks = [],
  maxRetries = 2,
  defaultRetryDelayMs = 15000,
  perform,
  wait = async (ms) => {
    if (ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  },
  now = () => Date.now(),
}) {
  const seenProviders = new Set();
  const candidates = [];

  for (const candidate of [primary, fallback, ...fallbacks]) {
    if (!candidate?.provider || !candidate?.model || seenProviders.has(candidate.provider)) {
      continue;
    }

    seenProviders.add(candidate.provider);
    candidates.push(candidate);
  }

  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    let attempt = 0;

    while (attempt < maxRetries) {
      const providerSnapshot = getProviderSnapshot(runState, candidate.provider, now());

      if (providerSnapshot.state === "disabled") {
        recordProviderEvent(runState, {
          operation,
          provider: candidate.provider,
          state: "skipped-disabled",
          message: providerSnapshot.lastMessage,
        });
        break;
      }

      if (providerSnapshot.state === "cooldown") {
        recordProviderEvent(runState, {
          operation,
          provider: candidate.provider,
          state: "waiting",
          retryAfterMs: providerSnapshot.cooldownRemainingMs,
          message: `Waiting for ${candidate.provider} retry window.`,
        });
        await wait(providerSnapshot.cooldownRemainingMs ?? defaultRetryDelayMs);
        continue;
      }

      try {
        attempt += 1;
        const result = await perform(candidate);
        clearProviderCooldown(runState, candidate.provider);
        recordProviderEvent(runState, {
          operation,
          provider: candidate.provider,
          model: candidate.model,
          state: attempt > 1 ? "recovered" : index > 0 ? "fallback-success" : "success",
          attempt,
        });
        return {
          ...result,
          provider: candidate.provider,
          model: candidate.model,
          attempt,
          usedFallback: index > 0,
        };
      } catch (error) {
        const normalizedError =
          error instanceof ProviderRequestError
            ? error
            : new ProviderRequestError(error instanceof Error ? error.message : "Provider operation failed.", {
                provider: candidate.provider,
              });
        const classification =
          normalizedError.classification ||
          classifyProviderFailure({
            message: normalizedError.message,
            statusCode: normalizedError.statusCode,
            retryAfterMs: normalizedError.retryAfterMs,
          });
        normalizedError.classification = classification;
        lastError = normalizedError;

        if (classification.retryable && attempt < maxRetries) {
          const retryAfterMs = classification.retryAfterMs ?? defaultRetryDelayMs;
          markProviderCooldown(
            runState,
            candidate.provider,
            {
              retryAfterMs,
              message: normalizedError.message,
              failureKind: classification.kind,
            },
            now()
          );
          recordProviderEvent(runState, {
            operation,
            provider: candidate.provider,
            model: candidate.model,
            state: "retrying",
            attempt,
            retryAfterMs,
            message: normalizedError.message,
          });
          await wait(retryAfterMs + 1000);
          continue;
        }

        if (classification.disableForRun) {
          markProviderDisabled(runState, candidate.provider, {
            message: normalizedError.message,
            failureKind: classification.kind,
          });
        } else if (classification.retryAfterMs) {
          markProviderCooldown(
            runState,
            candidate.provider,
            {
              retryAfterMs: classification.retryAfterMs,
              message: normalizedError.message,
              failureKind: classification.kind,
            },
            now()
          );
        }

        recordProviderEvent(runState, {
          operation,
          provider: candidate.provider,
          model: candidate.model,
          state: classification.disableForRun ? "disabled" : "failed",
          attempt,
          message: normalizedError.message,
          failureKind: classification.kind,
        });
        break;
      }
    }
  }

  const availability = summarizeProviderAvailability(runState, now());

  throw new ProviderRunStoppedError(
    lastError?.message || "No provider is currently usable for this operation.",
    {
      provider: lastError?.provider ?? null,
      operation,
      classification:
        lastError?.classification ||
        (availability.allProvidersUnavailable
          ? { kind: "providers-unavailable", disableForRun: true, retryable: false, retryAfterMs: null }
          : null),
    }
  );
}
