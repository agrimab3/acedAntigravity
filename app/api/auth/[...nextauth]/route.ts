import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit, getRequestNetworkIdentity, RATE_LIMITS } from "@/lib/rate-limit";

const handler = NextAuth(authOptions);

export { handler as GET };

export async function POST(request: Request) {
  const identity = getRequestNetworkIdentity(request);
  const limit = consumeRateLimit(`login:${identity}`, RATE_LIMITS.login);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in tries. Wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  return handler(request as never);
}
