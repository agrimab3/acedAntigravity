// Shared process budgets: passage reviews can require several generation/review rounds.
export const FACTORY_JOB_TIMEOUT_MS = 15 * 60 * 1000;
export const FACTORY_BATCH_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export function redactFactoryError(value, key = "") {
  let text = String(value ?? "");
  if (key) text = text.replaceAll(key, "[REDACTED]");
  return text.replace(/AIza[\w-]+/g, "[REDACTED]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]");
}

export function describeFactoryProcessError(error, timeoutMs, key = "") {
  const timedOut = error?.killed && error?.signal === "SIGTERM";
  const headline = timedOut
    ? `Generator timed out after ${timeoutMs / 1000}s (SIGTERM); partial progress may not have a final summary.`
    : `Generator failed: ${error?.message || "unknown generation error"}`;
  const tail = String(error?.stderr || error?.stdout || "").slice(-900);
  // Keep the cause first, rather than truncating it away in favor of progress output.
  return redactFactoryError(`${headline}\n${tail}`, key).slice(0, 1400);
}
