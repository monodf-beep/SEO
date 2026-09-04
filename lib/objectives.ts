/**
 * Objectives: goal-level KPIs and action generation across sites.
 *
 * An objective owns a scope (sites, terms to defend, competing terms). From
 * the GSC rows already synced, this module computes a "share of demand" KPI
 * and derives a list of concrete actions with the numbers that justify them.
 *
 * Everything here is deterministic: no model in the loop, every action can
 * be traced back to a rule and to the rows that fired it.
 */

import { db } from "@/lib/db";
import type { ActionType, Objective, ObjectiveAction } from "@prisma/client";
import { generateNotorietyActions, pickHub, referringDomainsOfSites } from "@/lib/objective-notoriety";
import { generateDemandActions } from "@/lib/objective-demand";
import { generateConversationActions } from "@/lib/objective-conversations";
import { findObjectiveTemplate, type ObjectiveTemplateNode } from "@/lib/objective-templates";

export const WINDOW_DAYS = 28;
const SERIES_WINDOWS = 6;

// Term helpers live in their own module so the notoriety rules can use them
// without importing this file back.
export { normalizeTerm, matchesAny, parseTerms, classifyQuery } from "@/lib/objective-terms";
export type { TermBucket } from "@/lib/objective-terms";
import { normalizeTerm, matchesAny, classifyQuery } from "@/lib/objective-terms";
import type { TermBucket } from "@/lib/objective-terms";

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

export type ScopedSite = { id: string; domain: string };

export async function resolveScope(
  objective: Pick<Objective, "userId" | "siteIds">
): Promise<ScopedSite[]> {
  const sites = await db.site.findMany({
    where: { userId: objective.userId },
    select: { id: true, domain: true },
    orderBy: { domain: "asc" },
  });
  if (objective.siteIds.length === 0) return sites;
  const wanted = new Set(objective.siteIds);
  return sites.filter((s) => wanted.has(s.id));
}

// ---------------------------------------------------------------------------
// GSC rows → per (site, query) aggregates
// ---------------------------------------------------------------------------

export type QueryAgg = {
  siteId: string;
  query: string;
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
  /** landing page that collected the most impressions for this query */
  page: string | null;
  bucket: TermBucket;
};

type RawRow = {
  siteId: string;
  query: string;
  page: string | null;
  clicks: number;
  impressions: number;
  position: number;
  date: Date;
};

function aggregate(
  rows: RawRow[],
  focusTerms: string[],
  rivalTerms: string[]
): QueryAgg[] {
  type Acc = {
    siteId: string;
    query: string;
    clicks: number;
    impressions: number;
    weightedPos: number;
    pages: Map<string, number>;
  };
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const key = `${r.siteId} ${r.query}`;
    let a = acc.get(key);
    if (!a) {
      a = {
        siteId: r.siteId,
        query: r.query,
        clicks: 0,
        impressions: 0,
        weightedPos: 0,
        pages: new Map(),
      };
      acc.set(key, a);
    }
    a.clicks += r.clicks;
    a.impressions += r.impressions;
    a.weightedPos += r.position * Math.max(r.impressions, 1);
    if (r.page) a.pages.set(r.page, (a.pages.get(r.page) ?? 0) + r.impressions);
  }
  const out: QueryAgg[] = [];
  for (const a of acc.values()) {
    let page: string | null = null;
    let best = -1;
    for (const [url, impr] of a.pages) {
      if (impr > best) {
        best = impr;
        page = url;
      }
    }
    const denom = a.impressions > 0 ? a.impressions : Math.max(a.pages.size, 1);
    out.push({
      siteId: a.siteId,
      query: a.query,
      clicks: a.clicks,
      impressions: a.impressions,
      position: a.weightedPos / denom,
      ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
      page,
      bucket: classifyQuery(a.query, focusTerms, rivalTerms),
    });
  }
  return out;
}

function windowBounds(windowsAgo: number, days = WINDOW_DAYS) {
  // Window 0 ends today (UTC), window 1 ends the day before window 0 starts.
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  end.setUTCDate(end.getUTCDate() - windowsAgo * days);
  const start = new Date(end);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start, end };
}

