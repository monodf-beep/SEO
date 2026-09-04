import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./db";
import { upsertGoogleAccount } from "./google/google-auth";

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("Missing Google OAuth credentials");
}

const registrationDisabled = process.env.DISABLE_REGISTRATION === "true";

/**
 * Finds the workspace a Google identity belongs to: the user with that
 * e-mail, or the owner of a linked Google account with that e-mail.
 */
export async function findWorkspaceByEmail(email: string) {
  const direct = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (direct) return direct;
  const linked = await db.googleAccount.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { user: true },
  });
  return linked?.user ?? null;
}

/**
 * The Prisma adapter, with one change: a Google identity that was linked to
 * a workspace from the Comptes Google page signs in to that workspace instead
 * of creating an empty one of its own. Auth.js resolves an unknown OAuth
 * account by e-mail through getUserByEmail, so that is the hook.
 */
export function buildAdapter(): Adapter {
  const base = PrismaAdapter(db);
  return {
    ...base,
    async getUserByEmail(email) {
      const user = await findWorkspaceByEmail(email);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        image: user.image,
      };
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: buildAdapter(),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Google verifies e-mail addresses, and linking by e-mail is what lets
      // a second Google identity open the workspace it was linked to.
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/webmasters.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    /** With DISABLE_REGISTRATION=true, only identities that already have a
     *  workspace, directly or as a linked account, may sign in. */
    async signIn({ user, profile }) {
      if (!registrationDisabled) return true;
      const email = profile?.email ?? user.email;
      if (!email) return false;
      return Boolean(await findWorkspaceByEmail(email));
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      // The identity that just authenticated is the OAuth profile's, which is
      // not necessarily the workspace owner's e-mail when a linked account
      // signs in.
      const identityEmail = (profile?.email ?? user.email)?.toLowerCase();
      if (!account?.access_token || !identityEmail || !user.id) return;
      try {
        const tokens = {
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          // account.expires_at is Unix seconds; store ms to match
          // refreshAccessToken() and getAccessToken()'s Date.now() checks.
          expiresAt: account.expires_at ? account.expires_at * 1000 : undefined,
          tokenType: account.token_type,
          scope: account.scope,
        };
        await upsertGoogleAccount(
          user.id,
          {
            email: identityEmail,
            name: profile?.name ?? user.name,
            picture: typeof profile?.picture === "string" ? profile.picture : user.image,
          },
          tokens
        );
        // The login identity's tokens also live on the user row, where the
        // legacy code paths read them.
        if (user.email?.toLowerCase() === identityEmail) {
          await db.user.update({ where: { id: user.id }, data: { googleTokens: tokens } });
        }
      } catch (error) {
        console.error("Failed to save Google tokens:", error);
      }
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "database",
  },
  secret: process.env.NEXTAUTH_SECRET,
});
