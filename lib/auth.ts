import { getServerSession, type NextAuthOptions } from "next-auth";
import type { Account, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { getDb } from "@/lib/db";
import { userIdentities, users } from "@/db/schema";
import { MOCK_TEST_DEV_PROVIDER_ID, MOCK_TEST_STUDENTS } from "@/lib/mockTest/testStudents";

export const DEV_LOGIN_PROVIDER_ID = MOCK_TEST_DEV_PROVIDER_ID;
const DEV_TEST_USER = {
  id: "local-dev-test-user",
  email: "local-test-user@aced.local",
  name: "Local Test User",
};

export const DEV_TEST_USER_EMAIL = DEV_TEST_USER.email;

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

type LocalRequestHeaders = Headers | Record<string, string | string[] | undefined>;

export function isLocalDevelopmentRequest(headers?: LocalRequestHeaders) {
  if (!headers) {
    return false;
  }

  const host = headers instanceof Headers ? headers.get("host") : headers.host;
  const forwardedHost =
    headers instanceof Headers ? headers.get("x-forwarded-host") : headers["x-forwarded-host"];
  const value = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost ?? (Array.isArray(host) ? host[0] : host);

  if (!value) {
    return false;
  }

  try {
    return isLocalHostname(new URL(`http://${value}`).hostname);
  } catch {
    return false;
  }
}

export function isLocalDevTestUser(email: string | null | undefined, headers?: LocalRequestHeaders) {
  return isDevLoginEnabled() && email === DEV_TEST_USER_EMAIL && isLocalDevelopmentRequest(headers);
}


function isMockTestTestAuthEnabled() {
  if (process.env.NODE_ENV === "production" || process.env.MOCK_TEST_AUTH_MODE !== "test") {
    return false;
  }

  try {
    return isLocalHostname(new URL(process.env.NEXTAUTH_URL ?? "").hostname);
  } catch {
    return false;
  }
}

export function isDevLoginEnabled() {
  if (process.env.NODE_ENV !== "development" || process.env.ALLOW_DEV_LOGIN !== "true") {
    return false;
  }

  try {
    return isLocalHostname(new URL(process.env.NEXTAUTH_URL ?? "").hostname);
  } catch {
    return false;
  }
}

async function syncSignedInUser(user: User, account?: Account | null) {
  if (!user.email) {
    return null;
  }

  const db = getDb();
  if (!db) {
    return null;
  }

  const now = new Date();
  const isLocalTestLogin =
    account?.provider === DEV_LOGIN_PROVIDER_ID &&
    (user.email === DEV_TEST_USER_EMAIL || user.email.endsWith("@aced.test"));
  const [appUser] = await db
    .insert(users)
    .values({
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name: user.name ?? null,
        image: user.image ?? null,
        updatedAt: now,
        ...(isLocalTestLogin
          ? {
              preferredName: null,
              gradeLevel: null,
              actTestDate: null,
              previousActScore: null,
              hasRecommendations: null,
              onboardingCompletedAt: null,
              walkthroughCompletedAt: null,
            }
          : {}),
      },
    })
    .returning({
      id: users.id,
    });

  if (account) {
    await db
      .insert(userIdentities)
      .values({
        userId: appUser.id,
        provider: account.provider,
        providerUserId: account.providerAccountId,
        providerEmail: user.email,
      })
      .onConflictDoUpdate({
        target: [userIdentities.provider, userIdentities.providerUserId],
        set: {
          userId: appUser.id,
          providerEmail: user.email,
          updatedAt: now,
        },
      });
  }

  return appUser;
}

const googleProviderReady =
  Boolean(process.env.AUTH_GOOGLE_ID) && Boolean(process.env.AUTH_GOOGLE_SECRET);

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
  providers: [
    ...(googleProviderReady
      ? [
          GoogleProvider({
            clientId: process.env.AUTH_GOOGLE_ID as string,
            clientSecret: process.env.AUTH_GOOGLE_SECRET as string,
          }),
        ]
      : []),
    ...(isDevLoginEnabled() || isMockTestTestAuthEnabled()
      ? [
          CredentialsProvider({
            id: DEV_LOGIN_PROVIDER_ID,
            name: "Local Test User",
            credentials: {
              student: { label: "Test student", type: "text" },
            },
            async authorize(credentials, request) {
              if (!isLocalDevelopmentRequest(request.headers)) {
                return null;
              }

              const requestedStudent = credentials?.student;
              if (requestedStudent && isMockTestTestAuthEnabled()) {
                const student = MOCK_TEST_STUDENTS.find(
                  (candidate) => candidate.email === requestedStudent
                );
                return student ?? null;
              }

              if (!isDevLoginEnabled()) {
                return null;
              }

              return DEV_TEST_USER;
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user?.email) {
        const syncedUser = await syncSignedInUser(user, account);
        if (syncedUser?.id) {
          token.appUserId = syncedUser.id;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id =
          typeof token.appUserId === "string" ? token.appUserId : token.sub ?? "";
      }

      return session;
    },
  },
};

export function getAuthSession() {
  return getServerSession(authOptions);
}