async function loadRows(siteIds: string[], since: Date): Promise<RawRow[]> {
  if (siteIds.length === 0) return [];
  return db.keyword.findMany({
    where: { siteId: { in: siteIds }, date: { gte: since } },
    select: {
      siteId: true,
      query: true,
      page: true,
      clicks: true,
      impressions: true,
      position: true,
      date: true,
    },
  });
}

// ---------------------------------------------------------------------------
// KPI: share of demand
// ---------------------------------------------------------------------------

export type Bucket = {
  impressions: number;
  clicks: number;
  queries: number;
  /** impression-weighted average position, 0 when no data */
  avgPosition: number;
};

export type SeriesPoint = {
  /** ISO date of the window end */
  end: string;
  share: number | null;
  focusImpressions: number;
  rivalImpressions: number;
};

export type QueryRow = {
  query: string;
  siteId: string;
  domain: string;
  clicks: number;
  impressions: number;
  position: number;
  page: string | null;
};

export type ObjectiveKpi = {
  windowDays: number;
  hasTerms: boolean;
  current: { focus: Bucket; rival: Bucket; share: number | null };
  previous: { focus: Bucket; rival: Bucket; share: number | null };
  /** share change in percentage points, null when either side is undefined */
  shareDeltaPts: number | null;
  series: SeriesPoint[];
  topFocus: QueryRow[];
  topRival: QueryRow[];
};

function bucketOf(aggs: QueryAgg[], bucket: TermBucket): Bucket {
  const rows = aggs.filter((a) => a.bucket === bucket);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const weighted = rows.reduce((s, r) => s + r.position * Math.max(r.impressions, 1), 0);
  const denom = rows.reduce((s, r) => s + Math.max(r.impressions, 1), 0);
  return {
    impressions,
    clicks,
    queries: new Set(rows.map((r) => r.query)).size,
    avgPosition: denom > 0 ? weighted / denom : 0,
  };
}

function shareOf(focus: Bucket, rival: Bucket, hasFocus: boolean, hasRival: boolean) {
  if (!hasFocus || !hasRival) return null;
  const total = focus.impressions + rival.impressions;
  if (total === 0) return null;
  return focus.impressions / total;
}

export async function getObjectiveKpi(
  objective: Pick<Objective, "userId" | "siteIds" | "focusTerms" | "rivalTerms">,
  scope?: ScopedSite[]
): Promise<ObjectiveKpi> {
  const sites = scope ?? (await resolveScope(objective));
  const siteIds = sites.map((s) => s.id);
  const domainOf = new Map(sites.map((s) => [s.id, s.domain]));
  const hasFocus = objective.focusTerms.length > 0;
  const hasRival = objective.rivalTerms.length > 0;

  const oldest = windowBounds(SERIES_WINDOWS - 1).start;
  const rows = await loadRows(siteIds, oldest);

  const perWindow: QueryAgg[][] = [];
  for (let w = 0; w < SERIES_WINDOWS; w++) {
    const { start, end } = windowBounds(w);
    const slice = rows.filter((r) => r.date >= start && r.date <= end);
    perWindow.push(aggregate(slice, objective.focusTerms, objective.rivalTerms));
  }

  const build = (aggs: QueryAgg[]) => {
    const focus = bucketOf(aggs, "focus");
    const rival = bucketOf(aggs, "rival");
    return { focus, rival, share: shareOf(focus, rival, hasFocus, hasRival) };
  };

  const current = build(perWindow[0] ?? []);
  const previous = build(perWindow[1] ?? []);

  const series: SeriesPoint[] = perWindow
    .map((aggs, w) => {
      const b = build(aggs);
      return {
        end: windowBounds(w).end.toISOString().slice(0, 10),
        share: b.share,
        focusImpressions: b.focus.impressions,
        rivalImpressions: b.rival.impressions,
      };
    })
    .reverse();

  const toRow = (a: QueryAgg): QueryRow => ({
    query: a.query,
    siteId: a.siteId,
    domain: domainOf.get(a.siteId) ?? a.siteId,
    clicks: a.clicks,
    impressions: a.impressions,
    position: a.position,
    page: a.page,
  });
  const top = (bucket: TermBucket) =>
    (perWindow[0] ?? [])
      .filter((a) => a.bucket === bucket)
      .sort((x, y) => y.impressions - x.impressions)
      .slice(0, 12)
      .map(toRow);

  return {
    windowDays: WINDOW_DAYS,
    hasTerms: hasFocus || hasRival,
    current,
    previous,
    shareDeltaPts:
      current.share !== null && previous.share !== null
        ? Math.round((current.share - previous.share) * 1000) / 10
        : null,
    series,
    topFocus: top("focus"),
    topRival: top("rival"),
  };
}

