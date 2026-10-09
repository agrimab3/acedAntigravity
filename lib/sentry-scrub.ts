const SENSITIVE_KEY = /(?:email|e-mail|name|ip(?:address)?|cookie|authorization|token|password|answer|selectedanswer|tutor|chat|message|passage|prompt|requestbody|body)/i;
const EMAIL_LIKE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

type SentryLikeEvent = Record<string, unknown>;

function stripQuery(value: string) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.split("?")[0]?.split("#")[0] ?? value;
  }
}

function scrubValue(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (SENSITIVE_KEY.test(key)) return "[Filtered]";
  if (typeof value === "string") {
    if (key.toLowerCase() === "url") return stripQuery(value).replace(EMAIL_LIKE, "[Filtered]");
    return value.replace(EMAIL_LIKE, "[Filtered]");
  }
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, key, seen));
  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    output[childKey] = scrubValue(childValue, childKey, seen);
  }
  return output;
}

export function scrubSentryEvent<T extends SentryLikeEvent>(event: T): T {
  const scrubbed = scrubValue(event) as T;
  const record = scrubbed as SentryLikeEvent;
  const user = record.user as Record<string, unknown> | undefined;
  if (user) record.user = user.id ? { id: String(user.id) } : undefined;

  const request = record.request as Record<string, unknown> | undefined;
  if (request) {
    request.data = undefined;
    request.cookies = undefined;
    request.query_string = undefined;
    if (request.url) request.url = stripQuery(String(request.url));
    const headers = request.headers as Record<string, unknown> | undefined;
    if (headers) {
      for (const key of Object.keys(headers)) {
        if (/cookie|authorization|x-forwarded-for|x-real-ip/i.test(key)) delete headers[key];
      }
    }
  }
  return scrubbed;
}
