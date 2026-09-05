/**
 * Notoriety rules: what to do off-site so that the vocabulary and the
 * organisation behind an objective exist beyond the user's own pages.
 *
 * Wikipedia and Wikidata are read through their public APIs and never
 * written: every task they produce is a proposal to make by hand, in the
 * open, with independent sources, as both projects' conflict-of-interest
 * rules ask. Social profiles are read from their public card only (title,
 * Open Graph tags), never from feeds behind a login.
 */

import { backlinksProfile } from "@/lib/dataforseo/client";
import { matchesAny, normalizeTerm, type TermBucket } from "@/lib/objective-terms";
import type { GeneratedAction, QueryAgg, ScopedSite } from "@/lib/objectives";

const WP_API = "https://fr.wikipedia.org/w/api.php";
const WD_API = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "CrawlSEO/1.0 (objective notoriety checks; read-only)";
const TIMEOUT_MS = 8000;

export type NotorietyObjective = {
  userId: string;
  focusTerms: string[];
  rivalTerms: string[];
  entityName: string | null;
  wikiArticles: string[];
  /** media with a contributor space the user can publish in */
  mediaBlogs: string[];
  /** other sites the user can publish on */
  guestSites: string[];
  socialProfiles: string[];
};

export type NotorietyInput = {
  objective: NotorietyObjective;
  sites: ScopedSite[];
  /** in-scope (site, query) aggregates of the current window */
  queries: QueryAgg[];
  /** homepage has JSON-LD/schema per site id, null when the site has no crawl */
  homepageSchema: Map<string, boolean | null>;
  /** referring domains of the sites in scope, null when DataForSEO is not configured */
  refs: Set<string> | null;
  hub: ScopedSite | null;
};

export type NotorietyReport = { actions: GeneratedAction[]; notes: string[] };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const quote = (s: string) => `« ${s} »`;
const fmtInt = (n: number) => n.toLocaleString("fr-FR");
const clamp = (p: number) => Math.max(1, Math.min(100, Math.round(p)));

function hostOf(input: string): string {
  const raw = input.trim();
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Wikimedia asks for serialised, identified requests; a burst gets a 429.
// One queue for the whole process, a short pause between calls, one retry.
let queue: Promise<unknown> = Promise.resolve();
function serialised<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.then(
    () => sleep(400),
    () => sleep(400)
  );
  return run;
}

