/**
 * Where each site of an objective stands, and the role that follows from
 * the numbers: the pivot that collects the demand, the sites that ride on
 * it, the ones still to be born. Read by the objective page and by the
 * channel rules; nothing here writes.
 */

import { db } from "@/lib/db";
import type { QueryAgg, ScopedSite } from "@/lib/objectives";
import type { SearchTypeTotals } from "@/lib/google/gsc-client";

export type SiteRole = "pivot" | "secondaire" | "naissant" | "silencieux" | "profil";

export const SITE_ROLE_LABELS: Record<SiteRole, string> = {
  profil: "Profil",
  pivot: "Pivot",
  secondaire: "Secondaire",
  naissant: "Naissant",
  silencieux: "Silencieux",
};

export const SITE_ROLE_HINTS: Record<SiteRole, string> = {
  profil: "Profil de créateur (Instagram, YouTube) : ses posts indexés par Google, lus dans la Search Console ; rien à crawler.",
  pivot: "Capte l'essentiel de la demande : la destination des liens et des partages.",
  secondaire: "Visible sur une partie des requêtes ; à lier au pivot et à nourrir de contenus propres.",
  naissant: "Vu mais pas cliqué : notoriété et liens depuis le pivot avant tout.",
  silencieux: "Aucune requête sur ces termes : rien à optimiser tant qu'il n'y a pas de contenu.",
};

export type SiteCrawlHealth = {
  crawled: boolean;
  pages: number;
  imagesMissingAlt: number;
  pagesMissingAlt: number;
  pagesMissingSocial: number;
  /** pages carrying an Article-like JSON-LD type */
  articlePages: number;
  /** pages carrying an Event JSON-LD type */
  eventPages: number;
  /** pages carrying NewsArticle */
  newsPages: number;
  organizationOnHome: boolean | null;
};

export type SiteSituation = {
  site: ScopedSite;
  role: SiteRole;
  queries: number;
  impressions: number;
  clicks: number;
  bestQueries: Array<{ query: string; position: number; impressions: number; page: string | null }>;
  crawl: SiteCrawlHealth;
  /** clicks by search type over the window; undefined when not requested, null when unreadable */
  searchTypes?: SearchTypeTotals | null;
};

const ARTICLE_TYPES = /^(Article|BlogPosting|NewsArticle|ScholarlyArticle|TechArticle|Report)$/;
const EVENT_TYPES = /Event$/;

const emptyHealth = (): SiteCrawlHealth => ({
  crawled: false,
  pages: 0,
  imagesMissingAlt: 0,
  pagesMissingAlt: 0,
  pagesMissingSocial: 0,
  articlePages: 0,
  eventPages: 0,
  newsPages: 0,
  organizationOnHome: null,
});

/** Aggregates of the latest completed crawl per site. */
export async function loadCrawlHealth(sites: ScopedSite[]): Promise<Map<string, SiteCrawlHealth>> {
  const out = new Map<string, SiteCrawlHealth>();
  for (const site of sites) {
    const h = emptyHealth();
    out.set(site.id, h);
    if (site.kind === "PROFILE") continue;
    const crawl = await db.crawl.findFirst({
      where: { siteId: site.id, status: "COMPLETED" },
      orderBy: { finishedAt: "desc" },
      select: { id: true },
    });
    if (!crawl) continue;
    h.crawled = true;
    const pages = await db.auditPage.findMany({
      where: { crawlId: crawl.id, statusCode: 200 },
      select: { url: true, imagesMissingAlt: true, hasSocialMeta: true, schemaTypes: true },
    });
    const homeHost = site.domain.replace(/^www\./, "").toLowerCase();
    for (const p of pages) {
      h.pages++;
      h.imagesMissingAlt += p.imagesMissingAlt;
      if (p.imagesMissingAlt > 0) h.pagesMissingAlt++;
      if (!p.hasSocialMeta) h.pagesMissingSocial++;
      const types = p.schemaTypes ?? [];
      if (types.some((t) => ARTICLE_TYPES.test(t))) h.articlePages++;
      if (types.some((t) => EVENT_TYPES.test(t))) h.eventPages++;
      if (types.includes("NewsArticle")) h.newsPages++;
      let isHome = false;
      try {
        const u = new URL(p.url);
        isHome = u.hostname.replace(/^www\./, "").toLowerCase() === homeHost && (u.pathname === "/" || u.pathname === "");
      } catch {
        isHome = false;
      }
      if (isHome) h.organizationOnHome = types.some((t) => /Organization|LocalBusiness|NGO|Corporation/.test(t));
    }
  }
  return out;
}

/**
 * One line per site. Roles come from the share of the objective's demand
 * each site collects and from whether it gets any click at all.
 */
export function siteSituations(
  sites: ScopedSite[],
  inScope: QueryAgg[],
  health: Map<string, SiteCrawlHealth>,
  hub: ScopedSite | null,
  searchTypes?: Map<string, SearchTypeTotals | null>
): SiteSituation[] {
  const rows: SiteSituation[] = sites.map((site) => {
    const mine = inScope.filter((a) => a.siteId === site.id);
    const impressions = mine.reduce((s, a) => s + a.impressions, 0);
    const clicks = mine.reduce((s, a) => s + a.clicks, 0);
    const bestQueries = [...mine]
      .filter((a) => a.impressions >= 5)
      .sort((a, b) => a.position - b.position || b.impressions - a.impressions)
      .slice(0, 3)
      .map((a) => ({ query: a.query, position: a.position, impressions: a.impressions, page: a.page }));
    return {
      site,
      role: "secondaire" as SiteRole,
      queries: mine.length,
      impressions,
      clicks,
      bestQueries,
      crawl: health.get(site.id) ?? emptyHealth(),
      searchTypes: searchTypes ? (searchTypes.get(site.id) ?? null) : undefined,
    };
  });
  const top = Math.max(1, ...rows.map((r) => r.impressions));
  for (const r of rows) {
    if (r.site.kind === "PROFILE") r.role = "profil";
    else if (hub && r.site.id === hub.id && r.queries > 0) r.role = "pivot";
    else if (r.queries === 0) r.role = "silencieux";
    else if (r.clicks === 0 || r.impressions < top * 0.05) r.role = "naissant";
  }
  const order: Record<SiteRole, number> = { pivot: 0, secondaire: 1, naissant: 2, silencieux: 3, profil: 4 };
  return rows.sort((a, b) => order[a.role] - order[b.role] || b.impressions - a.impressions);
}
