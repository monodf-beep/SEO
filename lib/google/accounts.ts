/**
 * Linked Google accounts: listing, the OAuth link flow, and importing sites
 * that another CrawlSEO user with the same Google identity already owns.
 */

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import { upsertGoogleAccount, type GoogleTokens } from "./google-auth";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const SCOPE = "openid email profile https://www.googleapis.com/auth/webmasters.readonly";
const STATE_TTL_MS = 10 * 60 * 1000;

export const LINK_CALLBACK_PATH = "/api/google/link/callback";

/** The public origin Google must redirect back to. */
export function appBaseUrl(req?: Request): string {
  const configured = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (req) return new URL(req.url).origin;
  throw new Error("NEXTAUTH_URL is not set");
}

// ---------------------------------------------------------------------------
// Link flow
// ---------------------------------------------------------------------------

type LinkState = { u: string; t: number; n: string };

export function sealLinkState(userId: string): string {
  const state: LinkState = { u: userId, t: Date.now(), n: randomBytes(8).toString("hex") };
  return encrypt(JSON.stringify(state));
}

export function openLinkState(sealed: string): LinkState | null {
  try {
    const parsed = JSON.parse(decrypt(sealed)) as LinkState;
    if (!parsed.u || !parsed.t || Date.now() - parsed.t > STATE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildLinkUrl(baseUrl: string, userId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${baseUrl}${LINK_CALLBACK_PATH}`,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // select_account lets the user pick a different identity even when one
    // is already signed in to Google; consent guarantees a refresh token.
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state: sealLinkState(userId),
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForAccount(
  userId: string,
  code: string,
  baseUrl: string
): Promise<{ id: string; email: string }> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${baseUrl}${LINK_CALLBACK_PATH}`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    throw new Error(`Échange du code refusé par Google (${tokenRes.status}) ${body.slice(0, 300)}`);
  }
  const t = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };

  const infoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  if (!infoRes.ok) {
    throw new Error(`Impossible de lire l'identité Google (${infoRes.status})`);
  }
  const info = (await infoRes.json()) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!info.email) throw new Error("Google n'a pas renvoyé d'adresse e-mail");

  const tokens: GoogleTokens = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
    tokenType: t.token_type,
    scope: t.scope,
  };

  const account = await upsertGoogleAccount(
    userId,
    { email: info.email, name: info.name, picture: info.picture },
    tokens
  );

  // Linking one's own login identity again is a token refresh for it too.
  const me = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (me?.email.toLowerCase() === info.email.toLowerCase()) {
    await db.user.update({
      where: { id: userId },
      data: { googleTokens: (account.tokens ?? tokens) as object },
    });
  }

  return { id: account.id, email: account.email };
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export type LinkedAccount = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  isPrimary: boolean;
  siteCount: number;
  hasRefreshToken: boolean;
  /** sites another CrawlSEO user with this Google identity still owns */
  importable: { total: number; conflicts: number } | null;
};

/** Users who signed in before linked accounts existed have tokens on the
 *  user row only: mirror them so the login identity shows up in the list. */
async function ensurePrimaryAccount(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, image: true, googleTokens: true },
  });
  if (!user?.googleTokens) return;
  const exists = await db.googleAccount.findUnique({
    where: { userId_email: { userId, email: user.email.toLowerCase() } },
    select: { id: true },
  });
  if (exists) return;
  await upsertGoogleAccount(
    userId,
    { email: user.email, name: user.name, picture: user.image },
    user.googleTokens as GoogleTokens
  );
}

export async function listGoogleAccounts(userId: string): Promise<LinkedAccount[]> {
  await ensurePrimaryAccount(userId);
  const [me, accounts, mySites] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { email: true } }),
    db.googleAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { sites: true } } },
    }),
    db.site.findMany({ where: { userId }, select: { domain: true } }),
  ]);
  const myDomains = new Set(mySites.map((s) => s.domain));

  return Promise.all(
    accounts.map(async (a) => {
      const others = await db.site.findMany({
        where: { user: { email: a.email, id: { not: userId } } },
        select: { domain: true },
      });
      const conflicts = others.filter((s) => myDomains.has(s.domain)).length;
      return {
        id: a.id,
        email: a.email,
        name: a.name,
        picture: a.picture,
        isPrimary: me?.email.toLowerCase() === a.email,
        siteCount: a._count.sites,
        hasRefreshToken: Boolean((a.tokens as GoogleTokens | null)?.refreshToken),
        importable: others.length > 0 ? { total: others.length, conflicts } : null,
      };
    })
  );
}

// ---------------------------------------------------------------------------
// Import sites from the other workspace of the same Google identity
// ---------------------------------------------------------------------------

/**
 * Moves the sites owned by other CrawlSEO users whose e-mail is this linked
 * account's into the current user's workspace, keeping all their data, and
 * attaches them to the linked account for Search Console reads. Sites whose
 * domain the user already has are left where they are.
 */
export async function importSitesFromAccount(
  userId: string,
  accountId: string
): Promise<{ moved: string[]; skipped: string[] }> {
  const account = await db.googleAccount.findUnique({
    where: { id: accountId },
    select: { userId: true, email: true },
  });
  if (!account || account.userId !== userId) throw new Error("Compte Google introuvable");

  const [mine, theirs] = await Promise.all([
    db.site.findMany({ where: { userId }, select: { domain: true } }),
    db.site.findMany({
      where: { user: { email: account.email, id: { not: userId } } },
      select: { id: true, domain: true },
    }),
  ]);
  const myDomains = new Set(mine.map((s) => s.domain));

  const moved: string[] = [];
  const skipped: string[] = [];
  for (const site of theirs) {
    if (myDomains.has(site.domain)) {
      skipped.push(site.domain);
      continue;
    }
    await db.$transaction([
      db.site.update({
        where: { id: site.id },
        data: { userId, googleAccountId: accountId },
      }),
      db.alert.updateMany({ where: { siteId: site.id }, data: { userId } }),
    ]);
    myDomains.add(site.domain);
    moved.push(site.domain);
  }
  return { moved, skipped };
}