async function getJson(url: string, params: Record<string, string>, notes: string[], label: string) {
  const qs = new URLSearchParams({ ...params, format: "json" });
  return serialised(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${url}?${qs}`, {
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 429 && attempt < 2) {
          await sleep(3000 * (attempt + 1));
          continue;
        }
        if (!res.ok) {
          notes.push(`${label} : réponse ${res.status}, vérification sautée`);
          return null;
        }
        return (await res.json()) as Record<string, unknown>;
      } catch {
        if (attempt < 2) {
          await sleep(1000);
          continue;
        }
        notes.push(`${label} injoignable, vérification sautée`);
        return null;
      }
    }
    return null;
  });
}

/** The site that collects the most impressions on the defended vocabulary:
 *  the natural target of every external link. */
export function pickHub(allSites: ScopedSite[], queries: QueryAgg[], focusTerms: string[]): ScopedSite | null {
  // A creator profile is never the destination of the links: only websites.
  const sites = allSites.filter((s) => s.kind !== "PROFILE");
  if (sites.length === 0) return null;
  // A domain that literally carries the defended vocabulary is the entity's
  // home, whatever the traffic says.
  const words = focusTerms
    .flatMap((t) => normalizeTerm(t).split(/[^a-z0-9]+/))
    .filter((w) => w.length >= 6);
  const named = sites.find((s) => words.some((w) => normalizeTerm(s.domain).includes(w)));
  if (named) return named;
  const score = new Map<string, number>();
  for (const q of queries) {
    if (q.bucket === "other") continue;
    score.set(q.siteId, (score.get(q.siteId) ?? 0) + q.impressions * (q.bucket === "focus" ? 2 : 1));
  }
  // An objective without terms has every query in "other": weigh them all.
  if (score.size === 0) {
    for (const q of queries) score.set(q.siteId, (score.get(q.siteId) ?? 0) + q.impressions);
  }
  if (score.size === 0) return null;
  return [...sites].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0))[0];
}

/** Topics worth an article elsewhere: real demand, no page of ours in the
 *  top 10, rival vocabulary first. */
function topicsForGuestArticles(queries: QueryAgg[]): QueryAgg[] {
  const byQuery = new Map<string, QueryAgg[]>();
  for (const q of queries) {
    if (q.bucket === "other") continue;
    const list = byQuery.get(q.query) ?? [];
    list.push(q);
    byQuery.set(q.query, list);
  }
  const out: QueryAgg[] = [];
  for (const list of byQuery.values()) {
    const impressions = list.reduce((s, q) => s + q.impressions, 0);
    const best = [...list].sort((a, b) => a.position - b.position)[0];
    if (impressions < 10 || best.position <= 10) continue;
    out.push({ ...best, impressions });
  }
  return out.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket === "rival" ? -1 : 1;
    return b.impressions - a.impressions;
  });
}

// ---------------------------------------------------------------------------
// Wikipedia / Wikidata
// ---------------------------------------------------------------------------

type WikiPage = {
  title: string;
  missing: boolean;
  content: string;
  extlinks: string[];
  qid: string | null;
};

/** A pasted article URL is as good as a title. */
function wikiTitle(raw: string): string {
  const s = raw.trim();
  const m = s.match(/wikipedia\.org\/wiki\/([^?#]+)/i);
  if (!m) return s;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, " ");
  } catch {
    return m[1].replace(/_/g, " ");
  }
}

async function fetchWikiPage(title: string, notes: string[]): Promise<WikiPage | null> {
  const data = await getJson(
    WP_API,
    {
      action: "query",
      prop: "revisions|extlinks|pageprops",
      rvprop: "content",
      rvslots: "main",
      ellimit: "max",
      ppprop: "wikibase_item",
      titles: title,
      redirects: "1",
      formatversion: "2",
    },
    notes,
    `Wikipédia (${title})`
  );
  const page = (data as { query?: { pages?: Array<Record<string, unknown>> } } | null)?.query?.pages?.[0];
  if (!page) return null;
  if (page.invalid) {
    notes.push(`Wikipédia : titre ${quote(title)} invalide, vérification sautée`);
    return null;
  }
  const revisions = page.revisions as Array<{ slots?: { main?: { content?: string } } }> | undefined;
  const pageprops = page.pageprops as { wikibase_item?: string } | undefined;
  const extlinks = ((page.extlinks as Array<{ url?: string }> | undefined) ?? []).map((l) => l.url ?? "");

  // Long articles carry more external links than one response holds.
  let cont = (data as { continue?: { elcontinue?: string } } | null)?.continue?.elcontinue;
  for (let n = 0; cont && n < 6; n++) {
    const more = await getJson(
      WP_API,
      { action: "query", prop: "extlinks", ellimit: "max", elcontinue: cont, titles: title, redirects: "1", formatversion: "2" },
      notes,
      `Wikipédia (${title}, liens)`
    );
    const morePage = (more as { query?: { pages?: Array<Record<string, unknown>> } } | null)?.query?.pages?.[0];
    for (const l of (morePage?.extlinks as Array<{ url?: string }> | undefined) ?? []) extlinks.push(l.url ?? "");
    cont = (more as { continue?: { elcontinue?: string } } | null)?.continue?.elcontinue;
  }

  return {
    title: String(page.title ?? title),
    missing: Boolean(page.missing),
    content: revisions?.[0]?.slots?.main?.content ?? "",
    extlinks: extlinks.filter(Boolean),
    qid: pageprops?.wikibase_item ?? null,
  };
}

type WikidataItem = {
  id: string;
  label: string | null;
  aliases: string[];
  officialWebsites: string[];
};

async function fetchWikidataItem(qid: string, notes: string[]): Promise<WikidataItem | null> {
  const data = await getJson(
    WD_API,
    { action: "wbgetentities", ids: qid, props: "labels|aliases|claims", languages: "fr" },
    notes,
    `Wikidata (${qid})`
  );
  const entity = (data as { entities?: Record<string, Record<string, unknown>> } | null)?.entities?.[qid];
  if (!entity) return null;
  const labels = entity.labels as Record<string, { value?: string }> | undefined;
  const aliases = entity.aliases as Record<string, Array<{ value?: string }>> | undefined;
  const claims = entity.claims as Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>> | undefined;
  const websites = (claims?.P856 ?? [])
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter((v): v is string => typeof v === "string");
  return {
    id: qid,
    label: labels?.fr?.value ?? null,
    aliases: (aliases?.fr ?? []).map((a) => a.value ?? "").filter(Boolean),
    officialWebsites: websites,
  };
}

async function searchWikidata(term: string, notes: string[]): Promise<{ id: string; label: string }[]> {
  const data = await getJson(
    WD_API,
    { action: "wbsearchentities", search: term, language: "fr", type: "item", limit: "5" },
    notes,
    `Wikidata (recherche ${term})`
  );
  const results = (data as { search?: Array<{ id: string; label?: string }> } | null)?.search ?? [];
  return results.map((r) => ({ id: r.id, label: r.label ?? "" }));
}

async function wikiRules(input: NotorietyInput, hub: ScopedSite | null, notes: string[]): Promise<GeneratedAction[]> {
  const { objective, sites } = input;
  const actions: GeneratedAction[] = [];
  const domains = sites.map((s) => hostOf(s.domain));
  const hubLabel = hub ? hostOf(hub.domain) : domains[0] ?? "votre site";
  const focus = objective.focusTerms;
  const rival = objective.rivalTerms;
  const entity = objective.entityName?.trim() || null;

  // Titles to examine: the configured ones, plus the entity's own article
  // when it is not already listed.
  const titles = objective.wikiArticles.map(wikiTitle).filter(Boolean);
  if (entity && !titles.some((t) => normalizeTerm(t) === normalizeTerm(entity))) titles.push(entity);

  const pages: (WikiPage | null)[] = [];
  for (const t of titles) pages.push(await fetchWikiPage(t, notes));
  const seen = new Set<string>();

  for (const page of pages) {
    if (!page) continue;
    const key = normalizeTerm(page.title);
    if (seen.has(key)) continue;
    seen.add(key);

    // Same precedence as query classification: a title that names a rival
    // term is a rival article even when it also contains "savoyard".
    const isEntity = entity !== null && normalizeTerm(page.title) === normalizeTerm(entity);
    const isRivalTitle = !isEntity && matchesAny(page.title, rival);
    const isFocusTitle = !isRivalTitle && (matchesAny(page.title, focus) || isEntity);

    if (page.missing) {
      // A missing rival-term title is not ours to create.
      if (!isFocusTitle) continue;
      actions.push({
        fingerprint: `wp:missing:${key}`,
        type: "WIKIPEDIA",
        title: `Créer l'article Wikipédia ${quote(page.title)}`,
        detail:
          `Aucun article ni redirection sous ce titre sur fr.wikipedia.org. ` +
          `Un article tient s'il s'appuie sur des sources secondaires indépendantes (presse, travaux universitaires), pas sur vos propres pages. ` +
          `Rédigez un brouillon, déclarez votre lien avec le sujet sur votre page utilisateur, et demandez une relecture avant publication.`,
        priority: isFocusTitle ? 75 : 55,
        source: "rule:wikipedia_missing",
      });
      continue;
    }

    // Does the article cite one of the sites?
    const cited = page.extlinks.some((url) => domains.some((d) => hostOf(url) === d || hostOf(url).endsWith(`.${d}`)));
    if (!cited) {
      actions.push({
        fingerprint: `wp:link:${key}`,
        type: "WIKIPEDIA",
        title: `Proposer ${hubLabel} en référence dans l'article ${quote(page.title)}`,
        detail:
          `L'article ne cite aucune page de vos sites (${page.extlinks.length} liens externes vérifiés). ` +
          `Sur sa page de discussion, proposez une source précise (page, auteur, date) qui appuie une phrase existante ou une information manquante, en indiquant votre lien avec le sujet. ` +
          `Ne modifiez pas l'article vous-même sur un sujet où vous êtes partie prenante.`,
        url: `https://fr.wikipedia.org/wiki/Discussion:${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
        priority: isFocusTitle ? 80 : 65,
        source: "rule:wikipedia_citation",
      });
    }

    // A rival-term article that never names the defended term.
    if (isRivalTitle && focus.length > 0 && !matchesAny(page.content, [focus[0]])) {
      actions.push({
        fingerprint: `wp:term:${key}`,
        type: "WIKIPEDIA",
        title: `Proposer une mention sourcée de ${quote(focus[0])} dans l'article ${quote(page.title)}`,
        detail:
          `Le texte de l'article ne contient pas ${quote(focus[0])}. Proposez, en page de discussion, une phrase du type « en Savoie, la langue est aussi appelée ${focus[0]} » avec une source publiée indépendante. ` +
          `C'est la mention qui fait exister le terme aux yeux des lecteurs et des moteurs.`,
        url: `https://fr.wikipedia.org/wiki/Discussion:${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
        priority: 85,
        source: "rule:wikipedia_terminology",
      });
    }

    // Wikidata: aliases on the language / entity item, official website on the entity.
    if (isFocusTitle && page.qid) {
      const item = await fetchWikidataItem(page.qid, notes);
      if (item) {
        const known = [item.label ?? "", ...item.aliases].map(normalizeTerm);
        // Only the term being imposed deserves an alias, not every adjective
        // used to match queries.
        const aliasTerms = isEntity ? [] : focus.slice(0, 1);
        for (const term of aliasTerms) {
          if (known.includes(normalizeTerm(term))) continue;
          actions.push({
            fingerprint: `wd:alias:${item.id}:${normalizeTerm(term)}`,
            type: "WIKIPEDIA",
            title: `Ajouter ${quote(term)} comme alias français de ${item.id} (${page.title})`,
            detail:
              `Wikidata alimente le Knowledge Graph de Google. Le libellé français est ${quote(item.label ?? "?")}${item.aliases.length ? `, alias : ${item.aliases.join(", ")}` : ", sans alias"}. ` +
              `Un alias s'ajoute sans discussion préalable s'il est attesté par une source (dictionnaire, ouvrage, article de presse) que vous citez en référence.`,
            url: `https://www.wikidata.org/wiki/${item.id}`,
            priority: 80,
            source: "rule:wikidata_alias",
          });
        }
        if (isEntity) {
          const ok = item.officialWebsites.some((w) => domains.includes(hostOf(w)));
          if (!ok) {
            actions.push({
              fingerprint: `wd:website:${item.id}`,
              type: "WIKIPEDIA",
              title: `Renseigner le site officiel (P856) de ${item.id} (${page.title})`,
              detail:
                (item.officialWebsites.length
                  ? `Site officiel actuel : ${item.officialWebsites.join(", ")}. `
                  : `Aucun site officiel déclaré. `) +
                `Mettez https://${hubLabel}/ et, dans la foulée, les comptes sociaux (P2013 Facebook, P2003 Instagram, P2397 YouTube) : ce sont les propriétés que Google lit pour relier l'entité à ses pages.`,
              url: `https://www.wikidata.org/wiki/${item.id}`,
              priority: 75,
              source: "rule:wikidata_website",
            });
          }
        }
      }
    }
  }

  // The defended term itself as a Wikipedia title: a redirect is cheap and
  // makes the term searchable in the encyclopedia.
  for (const term of focus.slice(0, 2)) {
    const title = capitalize(term);
    if (seen.has(normalizeTerm(title))) continue;
    const page = await fetchWikiPage(title, notes);
    if (!page) continue;
    if (!page.missing) {
      seen.add(normalizeTerm(page.title));
      continue;
    }
    const target = pages.find((p) => p && !p.missing && matchesAny(p.title, focus));
    actions.push({
      fingerprint: `wp:redirect:${normalizeTerm(term)}`,
      type: "WIKIPEDIA",
      title: `Créer la redirection Wikipédia ${quote(title)}${target ? ` vers ${quote(target.title)}` : ""}`,
      detail:
        `Le titre ${quote(title)} n'existe pas sur fr.wikipedia.org, ni comme article ni comme redirection : quelqu'un qui cherche ce terme ne trouve rien. ` +
        (target
          ? `Une redirection vers ${quote(target.title)} se crée sans discussion et fait apparaître le terme dans la recherche interne et sur Google.`
          : `Créez-la vers l'article qui traite de la langue.`),
      priority: 70,
      source: "rule:wikipedia_redirect",
    });
  }

  // Entity without an article: at least a Wikidata item.
  if (entity) {
    const entityPage = pages.find((p) => p && normalizeTerm(p.title) === normalizeTerm(entity));
    if (!entityPage || entityPage.missing) {
      const hits = await searchWikidata(entity, notes);
      const found = hits.find((h) => normalizeTerm(h.label) === normalizeTerm(entity));
      if (!found) {
        actions.push({
          fingerprint: "wd:entity",
          type: "WIKIPEDIA",
          title: `Créer l'élément Wikidata de ${quote(entity)}`,
          detail:
            `Aucun élément Wikidata ne porte ce nom. Wikidata accepte une organisation dès qu'elle est décrite par des sources sérieuses et publiques (statuts, presse, annuaire officiel). ` +
            `Renseignez : nature (association), pays, siège, site officiel (P856), date de création, et les comptes sociaux. C'est l'ancre du Knowledge Graph pour l'entité.`,
          url: "https://www.wikidata.org/wiki/Special:NewItem",
          priority: 70,
          source: "rule:wikidata_entity",
        });
      } else {
        const item = await fetchWikidataItem(found.id, notes);
        if (item && !item.officialWebsites.some((w) => domains.includes(hostOf(w)))) {
          actions.push({
            fingerprint: `wd:website:${item.id}`,
            type: "WIKIPEDIA",
            title: `Renseigner le site officiel (P856) de ${item.id} (${entity})`,
            detail: `L'élément existe mais ne pointe pas vers vos sites. Ajoutez https://${hubLabel}/ et les comptes sociaux.`,
            url: `https://www.wikidata.org/wiki/${item.id}`,
            priority: 75,
            source: "rule:wikidata_website",
          });
        }
      }
    }
  }

  // Silence must be readable as "checked, fine", not "did not run".
  if (actions.length === 0 && titles.length > 0) {
    notes.push(`Wikipédia/Wikidata : ${titles.map(quote).join(", ")} vérifié(s), rien à proposer`);
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Links from media, partners, and the user's own guest sites
// ---------------------------------------------------------------------------

/** Referring domains of every site in scope, null when DataForSEO is not
 *  configured. Shared by the notoriety and demand rules. */
export async function referringDomainsOfSites(
  userId: string,
  sites: ScopedSite[],
  notes: string[]
): Promise<Set<string> | null> {
  const refs = new Set<string>();
  let configured = false;
  for (const site of sites) {
    if (site.kind === "PROFILE") continue;
    try {
      const rows = await backlinksProfile(userId, site.domain, 1000, 0);
      if (rows === null) continue;
      configured = true;
      for (const r of rows) if (r.referringDomain) refs.add(hostOf(r.referringDomain));
    } catch {
      notes.push(`DataForSEO : lecture des backlinks de ${site.domain} en échec`);
    }
  }
  if (!configured) {
    notes.push("DataForSEO n'est pas configuré : les liens déjà obtenus (blogs de médias, sites où vous publiez, annuaires) n'ont pas pu être vérifiés");
    return null;
  }
  return refs;
}

const BLOG_HINTS: Array<[RegExp, string]> = [
  [/mediapart\.fr/, "Le Club de Mediapart : tout abonné publie son billet directement ; les meilleurs sont relayés en une du Club. Signez avec votre fonction à l'Institut."],
  [/letemps\.ch/, "Les blogs du Temps sont hébergés sur invitation de la rédaction : demandez l'ouverture d'un blog ou publiez comme invité dans un blog existant. Le lien savoyard-vaudois est l'angle naturel pour un lectorat romand."],
];

function blogHint(domain: string): string {
  for (const [re, hint] of BLOG_HINTS) if (re.test(domain)) return hint;
  return "Espace contributeur ou blog invité du média : un billet signé, avec votre fonction, publié sous votre nom.";
}

/**
 * Places where the user can publish: each gets the topics that most
 * deserve an article, rival vocabulary first, with the page to link back
 * to. Media blogs come first because their authority is higher.
 */
type Topic = {
  query: string;
  siteId: string | null;
  impressions: number;
  position: number | null;
  page: string | null;
  bucket: TermBucket;
  /** one of the user's pages already sits in the top 10 for this query */
  ranked: boolean;
};

/**
 * Unranked demand first; then, because an article on an authority domain
 * buys notoriety and a link whatever the ranking, the best-searched terms
 * the user already ranks for; and, with no Search Console data at all, the
 * defended term itself. A configured outlet always gets something to write.
 */
function topicsForOutlets(queries: QueryAgg[], focusTerms: string[], hub: ScopedSite | null, capacity: number): Topic[] {
  const out: Topic[] = topicsForGuestArticles(queries).map((t) => ({ ...t, ranked: false }));
  if (out.length >= capacity) return out;

  const taken = new Set(out.map((t) => normalizeTerm(t.query)));
  const byQuery = new Map<string, QueryAgg[]>();
  for (const q of queries) {
    if (q.bucket === "other" || taken.has(normalizeTerm(q.query))) continue;
    const list = byQuery.get(q.query) ?? [];
    list.push(q);
    byQuery.set(q.query, list);
  }
  const ranked: Topic[] = [...byQuery.values()]
    .map((list) => {
      const best = [...list].sort((a, b) => a.position - b.position)[0];
      return { ...best, impressions: list.reduce((s, q) => s + q.impressions, 0), ranked: true };
    })
    .filter((t) => t.impressions >= 5)
    .sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket === "rival" ? -1 : 1;
      return b.impressions - a.impressions;
    });
  out.push(...ranked.slice(0, capacity - out.length));

  if (out.length === 0 && focusTerms[0]) {
    out.push({ query: focusTerms[0], siteId: hub?.id ?? null, impressions: 0, position: null, page: null, bucket: "focus", ranked: true });
  }
  return out;
}

