import crypto from "node:crypto";

type Bucket = { windowStart: number; count: number };
type Store = Map<string, Bucket>;

const globalStore = globalThis as typeof globalThis & { __acedRateLimitStore?: Store };
const store: Store = globalStore.__acedRateLimitStore ?? new Map();
if (process.env.NODE_ENV !== "production") globalStore.__acedRateLimitStore = store;

export type RateLimitPolicy = { limit: number; windowMs: number };
export const RATE_LIMITS = {
  tutor: { limit: 30, windowMs: 60 * 60_000 },
  checkout: { limit: 5, windowMs: 60_000 },
  waitlist: { limit: 5, windowMs: 60_000 },
  login: { limit: 12, windowMs: 60_000 },
} satisfies Record<string, RateLimitPolicy>;

export function consumeRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
  targetStore: Store = store
) {
  const current = targetStore.get(key);
  if (!current || now - current.windowStart >= policy.windowMs) {
    targetStore.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: policy.limit - 1, retryAfterSeconds: 0 };
  }
  if (current.count >= policy.limit) {
    const retryAfterMs = Math.max(1, current.windowStart + policy.windowMs - now);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }
  current.count += 1;
  return { allowed: true, remaining: policy.limit - current.count, retryAfterSeconds: 0 };
}

export function rateLimitIdentity(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function getRequestNetworkIdentity(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return rateLimitIdentity(forwarded || realIp || "unknown-network");
}

export function createRateLimitTestStore(): Store {
  return new Map();
}
