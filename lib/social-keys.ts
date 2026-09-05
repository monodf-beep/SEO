/**
 * Credentials for the three networks whose public read paths refuse a
 * server.
 *
 * Reddit and Bluesky both answer 403 to any request coming from a
 * datacenter IP, whatever the User-Agent — this was measured, not guessed:
 * a browser User-Agent is refused exactly like ours, so no header changes
 * it. What they do answer is an authenticated request, and both hand out
 * the credential for free without a card:
 *
 *   - Bluesky: an app password (Settings -> App Passwords). The public
 *     AppView host stays blocked; bsky.social answers 401 AuthMissing,
 *     which is the shape of a host that will serve us once signed in.
 *   - Reddit: a "script" app (reddit.com/prefs/apps) giving a client id
 *     and secret, exchanged for a token on www.reddit.com, then used
 *     against oauth.reddit.com.
 *   - YouTube: a Data API key, which was previously read from the
 *     environment only — so it could not be set from the interface, and a
 *     workspace without shell access could never enable it.
 *
 * Tokens are cached per user for their real lifetime: a recalculation
 * fans out over the objective and its six channel children, and seven
 * logins for one click would be both slow and rate-limited.
 */

import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

export const SOCIAL_PROVIDERS = ["bluesky", "reddit", "youtube"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

const USER_AGENT = "CrawlSEO/1.0 (objective conversation checks; read-only)";
const TIMEOUT_MS = 8000;

type Credential = { login: string; password: string };

async function credential(userId: string, provider: SocialProvider): Promise<Credential | null> {
  const row = await db.apiKey.findUnique({ where: { userId_provider: { userId, provider } } });
  if (!row) return null;
  return { login: decrypt(row.encryptedLogin), password: decrypt(row.encryptedPassword) };
}

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

type CachedToken = { token: string; until: number };
const tokens = new Map<string, CachedToken>();

/** Kept a minute short of the real expiry so a token never dies mid-request. */
function remember(key: string, token: string, lifetimeMs: number): string {
  tokens.set(key, { token, until: Date.now() + Math.max(0, lifetimeMs - 60_000) });
  return token;
}

function recall(key: string): string | null {
  const hit = tokens.get(key);
  if (hit && hit.until > Date.now()) return hit.token;
  tokens.delete(key);
  return null;
}

// ---------------------------------------------------------------------------
// Bluesky
// ---------------------------------------------------------------------------

export const BLUESKY_HOST = "https://bsky.social";

type BskySession = { accessJwt?: string };

async function createBlueskySession(identifier: string, password: string): Promise<string | null> {
  const res = await fetch(`${BLUESKY_HOST}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ identifier: identifier.replace(/^@/, ""), password }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as BskySession;
  return data.accessJwt ?? null;
}

/** An access JWT for this user's Bluesky account, or null when unconfigured. */
export async function blueskyToken(userId: string): Promise<string | null> {
  const cached = recall(`bluesky:${userId}`);
  if (cached) return cached;
  const cred = await credential(userId, "bluesky");
  if (!cred) return null;
  const jwt = await createBlueskySession(cred.login, cred.password);
  // The access JWT lives two hours; refreshing it is not worth a refresh
  // token round-trip for a job that runs for seconds.
  return jwt ? remember(`bluesky:${userId}`, jwt, 2 * 60 * 60 * 1000) : null;
}

// ---------------------------------------------------------------------------
// Reddit
// ---------------------------------------------------------------------------

export const REDDIT_API_HOST = "https://oauth.reddit.com";

type RedditToken = { access_token?: string; expires_in?: number };

async function createRedditToken(
  clientId: string,
  clientSecret: string
): Promise<{ token: string; expiresInMs: number } | null> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as RedditToken;
  if (!data.access_token) return null;
  return { token: data.access_token, expiresInMs: (data.expires_in ?? 3600) * 1000 };
}

/** A bearer token for oauth.reddit.com, or null when unconfigured. */
export async function redditToken(userId: string): Promise<string | null> {
  const cached = recall(`reddit:${userId}`);
  if (cached) return cached;
  const cred = await credential(userId, "reddit");
  if (!cred) return null;
  const issued = await createRedditToken(cred.login, cred.password);
  return issued ? remember(`reddit:${userId}`, issued.token, issued.expiresInMs) : null;
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

/** The saved Data API key, falling back to the deployment environment so an
 *  existing YOUTUBE_API_KEY in the container keeps working untouched. */
export async function youtubeKey(userId: string): Promise<string | null> {
  const cred = await credential(userId, "youtube");
  return cred?.password || process.env.YOUTUBE_API_KEY || null;
}

// ---------------------------------------------------------------------------
// Testing a credential before it is saved
// ---------------------------------------------------------------------------

export async function testSocialKey(
  provider: SocialProvider,
  login: string,
  password: string
): Promise<boolean> {
  try {
    if (provider === "bluesky") {
      return (await createBlueskySession(login, password)) !== null;
    }
    if (provider === "reddit") {
      return (await createRedditToken(login, password)) !== null;
    }
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=test&key=${encodeURIComponent(password)}`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    return res.ok;
  } catch {
    return false;
  }
}
