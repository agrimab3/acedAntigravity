import { getServerSession, type NextAuthOptions } from "next-auth";
import type { Account, User } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getDb } from "@/lib/db";
import { userIdentities, users } from "@/db/schema";

async function syncSignedInUser(user: User, account?: Account | null) {
  if (!user.email) {
    return null;
  }

  const db = getDb();
  if (!db) {
    return null;
  }

  const now = new Date();
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
  providers: googleProviderReady
    ? [
        GoogleProvider({
          clientId: process.env.AUTH_GOOGLE_ID as string,
          clientSecret: process.env.AUTH_GOOGLE_SECRET as string,
        }),
      ]
    : [],
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