function publishingRules(input: NotorietyInput, refs: Set<string> | null, hub: ScopedSite | null): GeneratedAction[] {
  const { objective, queries } = input;
  const actions: GeneratedAction[] = [];
  const hubLabel = hub ? hostOf(hub.domain) : "votre site pivot";
  const focusLabel = objective.focusTerms[0] ?? "votre terme";
  const outlets = [
    ...objective.mediaBlogs.map((d) => ({ domain: hostOf(d), media: true })),
    ...objective.guestSites.map((d) => ({ domain: hostOf(d), media: false })),
  ];
  const topics = topicsForOutlets(queries, objective.focusTerms, hub, outlets.length * 2);
  // Round robin, two topics per outlet at most, so a short topic list is
  // shared rather than swallowed by the first outlet.
  const perOutlet = new Map<string, number>();
  const assignments: Array<{ outlet: (typeof outlets)[number]; t: Topic }> = [];
  let idx = 0;
  for (const t of topics) {
    if (outlets.length === 0) break;
    let placed = false;
    for (let tries = 0; tries < outlets.length && !placed; tries++) {
      const outlet = outlets[(idx + tries) % outlets.length];
      if ((perOutlet.get(outlet.domain) ?? 0) >= 2) continue;
      perOutlet.set(outlet.domain, (perOutlet.get(outlet.domain) ?? 0) + 1);
      assignments.push({ outlet, t });
      idx = (idx + tries + 1) % outlets.length;
      placed = true;
    }
    if (!placed) break;
  }
  for (const { outlet, t } of assignments) {
    const { domain, media } = outlet;
    const already = refs?.has(domain);
    const site = input.sites.find((s) => s.id === t.siteId);
    const where = site ? ` sur ${hostOf(site.domain)}` : "";
    const why =
      t.position === null
        ? `Aucune requête Search Console exploitable sur 28 j : partez du terme lui-même. `
        : t.ranked
          ? `${fmtInt(t.impressions)} impressions sur 28 j, vous êtes déjà en position ${t.position.toFixed(1)}${where} : ici l'article vise la notoriété et un lien depuis un domaine d'autorité, pas la place dans Google. `
          : `${fmtInt(t.impressions)} impressions sur 28 j et aucune de vos pages dans le top 10 (meilleure position ${t.position.toFixed(1)}${where}). `;
    actions.push({
      fingerprint: `${media ? "mediablog" : "guest"}:${domain}:${normalizeTerm(t.query)}`,
      type: media ? "PRESS" : "CONTENT_NEW",
      title: `${media ? "Publier un billet sur" : "Écrire sur"} ${domain} : ${quote(t.query)}`,
      detail:
        why +
        (media ? `${blogHint(domain)} ` : "") +
        `Un article de fond qui nomme ${quote(focusLabel)} dès le titre et renvoie vers ${t.page ?? `https://${hubLabel}/`}.` +
        (already ? " Ce domaine vous lie déjà : variez les ancres." : ""),
      query: t.query,
      url: t.page ?? undefined,
      siteId: t.siteId ?? undefined,
      priority: clamp(Math.max(20, (t.ranked ? 7 : 12) * Math.log(1 + t.impressions) + (media ? 10 : 5))),
      source: media ? "rule:media_blog" : "rule:guest_article",
    });
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Presence: profiles, entity markup, Google Business Profile
// ---------------------------------------------------------------------------

type ProfileCard = { ok: boolean; status: number; title: string; description: string };

async function fetchProfileCard(url: string, notes: string[]): Promise<ProfileCard | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CrawlSEO/1.0; profile card check)",
        Accept: "text/html",
        "Accept-Language": "fr,fr-FR;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = res.ok ? (await res.text()).slice(0, 300_000) : "";
    const pick = (re: RegExp) => html.match(re)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const title = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || pick(/<title[^>]*>([^<]*)<\/title>/i);
    const description =
      pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ||
      pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
    return { ok: res.ok, status: res.status, title, description };
  } catch {
    notes.push(`Profil ${url} injoignable`);
    return null;
  }
}

