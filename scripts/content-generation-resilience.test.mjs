import test from "node:test";
import assert from "node:assert/strict";
import {
  ProviderRequestError,
  ProviderRunStoppedError,
  classifyProviderFailure,
  createProviderRunState,
  executeProviderOperation,
  summarizeProviderAvailability,
} from "../lib/content-generation-resilience.mjs";

function createWaitRecorder() {
  const waits = [];
  let currentTime = 0;

  return {
    waits,
    wait: async (ms) => {
      waits.push(ms);
      currentTime += ms;
    },
    now: () => currentTime,
  };
}

test("Groq succeeds normally", async () => {
  const runState = createProviderRunState(["groq", "gemini", "openrouter"]);
  const result = await executeProviderOperation({
    runState,
    operation: "generation:test",
    primary: { provider: "groq", model: "g1" },
    fallback: { provider: "gemini", model: "g2" },
    fallbacks: [{ provider: "openrouter", model: "g3" }],
    perform: async ({ provider }) => ({ providerUsed: provider }),
  });

  assert.equal(result.providerUsed, "groq");
  assert.equal(runState.events.at(-1)?.state, "success");
});

test("Groq temporary 429 retries and succeeds", async () => {
  const runState = createProviderRunState(["groq", "gemini", "openrouter"]);
  const waitRecorder = createWaitRecorder();
  let attempts = 0;

  const result = await executeProviderOperation({
    runState,
    operation: "review:test",
    primary: { provider: "groq", model: "g1" },
    fallback: { provider: "gemini", model: "g2" },
    fallbacks: [{ provider: "openrouter", model: "g3" }],
    defaultRetryDelayMs: 15000,
    wait: waitRecorder.wait,
    now: waitRecorder.now,
    perform: async ({ provider }) => {
      attempts += 1;

      if (provider === "groq" && attempts === 1) {
        throw new ProviderRequestError("Groq request failed: Please retry in 25s", {
          provider: "groq",
          statusCode: 429,
          retryAfterMs: 25000,
          classification: classifyProviderFailure({
            message: "Please retry in 25s",
            statusCode: 429,
            retryAfterMs: 25000,
          }),
        });
      }

      return { providerUsed: provider };
    },
  });

  assert.equal(result.providerUsed, "groq");
  assert.deepEqual(waitRecorder.waits, [26000]);
});

test("Groq repeated rate limit falls back to Gemini", async () => {
  const runState = createProviderRunState(["groq", "gemini", "openrouter"]);
  const waitRecorder = createWaitRecorder();

  const result = await executeProviderOperation({
    runState,
    operation: "review:test",
    primary: { provider: "groq", model: "g1" },
    fallback: { provider: "gemini", model: "g2" },
    fallbacks: [{ provider: "openrouter", model: "g3" }],
    maxRetries: 2,
    defaultRetryDelayMs: 1000,
    wait: waitRecorder.wait,
    now: waitRecorder.now,
    perform: async ({ provider }) => {
      if (provider === "groq") {
        throw new ProviderRequestError("Groq request failed: rate limit", {
          provider: "groq",
          statusCode: 429,
          retryAfterMs: 1000,
          classification: classifyProviderFailure({
            message: "rate limit",
            statusCode: 429,
            retryAfterMs: 1000,
          }),
        });
      }

      return { providerUsed: provider };
    },
  });

  assert.equal(result.providerUsed, "gemini");
  assert.equal(result.usedFallback, true);
});

