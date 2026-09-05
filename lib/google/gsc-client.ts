import { getAccessToken, type TokenSource } from "./google-auth";

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";

interface GSCProperty {
  siteUrl: string;
  permissionLevel: string;
}

interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export type GSCFilter = {
  dimension: 'query' | 'page' | 'device' | 'country';
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains';
  expression: string;
};

export interface KeywordData {
  query: string;
  page?: string;
  device?: string;
  country?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  date: string;
}

/**
 * Lists all Google Search Console properties for a user
 */
export async function listGSCProperties(
  source: TokenSource
): Promise<GSCProperty[]> {
  const accessToken = await getAccessToken(source);

  const response = await fetch(`${GSC_API_BASE}/sites`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to list GSC properties: ${response.status} ${response.statusText}${
        body ? ` — ${body.slice(0, 500)}` : ""
      }`
    );
  }

  const data = (await response.json()) as { siteEntry?: GSCProperty[] };

  // Websites (domain or URL prefix) and creator profiles (Instagram, YouTube:
  // sc-creator-profile:instagram.com/handle). Anything else is unknown.
  return (data.siteEntry || []).filter((p) => propertyKind(p.siteUrl) !== null);
}

/** What a Search Console property is, or null when the shape is unknown. */
export function propertyKind(siteUrl: string): "WEBSITE" | "PROFILE" | null {
  if (siteUrl.startsWith("sc-domain:") || /^https?:\/\//i.test(siteUrl)) return "WEBSITE";
  if (siteUrl.startsWith("sc-creator-profile:")) return "PROFILE";
  return null;
}

/**
 * The domain CrawlSEO stores for a property: the bare host of a website,
 * "instagram.com/handle" for a creator profile.
 */
export function propertyDomain(siteUrl: string): string {
  if (siteUrl.startsWith("sc-domain:")) return siteUrl.slice("sc-domain:".length);
  if (siteUrl.startsWith("sc-creator-profile:")) {
    return siteUrl.slice("sc-creator-profile:".length).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return siteUrl;
  }
}

/** "@handle · Instagram" for a creator profile, the property itself otherwise. */
export function propertyLabel(siteUrl: string): string {
  if (!siteUrl.startsWith("sc-creator-profile:")) return siteUrl;
  const rest = propertyDomain(siteUrl);
  const [host, ...path] = rest.split("/");
  const handle = path.join("/");
  const network = /instagram/.test(host) ? "Instagram" : /youtube/.test(host) ? "YouTube" : /tiktok/.test(host) ? "TikTok" : host;
  return `@${handle} · ${network} (profil)`;
}

/**
 * Fetches search analytics data from Google Search Console
 */
export async function fetchSearchAnalytics(
  source: TokenSource,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[] = ["query", "page", "date", "device", "country"],
  filters?: GSCFilter[]
): Promise<KeywordData[]> {
  const accessToken = await getAccessToken(source);

  const results: KeywordData[] = [];
  let startRow = 0;
  const rowLimit = 25000; // GSC limit per request

  // Paginate through all results
  while (true) {
    const response = await fetch(
      `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions,
          rowLimit,
          startRow,
          ...(filters?.length && {
            dimensionFilterGroups: [{ filters }],
          }),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch search analytics: ${response.statusText}`
      );
    }

    const data = (await response.json()) as {
      rows?: SearchAnalyticsRow[];
    };

    if (!data.rows || data.rows.length === 0) {
      break;
    }

    // Parse rows and map to KeywordData
    for (const row of data.rows) {
      const [query, page, date, device, country] = row.keys;

      results.push({
        query,
        page,
        device,
        country,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Number(row.ctr.toFixed(4)),
        position: Number(row.position.toFixed(2)),
        date,
      });
    }

    // If we got fewer rows than requested, we've reached the end
    if (data.rows.length < rowLimit) {
      break;
    }

    startRow += rowLimit;
  }

  return results;
}

/**
 * Fetches search analytics aggregated by page
 */
export async function fetchPageAnalytics(
  source: TokenSource,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<KeywordData[]> {
  const accessToken = await getAccessToken(source);

  const response = await fetch(
    `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["page", "date"],
        rowLimit: 25000,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch page analytics: ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    rows?: SearchAnalyticsRow[];
  };

  const results: KeywordData[] = [];

  if (data.rows) {
    for (const row of data.rows) {
      const [page, date] = row.keys;

      results.push({
        query: "", // Page data doesn't have queries
        page,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Number(row.ctr.toFixed(4)),
        position: Number(row.position.toFixed(2)),
        date,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Search types: where the clicks come from (web, images, video, news, Discover)
// ---------------------------------------------------------------------------

export const SEARCH_TYPES = ["web", "image", "video", "news", "discover", "googleNews"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
export type SearchTypeTotals = Partial<Record<SearchType, { clicks: number; impressions: number }>>;

/**
 * Totals per search type over a date range, one request per type. Discover
 * and Google News return nothing until Google serves the site there, which
 * is the point of watching them.
 */
export async function fetchSearchTypeTotals(
  source: TokenSource,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<SearchTypeTotals> {
  const accessToken = await getAccessToken(source);
  const out: SearchTypeTotals = {};
  await Promise.all(
    SEARCH_TYPES.map(async (type) => {
      const response = await fetch(
        `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, type, dimensions: [], rowLimit: 1 }),
        }
      );
      if (!response.ok) return;
      const data = (await response.json()) as { rows?: Array<{ clicks: number; impressions: number }> };
      const row = data.rows?.[0];
      out[type] = { clicks: row?.clicks ?? 0, impressions: row?.impressions ?? 0 };
    })
  );
  return out;
}

