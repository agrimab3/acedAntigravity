export class StructuredOutputError extends Error {
  constructor(message, { rawOutput = "", failedCheck = "Structured output could not be parsed." } = {}) {
    super(message);
    this.name = "StructuredOutputError";
    this.rawOutputPreview = String(rawOutput ?? "").slice(0, 300);
    this.failedCheck = failedCheck;
  }
}

/**
 * Providers are asked for JSON-schema constrained responses, but a transport-successful
 * response can still fail local JSON or Zod validation. Retry that exact operation once
 * before treating it as a format failure. Provider/transport errors are left to the
 * normal provider-resilience layer.
 */
export async function parseStructuredOutputWithOneRetry({ request, parse, label = "Structured output" }) {
  let lastError = null;
  let lastRawOutput = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const rawOutput = await request();
    try {
      return { value: parse(rawOutput), rawOutput, attempts: attempt };
    } catch (error) {
      lastError = error;
      lastRawOutput = rawOutput;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "Unknown local schema error.";
  throw new StructuredOutputError(`${label} failed after one format retry: ${detail}`, {
    rawOutput: lastRawOutput,
    failedCheck: detail,
  });
}

export function previewRawModelOutput(value) {
  return String(value ?? "").slice(0, 300);
}
