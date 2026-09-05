import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KeywordResult = {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  competition: number | null;
  trend: number[] | null; // monthly search volume trend
};

export type DomainOverviewResult = {
  organicKeywords: number;
  organicTraffic: number;
  organicCost: number;
  backlinks: number;
  referringDomains: number;
};

export type BacklinksOverviewResult = {
  totalBacklinks: number;
  referringDomains: number;
  referringIps: number;
  dofollow: number;
  nofollow: number;
};

export type BacklinkItem = {
  referringDomain: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  dofollow: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
};

// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

async function getCredentials(userId: string): Promise<{ login: string; password: string } | null> {
  const apiKey = await db.apiKey.findUnique({
    where: { userId_provider: { userId, provider: "dataforseo" } },
  });
  if (!apiKey) return null;

  return {
    login: decrypt(apiKey.encryptedLogin),
    password: decrypt(apiKey.encryptedPassword),
  };
}

function authHeader(login: string, password: string): string {
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

// ---------------------------------------------------------------------------
// Base request
// ---------------------------------------------------------------------------

async function dataforseoPost<T>(
  login: string,
  password: string,
  endpoint: string,
  body: unknown[]
): Promise<T | null> {
  const res = await fetch(`https://api.dataforseo.com/v3${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(login, password),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`DataForSEO ${endpoint} error: ${res.status} ${res.statusText}`);
    return null;
  }

  const json = await res.json();
  if (json.status_code !== 20000) {
    console.error(`DataForSEO ${endpoint} API error:`, json.status_message);
    return null;
  }

  return json as T;
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export async function testConnection(login: string, password: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
      method: "GET",
      headers: { Authorization: authHeader(login, password) },
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json.status_code === 20000;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Keyword Research
// ---------------------------------------------------------------------------

export async function keywordResearch(
  userId: string,
  seed: string,
  language?: string,
  location?: number
): Promise<KeywordResult[] | null> {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  const data = await dataforseoPost<any>(creds.login, creds.password, "/dataforseo_labs/google/related_keywords/live", [
    {
      keyword: seed,
      language_code: language || "en",
      location_code: location || 2840, // US
      limit: 50,
    },
  ]);

  if (!data?.tasks?.[0]?.result?.[0]?.items) return [];

  return data.tasks[0].result[0].items.map((item: any) => ({
    keyword: item.keyword_data?.keyword ?? item.keyword ?? seed,
    volume: item.keyword_data?.keyword_info?.search_volume ?? null,
    difficulty: item.keyword_data?.keyword_info?.keyword_difficulty ?? null,
    cpc: item.keyword_data?.keyword_info?.cpc ?? null,
    competition: item.keyword_data?.keyword_info?.competition ?? null,
    trend: item.keyword_data?.keyword_info?.monthly_searches?.map((m: any) => m.search_volume) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Domain Overview
// ---------------------------------------------------------------------------

export async function domainOverview(
  userId: string,
  domain: string
): Promise<DomainOverviewResult | null> {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  const data = await dataforseoPost<any>(creds.login, creds.password, "/dataforseo_labs/google/domain_rank_overview/live", [
    { target: domain, language_code: "en", location_code: 2840 },
  ]);

  const item = data?.tasks?.[0]?.result?.[0];
  if (!item) return null;

  return {
    organicKeywords: item.metrics?.organic?.count ?? 0,
    organicTraffic: item.metrics?.organic?.etv ?? 0,
    organicCost: item.metrics?.organic?.estimated_paid_traffic_cost ?? 0,
    backlinks: item.metrics?.organic?.backlinks ?? 0,
    referringDomains: item.metrics?.organic?.referring_domains ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Backlinks Overview
// ---------------------------------------------------------------------------

export async function backlinksOverview(
  userId: string,
  domain: string
): Promise<BacklinksOverviewResult | null> {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  const data = await dataforseoPost<any>(creds.login, creds.password, "/backlinks/summary/live", [
    { target: domain, internal_list_limit: 0, backlinks_filters: [] },
  ]);

  const item = data?.tasks?.[0]?.result?.[0];
  if (!item) return null;

  return {
    totalBacklinks: item.backlinks ?? 0,
    referringDomains: item.referring_domains ?? 0,
    referringIps: item.referring_ips ?? 0,
    dofollow: item.backlinks - (item.referring_links_nofollow ?? 0),
    nofollow: item.referring_links_nofollow ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Short-lived cache: every call below is billed per request
// ---------------------------------------------------------------------------

/**
 * Declining an objective by channel recalculates seven objectives in a
 * row — the parent and its six channels — and each one used to re-ask
 * DataForSEO the same questions about the same domains, seven times, for
 * one click. Every endpoint here bills per request, so that is the user's
 * money. A few minutes of memory is enough to collapse a burst like that
 * into a single call, and short enough that a deliberate re-run minutes
 * later still gets fresh data.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await run();
  // A failed or unconfigured read is not worth remembering: the user may be
  // adding their key right now.
  if (value !== null) cache.set(key, { at: Date.now(), value });
  return value;
}

// ---------------------------------------------------------------------------
// Backlinks Profile (individual links)
// ---------------------------------------------------------------------------

export async function backlinksProfile(
  userId: string,
  domain: string,
  limit = 50,
  offset = 0
): Promise<BacklinkItem[] | null> {
  return cached(`bl:${userId}:${domain}:${limit}:${offset}`, async () => {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  const data = await dataforseoPost<any>(creds.login, creds.password, "/backlinks/backlinks/live", [
    {
      target: domain,
      mode: "as_is",
      limit,
      offset,
      order_by: ["rank,desc"],
    },
  ]);

  if (!data?.tasks?.[0]?.result?.[0]?.items) return [];

  return data.tasks[0].result[0].items.map((item: any) => ({
    referringDomain: item.referring_main_domain ?? "",
    sourceUrl: item.url_from ?? "",
    targetUrl: item.url_to ?? "",
    anchorText: item.anchor ?? "",
    dofollow: item.dofollow ?? true,
    firstSeen: item.first_seen ?? null,
    lastSeen: item.last_seen ?? null,
  }));
  });
}

// ---------------------------------------------------------------------------
// Referring domains of any target (link gap analysis)
// ---------------------------------------------------------------------------

export type ReferringDomainItem = { domain: string; rank: number; backlinks: number };

export async function referringDomainsOf(
  userId: string,
  target: string,
  limit = 100
): Promise<ReferringDomainItem[] | null> {
  return cached(`rd:${userId}:${target}:${limit}`, async () => {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  type Resp = { tasks?: Array<{ result?: Array<{ items?: Array<{ domain?: string; rank?: number; backlinks?: number }> }> }> };
  const data = await dataforseoPost<Resp>(creds.login, creds.password, "/backlinks/referring_domains/live", [
    { target, limit, order_by: ["rank,desc"], exclude_internal_backlinks: true },
  ]);
  const items = data?.tasks?.[0]?.result?.[0]?.items;
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    domain: item.domain ?? "",
    rank: item.rank ?? 0,
    backlinks: item.backlinks ?? 0,
  }));
  });
}

// ---------------------------------------------------------------------------
// SERP composition: which result types Google shows for a keyword
// ---------------------------------------------------------------------------

/** Item types of the first results page (organic, video, people_also_ask,
 *  discussions_and_forums…). Location and language come from
 *  DATAFORSEO_LOCATION_CODE / DATAFORSEO_LANGUAGE_CODE, France and French
 *  by default. */
export async function serpItemTypes(userId: string, keyword: string): Promise<string[] | null> {
  return cached(`serp:${userId}:${keyword}`, async () => {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  const locationCode = Number(process.env.DATAFORSEO_LOCATION_CODE) || 2250;
  const languageCode = process.env.DATAFORSEO_LANGUAGE_CODE || "fr";
  type Resp = { tasks?: Array<{ result?: Array<{ item_types?: string[]; items?: Array<{ type?: string }> }> }> };
  const data = await dataforseoPost<Resp>(creds.login, creds.password, "/serp/google/organic/live/advanced", [
    { keyword, location_code: locationCode, language_code: languageCode, device: "desktop", depth: 10 },
  ]);
  const result = data?.tasks?.[0]?.result?.[0];
  if (!result) return [];
  if (Array.isArray(result.item_types)) return result.item_types;
  const items = Array.isArray(result.items) ? result.items : [];
  return [...new Set(items.map((i) => String(i.type ?? "")))].filter(Boolean);
  });
}

/**
 * URLs of the organic results for a keyword: the plain "search Google for
 * this" primitive, reused wherever a rule needs to know what actually
 * ranks rather than just which item types are present.
 */
export async function organicResults(
  userId: string,
  keyword: string,
  depth = 10
): Promise<Array<{ url: string; domain: string }> | null> {
  return cached(`org:${userId}:${keyword}:${depth}`, async () => {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  const locationCode = Number(process.env.DATAFORSEO_LOCATION_CODE) || 2250;
  const languageCode = process.env.DATAFORSEO_LANGUAGE_CODE || "fr";
  type Item = { type?: string; url?: string; domain?: string };
  type Resp = { tasks?: Array<{ result?: Array<{ items?: Item[] }> }> };
  const data = await dataforseoPost<Resp>(creds.login, creds.password, "/serp/google/organic/live/advanced", [
    { keyword, location_code: locationCode, language_code: languageCode, device: "desktop", depth },
  ]);
  const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
  return items
    .filter((i) => i.type === "organic" && i.url)
    .map((i) => ({ url: i.url!, domain: (i.domain ?? "").replace(/^www\./, "").toLowerCase() }));
  });
}
