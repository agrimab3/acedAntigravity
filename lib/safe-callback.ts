export function sanitizeInternalCallbackUrl(
  value: string | null | undefined,
  fallback = "/"
) {
  if (!value || value.includes("\\")) return fallback;

  try {
    const parsed = new URL(value, "https://aced.local");
    if (parsed.origin !== "https://aced.local") return fallback;
    if (!parsed.pathname.startsWith("/")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
