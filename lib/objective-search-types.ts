/**
 * Search-type totals per site (web, images, video, news, Discover) for the
 * objective's window, read live from Search Console and kept for a few
 * hours: a page view should not cost six API calls per site every time.
 */

import { db } from "@/lib/db";
import { fetchSearchTypeTotals, type SearchTypeTotals } from "@/lib/google/gsc-client";
import { WINDOW_DAYS, type ScopedSite } from "@/lib/objectives";

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; totals: SearchTypeTotals | null }>();

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** null when the site has no Search Console property or the read failed */
export async function searchTypesForSites(sites: ScopedSite[]): Promise<Map<string, SearchTypeTotals | null>> {
  const out = new Map<string, SearchTypeTotals | null>();
  if (sites.length === 0) return out;
  const props = await db.site.findMany({
    where: { id: { in: sites.map((s) => s.id) } },
    select: { id: true, gscProperty: true },
  });
  await Promise.all(
    props.map(async (p) => {
      if (!p.gscProperty) {
        out.set(p.id, null);
        return;
      }
      const hit = cache.get(p.id);
      if (hit && Date.now() - hit.at < TTL_MS) {
        out.set(p.id, hit.totals);
        return;
      }
      let totals: SearchTypeTotals | null = null;
      try {
        // Search Console data lags two to three days; end the window there.
        totals = await fetchSearchTypeTotals({ siteId: p.id }, p.gscProperty, isoDaysAgo(WINDOW_DAYS + 2), isoDaysAgo(3));
      } catch {
        totals = null;
      }
      cache.set(p.id, { at: Date.now(), totals });
      out.set(p.id, totals);
    })
  );
  return out;
}