async function presenceRules(input: NotorietyInput, hub: ScopedSite | null, notes: string[]): Promise<GeneratedAction[]> {
  const { objective } = input;
  const actions: GeneratedAction[] = [];
  const entity = objective.entityName?.trim() || null;
  const focusLabel = objective.focusTerms[0] ?? null;
  const hubLabel = hub ? hostOf(hub.domain) : null;
  const wanted = [entity, focusLabel].filter((x): x is string => Boolean(x));

  if (entity) {
    actions.push({
      fingerprint: "profile:gbp",
      type: "PROFILE",
      title: `Créer ou vérifier la fiche Google Business Profile de ${quote(entity)}`,
      detail:
        `La fiche est ce que Google affiche à droite sur le nom de l'entité. Règles actuelles : une adresse visible seulement si un local accueille du public à des horaires affichés, sinon fiche en « zone desservie » (adresse saisie mais masquée) ; validation le plus souvent par vidéo. ` +
        `Catégorie « Association culturelle » ou « École de langues », description et publications qui nomment ${quote(focusLabel ?? entity)}, lien vers https://${hubLabel ?? "votre-site"}/. Un post par mois suffit à la garder vivante.`,
      priority: 60,
      source: "rule:google_business_profile",
    });

    // For a French non-profit specifically: two platforms an association
    // can join itself, right away, that both carry real authority and both
    // put a link to the entity's own site on its public page. Neither
    // confirms a dofollow attribute in its terms; put the link up anyway —
    // Google has treated nofollow as a hint rather than a wall since 2020,
    // and the profile itself is worth having whatever the link does.
    // Doesn't apply outside an association context: dismiss if it doesn't fit.
    actions.push({
      fingerprint: "profile:helloasso",
      type: "PROFILE",
      title: `Créer la page HelloAsso de ${quote(entity)} (si c'est une association)`,
      detail:
        `HelloAsso est la plateforme de collecte, cotisations et billetterie la plus utilisée par les associations françaises : gratuite, sans commission, avec un mini-site qui vous est propre. ` +
        `Sa fiche associative comprend un champ site web : renseignez https://${hubLabel ?? "votre-site"}/. Pertinent uniquement si l'entité est une association ou un organisme à but non lucratif.`,
      url: "https://www.helloasso.com/",
      priority: 45,
      source: "rule:association_platforms",
    });
    actions.push({
      fingerprint: "profile:jeveuxaider",
      type: "PROFILE",
      title: `Créer la fiche de ${quote(entity)} sur jeveuxaider.gouv.fr (si c'est une association)`,
      detail:
        `La plateforme publique du bénévolat par la Réserve Civique, sur un domaine .gouv.fr : sa fiche organisation accepte un lien vers votre site et vos réseaux, et vous permet de publier des missions de bénévolat. ` +
        `Une des rares occasions d'obtenir un lien depuis un domaine gouvernemental sans démarche administrative lourde. Pertinent uniquement si l'entité est une association ou accueille des bénévoles.`,
      url: "https://www.jeveuxaider.gouv.fr/inscription/responsable?orga_type=Association",
      priority: 45,
      source: "rule:association_platforms",
    });
  }

  if (hub) {
    const schema = input.homepageSchema.get(hub.id);
    if (schema === false) {
      actions.push({
        fingerprint: `profile:schema:${hub.id}`,
        type: "TECHNICAL",
        title: `Ajouter un JSON-LD Organization sur la page d'accueil de ${hostOf(hub.domain)}`,
        detail:
          `Le dernier crawl n'a trouvé aucune donnée structurée sur la page d'accueil. Un bloc JSON-LD de type Organization avec name${entity ? ` (${quote(entity)})` : ""}, url, logo, @id et surtout sameAs vers l'article Wikipédia, l'élément Wikidata et les profils sociaux est ce qui relie le site à l'entité dans le Knowledge Graph.`,
        url: `https://${hostOf(hub.domain)}/`,
        siteId: hub.id,
        priority: 65,
        source: "rule:organization_schema",
      });
    } else if (schema === null) {
      notes.push(`${hostOf(hub.domain)} n'a pas de crawl : la présence du balisage Organization n'a pas pu être vérifiée`);
    }
  }

  for (const raw of objective.socialProfiles) {
    const url = raw.includes("://") ? raw.trim() : `https://${raw.trim()}`;
    const domain = hostOf(url);
    const card = await fetchProfileCard(url, notes);
    const fp = `profile:social:${normalizeTerm(url.replace(/^https?:\/\//, ""))}`;
    if (!card || !card.ok || (!card.title && !card.description)) {
      actions.push({
        fingerprint: fp,
        type: "PROFILE",
        title: `Vérifier à la main le profil ${domain}`,
        detail:
          `${domain} ne laisse pas lire la carte publique du profil sans connexion${card ? ` (réponse ${card.status})` : ""}. ` +
          `À vérifier vous-même : le nom affiché${entity ? ` est ${quote(entity)}` : ""}, la description nomme ${quote(focusLabel ?? "votre terme")}, le lien pointe vers https://${hubLabel ?? "votre-site"}/, et la photo est la même que sur les autres profils.`,
        url,
        priority: 40,
        source: "rule:social_profile",
      });
      continue;
    }
    const text = `${card.title} ${card.description}`;
    const missing = wanted.filter((w) => !matchesAny(text, [w]));
    if (missing.length > 0) {
      actions.push({
        fingerprint: fp,
        type: "PROFILE",
        title: `Nommer ${missing.map(quote).join(" et ")} sur le profil ${domain}`,
        detail:
          `Carte publique actuelle : « ${card.title || "(sans titre)"} » · ${card.description ? `« ${card.description.slice(0, 160)} »` : "(sans description)"}. ` +
          `Le nom et la description du profil sont ce que Google indexe sur la requête marque : ils doivent porter le même vocabulaire que le site.`,
        url,
        priority: 50,
        source: "rule:social_profile",
      });
    }
  }

  if (objective.socialProfiles.length === 0 && entity) {
    actions.push({
      fingerprint: "profile:social:list",
      type: "PROFILE",
      title: "Renseigner les profils sociaux de l'objectif",
      detail:
        "Ajoutez les URL de vos profils (YouTube, Facebook, Instagram, LinkedIn, Mastodon…) dans l'objectif : le moteur vérifiera que leur nom et leur description nomment l'entité et le terme, et vous rappellera de les déclarer en sameAs sur le site et dans Wikidata.",
      priority: 35,
      source: "rule:social_profile",
    });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function generateNotorietyActions(input: NotorietyInput): Promise<NotorietyReport> {
  const notes: string[] = [];
  const o = input.objective;
  const hasAnything =
    o.entityName ||
    o.wikiArticles.length ||
    o.mediaBlogs.length ||
    o.guestSites.length ||
    o.socialProfiles.length;
  if (!hasAnything) return { actions: [], notes };

  const hub = input.hub;
  const refs = input.refs;
  const [wiki, presence] = await Promise.all([wikiRules(input, hub, notes), presenceRules(input, hub, notes)]);
  const publishing = publishingRules(input, refs, hub);

  return { actions: [...wiki, ...publishing, ...presence], notes };
}