// ---------------------------------------------------------------------------
// Action generation
// ---------------------------------------------------------------------------

export type GeneratedAction = {
  fingerprint: string;
  type: ActionType;
  title: string;
  detail: string;
  query?: string;
  url?: string;
  siteId?: string;
  priority: number;
  source: string;
};

/** Expected CTR by position, the same rough curve as the opportunities page. */
function expectedCtr(position: number): number {
  if (position <= 1) return 0.28;
  if (position <= 2) return 0.15;
  if (position <= 3) return 0.11;
  if (position <= 5) return 0.07;
  if (position <= 10) return 0.03;
  if (position <= 20) return 0.01;
  return 0.005;
}

/** 0..100, log-scaled on impressions so a 20-impression query on a small
 *  site still ranks above noise while a 2 000-impression one saturates. */
function basePriority(impressions: number): number {
  return Math.max(1, Math.min(100, Math.round(18 * Math.log(1 + impressions))));
}

function clampPriority(p: number) {
  return Math.max(1, Math.min(100, Math.round(p)));
}

const fmtPos = (p: number) => p.toFixed(1);
const fmtInt = (n: number) => n.toLocaleString("fr-FR");
const quote = (s: string) => `« ${s} »`;

/** Strip scheme, "www." and trailing slash so a GSC landing page and a crawled
 *  URL compare equal. */
