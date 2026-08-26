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
  const runState = createProviderRunState(["groq", "gemini"]);
  const result = await executeProviderOperation({
    runState,
    operation: "generation:test",
    primary: { provider: "groq", model: "g1" },
    fallback: { provider: "gemini", model: "g2" },
    perform: async ({ provider }) => ({ providerUsed: provider }),
  });

  assert.equal(result.providerUsed, "groq");
  assert.equal(runState.events.at(-1)?.state, "success");
});

test("Groq temporary 429 retries and succeeds", async () => {
  const runState = createProviderRunState(["groq", "gemini"]);
  const waitRecorder = createWaitRecorder();
  let attempts = 0;

  const result = await executeProviderOperation({
    runState,
    operation: "review:test",
    primary: { provider: "groq", model: "g1" },
    fallback: { provider: "gemini", model: "g2" },
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
  const runState = createProviderRunState(["groq", "gemini"]);
  const waitRecorder = createWaitRecorder();

  const result = await executeProviderOperation({
    runState,
    operation: "review:test",
    primary: { provider: "groq", model: "g1" },
    fallback: { provider: "gemini", model: "g2" },
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
  const runState = createProviderRunState(["gemini"]);
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
  const runState = createProviderRunState(["groq", "gemini"]);

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

test("both providers unavailable stops batch immediately", async () => {
  const runState = createProviderRunState(["groq", "gemini"]);

  await assert.rejects(
    () =>
      executeProviderOperation({
        runState,
        operation: "generation:test",
        primary: { provider: "groq", model: "g1" },
        fallback: { provider: "gemini", model: "g2" },
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
  const runState = createProviderRunState(["groq", "gemini"]);

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
    perform: async ({ provider }) => ({ providerUsed: provider }),
  });

  assert.equal(result.providerUsed, "groq");
});