test("Gemini temporary quota timing retries and succeeds", async () => {
  const runState = createProviderRunState(["gemini", "openrouter"]);
  const waitRecorder = createWaitRecorder();
  let attempts = 0;

  const result = await executeProviderOperation({
    runState,
    operation: "review:test",
    primary: { provider: "gemini", model: "gemini-2.5-flash-lite" },
    maxRetries: 2,
    defaultRetryDelayMs: 30000,
    wait: waitRecorder.wait,
    now: waitRecorder.now,
    perform: async () => {
      attempts += 1;

      if (attempts === 1) {
        throw new ProviderRequestError("Gemini request failed: retry in 30s", {
          provider: "gemini",
          statusCode: 429,
          retryAfterMs: 30000,
          classification: classifyProviderFailure({
            message: "retry in 30s",
            statusCode: 429,
            retryAfterMs: 30000,
          }),
        });
      }

      return { ok: true };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(waitRecorder.waits, [31000]);
});

test("Gemini hard quota disables Gemini for remainder of run", async () => {
  const runState = createProviderRunState(["groq", "gemini", "openrouter"]);

  await assert.rejects(
    () =>
      executeProviderOperation({
        runState,
        operation: "review:test",
        primary: { provider: "gemini", model: "gemini-2.5-flash-lite" },
        perform: async () => {
          throw new ProviderRequestError("Gemini request failed: quota exceeded", {
            provider: "gemini",
            statusCode: 429,
            classification: classifyProviderFailure({
              message: "quota exceeded",
              statusCode: 429,
            }),
          });
        },
      }),
    ProviderRunStoppedError
  );

  const availability = summarizeProviderAvailability(runState);
  const geminiSnapshot = availability.providers.find((provider) => provider.provider === "gemini");
  assert.equal(geminiSnapshot?.state, "disabled");
});

test("Groq and Gemini failure falls through to OpenRouter", async () => {
  const runState = createProviderRunState(["groq", "gemini", "openrouter"]);

  const result = await executeProviderOperation({
    runState,
    operation: "generation:test",
    primary: { provider: "groq", model: "g1" },
    fallback: { provider: "gemini", model: "g2" },
    fallbacks: [{ provider: "openrouter", model: "g3" }],
    perform: async ({ provider }) => {
      if (provider === "groq" || provider === "gemini") {
        throw new ProviderRequestError(`${provider} request failed: quota exceeded`, {
          provider,
          statusCode: 429,
          classification: classifyProviderFailure({
            message: "quota exceeded",
            statusCode: 429,
          }),
        });
      }

      return { providerUsed: provider };
    },
  });

  assert.equal(result.providerUsed, "openrouter");
  assert.equal(result.usedFallback, true);
});

test("all three providers unavailable stops batch cleanly", async () => {
  const runState = createProviderRunState(["groq", "gemini", "openrouter"]);

  await assert.rejects(
    () =>
      executeProviderOperation({
        runState,
        operation: "generation:test",
        primary: { provider: "groq", model: "g1" },
        fallback: { provider: "gemini", model: "g2" },
        fallbacks: [{ provider: "openrouter", model: "g3" }],
        perform: async ({ provider }) => {
          throw new ProviderRequestError(`${provider} unavailable`, {
            provider,
            statusCode: 429,
            classification: classifyProviderFailure({
              message: "quota exceeded",
              statusCode: 429,
            }),
          });
        },
      }),
    ProviderRunStoppedError
  );

  assert.equal(summarizeProviderAvailability(runState).allProvidersUnavailable, true);
});

test("provider marked disabled is skipped on later operations", async () => {
  const runState = createProviderRunState(["groq", "gemini", "openrouter"]);

  await assert.rejects(
    () =>
      executeProviderOperation({
        runState,
        operation: "review:first",
        primary: { provider: "gemini", model: "g2" },
        perform: async () => {
          throw new ProviderRequestError("Gemini request failed: quota exceeded", {
            provider: "gemini",
            statusCode: 429,
            classification: classifyProviderFailure({
              message: "quota exceeded",
              statusCode: 429,
            }),
          });
        },
      }),
    ProviderRunStoppedError
  );

  const result = await executeProviderOperation({
    runState,
    operation: "review:second",
    primary: { provider: "gemini", model: "g2" },
    fallback: { provider: "groq", model: "g1" },
    fallbacks: [{ provider: "openrouter", model: "g3" }],
    perform: async ({ provider }) => ({ providerUsed: provider }),
  });

  assert.equal(result.providerUsed, "groq");
});

test("hard quota disables a provider for the run and later falls through to OpenRouter", async () => {
  const runState = createProviderRunState(["groq", "gemini", "openrouter"]);

  await assert.rejects(
    () =>
      executeProviderOperation({
        runState,
        operation: "generation:first",
        primary: { provider: "groq", model: "g1" },
        perform: async ({ provider }) => {
          throw new ProviderRequestError("Groq request failed: quota exceeded", {
            provider,
            statusCode: 429,
            classification: classifyProviderFailure({
              message: "quota exceeded",
              statusCode: 429,
            }),
          });
        },
      }),
    ProviderRunStoppedError
  );

  const result = await executeProviderOperation({
    runState,
    operation: "generation:second",
    primary: { provider: "groq", model: "g1" },
    fallback: { provider: "gemini", model: "g2" },
    fallbacks: [{ provider: "openrouter", model: "g3" }],
    perform: async ({ provider }) => {
      if (provider === "gemini") {
        throw new ProviderRequestError("Gemini request failed: quota exceeded", {
          provider,
          statusCode: 429,
          classification: classifyProviderFailure({
            message: "quota exceeded",
            statusCode: 429,
          }),
        });
      }

      return { providerUsed: provider };
    },
  });

  assert.equal(result.providerUsed, "openrouter");
});

test("partial progress survives provider transition", async () => {
  const runState = createProviderRunState(["groq", "gemini", "openrouter"]);
  const completed = [];

  const first = await executeProviderOperation({
    runState,
    operation: "generation:item-1",
    primary: { provider: "groq", model: "g1" },
    fallback: { provider: "gemini", model: "g2" },
    fallbacks: [{ provider: "openrouter", model: "g3" }],
    perform: async ({ provider }) => ({ providerUsed: provider, itemId: 1 }),
  });
  completed.push(first.itemId);

  const second = await executeProviderOperation({
    runState,
    operation: "generation:item-2",
    primary: { provider: "groq", model: "g1" },
    fallback: { provider: "gemini", model: "g2" },
    fallbacks: [{ provider: "openrouter", model: "g3" }],
    perform: async ({ provider }) => {
      if (provider === "groq" || provider === "gemini") {
        throw new ProviderRequestError(`${provider} request failed: quota exceeded`, {
          provider,
          statusCode: 429,
          classification: classifyProviderFailure({
            message: "quota exceeded",
            statusCode: 429,
          }),
        });
      }

      return { providerUsed: provider, itemId: 2 };
    },
  });
  completed.push(second.itemId);

  assert.deepEqual(completed, [1, 2]);
  assert.equal(second.providerUsed, "openrouter");
});