function canonicalUrl(u: string): string {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}`;
  } catch {
    return u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

type PageMeta = { title: string | null; description: string | null; h1s: string[]; hasSchema: boolean };

/** Title / meta / H1 of every page in the latest completed crawl per site. */
async function loadLatestPageMeta(
  siteIds: string[]
): Promise<{ meta: Map<string, PageMeta>; crawledSites: Set<string> }> {
  const meta = new Map<string, PageMeta>();
  const crawledSites = new Set<string>();
  for (const siteId of siteIds) {
    const crawl = await db.crawl.findFirst({
      where: { siteId, status: "COMPLETED" },
      orderBy: { finishedAt: "desc" },
      select: { id: true },
    });
    if (!crawl) continue;
    crawledSites.add(siteId);
    const pages = await db.auditPage.findMany({
      where: { crawlId: crawl.id, statusCode: 200 },
      select: { url: true, title: true, description: true, h1s: true, hasSchema: true },
    });
    for (const p of pages) {
      const h1s = Array.isArray(p.h1s) ? (p.h1s as unknown[]).map(String) : [];
      meta.set(canonicalUrl(p.url), { title: p.title, description: p.description, h1s, hasSchema: p.hasSchema });
    }
  }
  return { meta, crawledSites };
}

export type GenerationReport = {
  actions: GeneratedAction[];
  /** sites in scope that have no completed crawl: the terminology rule is
   *  blind there */
  sitesWithoutCrawl: string[];
  queriesInScope: number;
  /** what the notoriety checks could not verify (network, missing API keys) */
  notes: string[];
};

export type ObjectiveForRules = Pick<
  Objective,
  | "userId"
  | "siteIds"
  | "focusTerms"
  | "rivalTerms"
  | "entityName"
  | "wikiArticles"
  | "mediaBlogs"
  | "guestSites"
  | "socialProfiles"
  | "directories"
  | "rivalSites"
>;

export async function generateActions(
  objective: ObjectiveForRules,
  scope?: ScopedSite[]
): Promise<GenerationReport> {
  const sites = scope ?? (await resolveScope(objective));
  const siteIds = sites.map((s) => s.id);
  const domainOf = new Map(sites.map((s) => [s.id, s.domain]));
  const domain = (id: string) => domainOf.get(id) ?? id;

  const current = windowBounds(0);
  const previousWindow = windowBounds(1);
  const rows = await loadRows(siteIds, previousWindow.start);
  const all = aggregate(
    rows.filter((r) => r.date >= current.start),
    objective.focusTerms,
    objective.rivalTerms
  );
  const previousAll = aggregate(
    rows.filter((r) => r.date < current.start),
    objective.focusTerms,
    objective.rivalTerms
  );

  // With no terms at all the objective is "everything on these sites": keep
  // every query. Otherwise only the queries that name a term are in scope.
  const hasTerms = objective.focusTerms.length > 0 || objective.rivalTerms.length > 0;
  const inScope = hasTerms ? all.filter((a) => a.bucket !== "other") : all;

  const actions: GeneratedAction[] = [];
  const push = (a: GeneratedAction) => actions.push({ ...a, priority: clampPriority(a.priority) });

  // Group per query across sites for the cross-site rules.
  const byQuery = new Map<string, QueryAgg[]>();
  for (const a of inScope) {
    const list = byQuery.get(a.query) ?? [];
    list.push(a);
    byQuery.set(a.query, list);
  }

  // Rule 1 — striking distance: page 1 low / page 2, worth pushing.
  for (const a of inScope) {
    if (a.position < 4 || a.position > 20 || a.impressions < 10) continue;
    const page = a.page ? ` · page : ${a.page}` : "";
    push({
      fingerprint: `striking:${a.siteId}:${a.query}`,
      type: "CONTENT_UPDATE",
      title: `Renforcer la page qui se positionne sur ${quote(a.query)}`,
      detail: `Position ${fmtPos(a.position)} · ${fmtInt(a.impressions)} impressions sur ${WINDOW_DAYS} j · ${domain(a.siteId)}${page}`,
      query: a.query,
      url: a.page ?? undefined,
      siteId: a.siteId,
      priority: basePriority(a.impressions) + (a.position <= 10 ? 10 : 0),
      source: "rule:striking_distance",
    });
  }

  // Rule 2 — low CTR on a page-1 query: the snippet, not the ranking, is the
  // problem. When rule 1 already asks for work on the same page for the same
  // query, fold the CTR evidence into that task instead of opening a second.
  for (const a of inScope) {
    if (a.position > 10 || a.impressions < 30) continue;
    const exp = expectedCtr(a.position);
    if (a.ctr >= exp * 0.5) continue;
    const ctrNote = `CTR ${(a.ctr * 100).toFixed(1)} % contre ~${(exp * 100).toFixed(0)} % attendu en position ${fmtPos(a.position)}`;
    const sibling = actions.find((x) => x.fingerprint === `striking:${a.siteId}:${a.query}`);
    if (sibling) {
      sibling.detail += ` · ${ctrNote} : revoir aussi le title et la meta`;
      sibling.priority = clampPriority(sibling.priority + 5);
      continue;
    }
    push({
      fingerprint: `ctr:${a.siteId}:${a.query}`,
      type: "CONTENT_UPDATE",
      title: `Réécrire le title et la meta description pour ${quote(a.query)}`,
      detail: `${ctrNote} · ${fmtInt(a.impressions)} impressions · ${domain(a.siteId)}`,
      query: a.query,
      url: a.page ?? undefined,
      siteId: a.siteId,
      priority: basePriority(a.impressions) + 5,
      source: "rule:low_ctr",
    });
  }

  // Rule 3 — missing content: real demand, none of the sites in page 1-2.
  for (const [query, list] of byQuery) {
    const impressions = list.reduce((s, a) => s + a.impressions, 0);
    if (impressions < 10) continue;
    const best = [...list].sort((x, y) => x.position - y.position)[0];
    if (best.position <= 20) continue;
    const host = [...list].sort((x, y) => y.impressions - x.impressions)[0];
    push({
      fingerprint: `new:${query}`,
      type: "CONTENT_NEW",
      title: `Créer une page dédiée à ${quote(query)}`,
      detail: `${fmtInt(impressions)} impressions sur ${WINDOW_DAYS} j et aucune de vos pages en page 1-2 (meilleure position ${fmtPos(best.position)} sur ${domain(best.siteId)}) · site suggéré : ${domain(host.siteId)}`,
      query,
      siteId: host.siteId,
      priority: basePriority(impressions),
      source: "rule:missing_content",
    });
  }

  // Rule 4 — two of the user's own sites compete on the same query.
  for (const [query, list] of byQuery) {
    const contenders = list.filter((a) => a.impressions >= 5 && a.position <= 30);
    if (contenders.length < 2) continue;
    const sorted = [...contenders].sort((x, y) => x.position - y.position);
    const lead = sorted[0];
    const others = sorted.slice(1);
    push({
      fingerprint: `xsite:${query}`,
      type: "INTERNAL_LINK",
      title: `Deux de vos sites se concurrencent sur ${quote(query)}`,
      detail:
        `${domain(lead.siteId)} en position ${fmtPos(lead.position)} contre ` +
        others.map((o) => `${domain(o.siteId)} en ${fmtPos(o.position)}`).join(", ") +
        ` · garder ${domain(lead.siteId)} comme page de référence et la lier depuis les autres`,
      query,
      url: lead.page ?? undefined,
      siteId: lead.siteId,
      priority: basePriority(list.reduce((s, a) => s + a.impressions, 0)) + 5,
      source: "rule:cross_site",
    });
  }

  // Rule 5 — terminology: a page ranks for a rival term but never names the
  // defended one in its title, meta or H1. Needs a crawl to read the page.
  const sitesWithoutCrawl: string[] = [];
  const { meta, crawledSites } = await loadLatestPageMeta(siteIds);
  for (const id of siteIds) if (!crawledSites.has(id)) sitesWithoutCrawl.push(domain(id));
  if (objective.focusTerms.length > 0 && objective.rivalTerms.length > 0) {

    type PerUrl = { siteId: string; url: string; queries: QueryAgg[]; impressions: number };
    const perUrl = new Map<string, PerUrl>();
    for (const a of inScope) {
      if (a.bucket !== "rival" || !a.page || a.position > 20 || a.impressions < 10) continue;
      if (!crawledSites.has(a.siteId)) continue;
      const key = canonicalUrl(a.page);
      const entry = perUrl.get(key) ?? { siteId: a.siteId, url: a.page, queries: [], impressions: 0 };
      entry.queries.push(a);
      entry.impressions += a.impressions;
      perUrl.set(key, entry);
    }

    const focusLabel = objective.focusTerms[0];
    for (const [key, entry] of perUrl) {
      const m = meta.get(key);
      if (!m) continue; // page not in the crawl (redirect, noindex, depth limit)
      const haystack = [m.title ?? "", m.description ?? "", ...m.h1s].join(" ");
      if (matchesAny(haystack, objective.focusTerms)) continue;
      const qs = [...entry.queries].sort((x, y) => y.impressions - x.impressions);
      const listed = qs
        .slice(0, 3)
        .map((q) => `${quote(q.query)} (pos. ${fmtPos(q.position)}, ${fmtInt(q.impressions)} impr.)`)
        .join(", ");
      push({
        fingerprint: `term:${entry.siteId}:${key}`,
        type: "TERMINOLOGY",
        title: `Installer ${quote(focusLabel)} dans le titre de la page qui répond à ${quote(qs[0].query)}`,
        detail:
          `La page se positionne sur ${listed} mais ni son title, ni sa meta, ni son H1 ne nomment ${quote(focusLabel)}` +
          (m.title ? ` · title actuel : « ${m.title} »` : "") +
          ` · ${domain(entry.siteId)} · ${entry.url}`,
        query: qs[0].query,
        url: entry.url,
        siteId: entry.siteId,
        priority: basePriority(entry.impressions) + 15,
        source: "rule:terminology",
      });
    }
  }

  // Notoriety: Wikipedia, Wikidata, media, partners, guest sites, profiles.
  const homepageSchema = new Map<string, boolean | null>();
  for (const site of sites) {
    if (!crawledSites.has(site.id)) {
      homepageSchema.set(site.id, null);
      continue;
    }
    const home = meta.get(canonicalUrl(`https://${site.domain}/`));
    homepageSchema.set(site.id, home ? home.hasSchema : null);
  }
  const notes: string[] = [];
  if (hasTerms) {
    const quiet = sites.filter((s) => !inScope.some((a) => a.siteId === s.id)).map((s) => s.domain);
    if (quiet.length > 0) {
      notes.push(`${quiet.join(", ")} : aucune requête Search Console contenant vos termes sur ${WINDOW_DAYS} j, rien à proposer pour ce(s) site(s)`);
    }
  }
  const hub = pickHub(sites, inScope, objective.focusTerms);
  const wantsRefs =
    (objective.mediaBlogs?.length ?? 0) +
      (objective.guestSites?.length ?? 0) +
      (objective.directories?.length ?? 0) +
      (objective.rivalSites?.length ?? 0) >
    0;
  const refs = wantsRefs ? await referringDomainsOfSites(objective.userId, sites, notes) : null;

  const notoriety = await generateNotorietyActions({
    objective: {
      userId: objective.userId,
      focusTerms: objective.focusTerms,
      rivalTerms: objective.rivalTerms,
      entityName: objective.entityName ?? null,
      wikiArticles: objective.wikiArticles ?? [],
      mediaBlogs: objective.mediaBlogs ?? [],
      guestSites: objective.guestSites ?? [],
      socialProfiles: objective.socialProfiles ?? [],
    },
    sites,
    queries: inScope,
    homepageSchema,
    refs,
    hub,
  });
  for (const a of notoriety.actions) push(a);
  notes.push(...notoriety.notes);

  const demand = await generateDemandActions({
    userId: objective.userId,
    focusTerms: objective.focusTerms,
    entityName: objective.entityName ?? null,
    directories: objective.directories ?? [],
    rivalSites: objective.rivalSites ?? [],
    sites,
    queries: inScope,
    previous: hasTerms ? previousAll.filter((a) => a.bucket !== "other") : previousAll,
    refs,
    hub,
  });
  for (const a of demand.actions) push(a);
  notes.push(...demand.notes);

  if (objective.focusTerms.length > 0 || objective.rivalTerms.length > 0) {
    const conversations = await generateConversationActions({
      userId: objective.userId,
      focusTerms: objective.focusTerms,
      rivalTerms: objective.rivalTerms,
      entityName: objective.entityName ?? null,
      socialProfiles: objective.socialProfiles ?? [],
    });
    for (const a of conversations.actions) push(a);
    notes.push(...conversations.notes);
  }

  actions.sort((x, y) => y.priority - x.priority);
  return { actions, sitesWithoutCrawl, queriesInScope: byQuery.size, notes: [...new Set(notes)] };
}

