/**
 * Apify: runs ready-made scrapers ("actors") on the user's own account and
 * returns their dataset. Used for the networks that have no open read API
 * (Instagram, Facebook, LinkedIn, TikTok, X), where the scraping and its
 * risk sit with Apify rather than with the user's accounts.
 */

import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

const API = "https://api.apify.com/v2";

export async function getApifyToken(userId: string): Promise<string | null> {
  const key = await db.apiKey.findUnique({
    where: { userId_provider: { userId, provider: "apify" } },
  });
  return key ? decrypt(key.encryptedPassword) : null;
}

export async function testApifyToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/users/me?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Runs an actor synchronously and returns its dataset items. The call waits
 * for the run itself, so the timeout is the run's, and a slow actor simply
 * yields what it collected within it.
 */
export async function runActorItems(
  token: string,
  actorId: string,
  input: Record<string, unknown>,
  { timeoutSecs = 90, maxItems = 10 }: { timeoutSecs?: number; maxItems?: number } = {}
): Promise<Record<string, unknown>[]> {
  const qs = new URLSearchParams({
    token,
    timeout: String(timeoutSecs),
    maxItems: String(maxItems),
    clean: "true",
  });
  const res = await fetch(`${API}/acts/${encodeURIComponent(actorId).replace(/%2F/g, "~")}/run-sync-get-dataset-items?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((timeoutSecs + 20) * 1000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify ${actorId}: ${res.status}${body ? ` ${body.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}
