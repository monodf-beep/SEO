import { db } from "@/lib/db";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleTokens {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
}

export class ReauthRequiredError extends Error {
  constructor() {
    super("Your Google connection has expired. Please reconnect your account.");
    this.name = "ReauthRequiredError";
  }
}

/**
 * Where to read Google tokens from.
 *
 * - a plain string is a user id: the login account's tokens (legacy callers)
 * - `{ siteId }` resolves to the linked account the site is attached to, or
 *   the owner's login account when none is
 * - `{ accountId }` is one linked Google account
 */
export type TokenSource = string | { siteId: string } | { accountId: string };

/**
 * Refreshes Google OAuth tokens if expired.
 * Throws ReauthRequiredError when the refresh token itself is invalid/expired.
 */
async function refreshAccessToken(
  refreshToken: string
): Promise<{
  accessToken: string;
  expiresAt: number;
}> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (body.includes("invalid_grant")) {
      throw new ReauthRequiredError();
    }
    throw new Error(
      `Failed to refresh token: ${response.status} ${response.statusText}${
        body ? ` — ${body.slice(0, 500)}` : ""
      }`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

type Resolved =
  | { kind: "user"; id: string; tokens: GoogleTokens | null }
  | { kind: "account"; id: string; tokens: GoogleTokens | null };

async function resolve(source: TokenSource): Promise<Resolved> {
  if (typeof source === "string") {
    const user = await db.user.findUnique({
      where: { id: source },
      select: { googleTokens: true },
    });
    return { kind: "user", id: source, tokens: (user?.googleTokens as GoogleTokens | null) ?? null };
  }

  if ("accountId" in source) {
    const account = await db.googleAccount.findUnique({
      where: { id: source.accountId },
      select: { tokens: true },
    });
    if (!account) throw new Error("Linked Google account not found");
    return { kind: "account", id: source.accountId, tokens: account.tokens as GoogleTokens };
  }

  const site = await db.site.findUnique({
    where: { id: source.siteId },
    select: {
      userId: true,
      googleAccountId: true,
      googleAccount: { select: { tokens: true } },
    },
  });
  if (!site) throw new Error("Site not found");
  if (site.googleAccountId && site.googleAccount) {
    return { kind: "account", id: site.googleAccountId, tokens: site.googleAccount.tokens as GoogleTokens };
  }
  return resolve(site.userId);
}

async function persist(target: Resolved, tokens: GoogleTokens) {
  if (target.kind === "user") {
    await db.user.update({
      where: { id: target.id },
      data: { googleTokens: tokens as object },
    });
    return;
  }
  await db.googleAccount.update({
    where: { id: target.id },
    data: { tokens: tokens as object },
  });
}

/**
 * Gets a valid access token for a token source, refreshing if necessary.
 */
export async function getAccessToken(source: TokenSource): Promise<string> {
  const target = await resolve(source);
  const tokens = target.tokens;

  if (!tokens) {
    throw new Error("No Google OAuth tokens for this account");
  }

  if (!tokens.accessToken || !tokens.refreshToken) {
    throw new Error("Missing required Google OAuth tokens");
  }

  if (!tokens.expiresAt || tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
    const { accessToken, expiresAt } = await refreshAccessToken(tokens.refreshToken);
    await persist(target, { ...tokens, accessToken, expiresAt });
    return accessToken;
  }

  return tokens.accessToken;
}

/**
 * Records a Google identity for a user: creates or refreshes the linked
 * account row. A refresh token is only handed out by Google on the first
 * consent, so an existing one is kept when the new payload lacks it.
 */
export async function upsertGoogleAccount(
  userId: string,
  profile: { email: string; name?: string | null; picture?: string | null },
  tokens: GoogleTokens
) {
  const email = profile.email.toLowerCase();
  const existing = await db.googleAccount.findUnique({
    where: { userId_email: { userId, email } },
    select: { id: true, tokens: true },
  });
  const merged: GoogleTokens = {
    ...tokens,
    refreshToken:
      tokens.refreshToken ?? (existing?.tokens as GoogleTokens | null)?.refreshToken,
  };
  return db.googleAccount.upsert({
    where: { userId_email: { userId, email } },
    create: {
      userId,
      email,
      name: profile.name ?? null,
      picture: profile.picture ?? null,
      tokens: merged as object,
    },
    update: {
      name: profile.name ?? undefined,
      picture: profile.picture ?? undefined,
      tokens: merged as object,
    },
  });
}