// ---------------------------------------------------------------------------
// Sync: reconcile generated actions with the stored ones
// ---------------------------------------------------------------------------

export type SyncResult = {
  created: number;
  updated: number;
  removed: number;
  kept: number;
  sitesWithoutCrawl: string[];
  queriesInScope: number;
  notes: string[];
};

/**
 * Upserts rule-generated actions by fingerprint. Status is never touched:
 * something the user marked done or dismissed stays that way even if the
 * rule still fires. A TODO action whose evidence disappeared is removed;
 * anything in progress or finished is kept as history.
 */
export async function syncObjectiveActions(objectiveId: string): Promise<SyncResult> {
  const objective = await db.objective.findUniqueOrThrow({ where: { id: objectiveId } });
  const scope = await resolveScope(objective);
  const report = await generateActions(objective, scope);

  const existing = await db.objectiveAction.findMany({
    where: { objectiveId, fingerprint: { not: null } },
    select: { id: true, fingerprint: true, status: true },
  });
  const byFp = new Map(existing.map((e) => [e.fingerprint as string, e]));
  const generated = new Set(report.actions.map((a) => a.fingerprint));

  let created = 0;
  let updated = 0;
  let kept = 0;

  for (const a of report.actions) {
    const prev = byFp.get(a.fingerprint);
    if (!prev) {
      await db.objectiveAction.create({
        data: {
          objectiveId,
          siteId: a.siteId ?? null,
          type: a.type,
          title: a.title,
          detail: a.detail,
          query: a.query ?? null,
          url: a.url ?? null,
          priority: a.priority,
          source: a.source,
          fingerprint: a.fingerprint,
        },
      });
      created++;
    } else if (prev.status === "TODO" || prev.status === "IN_PROGRESS") {
      await db.objectiveAction.update({
        where: { id: prev.id },
        data: {
          siteId: a.siteId ?? null,
          type: a.type,
          title: a.title,
          detail: a.detail,
          query: a.query ?? null,
          url: a.url ?? null,
          priority: a.priority,
          source: a.source,
        },
      });
      updated++;
    } else {
      kept++;
    }
  }

  const stale = existing.filter(
    (e) => !generated.has(e.fingerprint as string) && e.status === "TODO"
  );
  if (stale.length > 0) {
    await db.objectiveAction.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }

  return {
    created,
    updated,
    removed: stale.length,
    kept,
    sitesWithoutCrawl: report.sitesWithoutCrawl,
    queriesInScope: report.queriesInScope,
    notes: report.notes,
  };
}

// ---------------------------------------------------------------------------
// Presentation helpers shared by the pages and the MCP formatters
// ---------------------------------------------------------------------------

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  CONTENT_NEW: "Nouvel article",
  CONTENT_UPDATE: "Mise à jour de page",
  TERMINOLOGY: "Terminologie",
  INTERNAL_LINK: "Lien entre vos sites",
  BACKLINK: "Backlink",
  WIKIPEDIA: "Wikipédia / Wikidata",
  PRESS: "Presse / tribune",
  PROFILE: "Fiche / profil",
  SOCIAL: "Réseaux sociaux",
  TECHNICAL: "Technique",
  OTHER: "Autre",
};

export const ACTION_STATUS_LABELS: Record<ObjectiveAction["status"], string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  DONE: "Terminée",
  DISMISSED: "Ignorée",
};

export function formatShare(share: number | null): string {
  if (share === null) return "—";
  return `${(share * 100).toFixed(0)} %`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** Creates the objective tree of a template for a user and generates the
 *  first batch of actions on every node. Returns the root objective id. */
export async function createObjectiveFromTemplate(
  userId: string,
  templateKey: string
): Promise<{ rootId: string; createdIds: string[] }> {
  const template = findObjectiveTemplate(templateKey);
  if (!template) throw new Error(`Modèle inconnu : ${templateKey}`);

  const sites = await db.site.findMany({
    where: { userId },
    select: { id: true, domain: true },
  });
  const matchSites = (patterns?: string[]) => {
    if (!patterns || patterns.length === 0) return [];
    const wanted = patterns.map(normalizeTerm);
    return sites
      .filter((s) => wanted.some((w) => normalizeTerm(s.domain).includes(w)))
      .map((s) => s.id);
  };

  const createdIds: string[] = [];
  const createNode = async (node: ObjectiveTemplateNode, parentId: string | null) => {
    const created = await db.objective.create({
      data: {
        userId,
        parentId,
        title: node.title,
        description: node.description ?? null,
        siteIds: matchSites(node.siteMatch),
        focusTerms: node.focusTerms,
        rivalTerms: node.rivalTerms,
        targetShare: node.targetShare ?? null,
        entityName: node.entityName ?? null,
        wikiArticles: node.wikiArticles ?? [],
        mediaBlogs: node.mediaBlogs ?? [],
        guestSites: node.guestSites ?? [],
        socialProfiles: node.socialProfiles ?? [],
        directories: node.directories ?? [],
        rivalSites: node.rivalSites ?? [],
      },
    });
    createdIds.push(created.id);
    for (const child of node.children ?? []) await createNode(child, created.id);
    return created.id;
  };

  const rootId = await createNode(template.root, null);
  for (const id of createdIds) await syncObjectiveActions(id);
  return { rootId, createdIds };
}
