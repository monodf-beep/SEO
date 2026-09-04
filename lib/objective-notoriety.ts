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
import { matchesAny, normalizeTerm } from "@/lib/objective-terms";
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
  targetMedia: string[];
  targetPartners: string[];
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
    () => sleep(600),
    () => sleep(600)
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
function pickHub(sites: ScopedSite[], queries: QueryAgg[], focusTerms: string[]): ScopedSite | null {
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
  const titles = [...objective.wikiArticles];
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

  return actions;
}

// ---------------------------------------------------------------------------
// Links from media, partners, and the user's own guest sites
// ---------------------------------------------------------------------------

/** Referring domains of every site in scope, when DataForSEO is configured. */
async function referringDomains(input: NotorietyInput, notes: string[]): Promise<Set<string> | null> {
  const wanted = [...input.objective.targetMedia, ...input.objective.targetPartners, ...input.objective.guestSites];
  if (wanted.length === 0) return null;
  const refs = new Set<string>();
  let configured = false;
  for (const site of input.sites) {
    try {
      const rows = await backlinksProfile(input.objective.userId, site.domain, 1000, 0);
      if (rows === null) continue;
      configured = true;
      for (const r of rows) if (r.referringDomain) refs.add(hostOf(r.referringDomain));
    } catch {
      notes.push(`DataForSEO : lecture des backlinks de ${site.domain} en échec`);
    }
  }
  if (!configured) {
    notes.push("DataForSEO n'est pas configuré : les liens déjà obtenus depuis les médias, partenaires et sites invités n'ont pas pu être vérifiés");
    return null;
  }
  return refs;
}

const MEDIA_HINTS: Array<[RegExp, string]> = [
  [/mediapart\.fr/, "Le Club de Mediapart est ouvert aux abonnés : un billet s'y publie directement, sans passer par la rédaction, et peut être relayé en une. Une tribune dans le journal lui-même passe par la rédaction."],
  [/letemps\.ch/, "Rubrique Opinions : une proposition de 3 500 à 4 500 signes, signée avec votre titre, envoyée à la rédaction. Le lien savoyard-vaudois est l'angle naturel pour un média romand."],
  [/ledauphine\.com|lessorsavoyard\.fr|lemessager\.fr/, "Presse régionale : un communiqué ou une invitation (événement, publication, chiffre) à la locale, avec une personne à interviewer."],
  [/francetvinfo\.fr|rts\.ch|radiofrance/, "Audiovisuel public régional : proposez un sujet incarné (un cours, une personne, une date) plutôt qu'un communiqué."],
];

function mediaHint(domain: string): string {
  for (const [re, hint] of MEDIA_HINTS) if (re.test(domain)) return hint;
  return "Cherchez la rubrique Tribunes ou Opinions du média, ou envoyez une proposition d'angle à la rédaction avec une personne à interviewer.";
}

function linkRules(input: NotorietyInput, refs: Set<string> | null, hub: ScopedSite | null): GeneratedAction[] {
  const { objective, queries } = input;
  const actions: GeneratedAction[] = [];
  const hubLabel = hub ? hostOf(hub.domain) : "votre site pivot";
  const focusLabel = objective.focusTerms[0] ?? "votre terme";

  const topRival = queries.filter((q) => q.bucket === "rival").sort((a, b) => b.impressions - a.impressions).slice(0, 2);
  const topFocus = queries.filter((q) => q.bucket === "focus").sort((a, b) => b.impressions - a.impressions).slice(0, 1);
  const angles = [...topRival, ...topFocus].map((q) => `${quote(q.query)} (${fmtInt(q.impressions)} impr./28 j)`).join(", ");

  for (const raw of objective.targetMedia) {
    const domain = hostOf(raw);
    if (refs?.has(domain)) continue;
    actions.push({
      fingerprint: `press:${domain}`,
      type: "PRESS",
      title: `Proposer une tribune ou un sujet à ${domain}`,
      detail:
        `${refs ? "Aucun lien depuis ce média vers vos sites. " : ""}${mediaHint(domain)} ` +
        (angles ? `Sujets à forte demande à mettre en avant : ${angles}. ` : "") +
        `Demandez que l'article nomme ${quote(focusLabel)} et lie https://${hubLabel}/.`,
      priority: 60,
      source: "rule:press_target",
    });
  }

  for (const raw of objective.targetPartners) {
    const domain = hostOf(raw);
    if (refs?.has(domain)) continue;
    actions.push({
      fingerprint: `partner:${domain}`,
      type: "BACKLINK",
      title: `Obtenir un lien depuis ${domain}`,
      detail:
        `${refs ? "Aucun lien depuis ce domaine vers vos sites. " : ""}` +
        `Cherchez sa page partenaires, ressources ou annuaire, puis proposez la page la plus utile de https://${hubLabel}/ avec l'ancre ${quote(focusLabel)}. Un lien institutionnel pèse plus que dix liens de blogs.`,
      priority: 55,
      source: "rule:partner_link",
    });
  }

  // Guest sites: pair each with the topics that most deserve an article.
  const topics = topicsForGuestArticles(queries);
  let cursor = 0;
  for (const raw of objective.guestSites) {
    const domain = hostOf(raw);
    const already = refs?.has(domain);
    for (let n = 0; n < 2 && cursor < topics.length; n++, cursor++) {
      const t = topics[cursor];
      const site = input.sites.find((s) => s.id === t.siteId);
      actions.push({
        fingerprint: `guest:${domain}:${normalizeTerm(t.query)}`,
        type: "CONTENT_NEW",
        title: `Écrire sur ${domain} : ${quote(t.query)}`,
        detail:
          `${fmtInt(t.impressions)} impressions sur 28 j et aucune de vos pages dans le top 10 (meilleure position ${t.position.toFixed(1)}${site ? ` sur ${hostOf(site.domain)}` : ""}). ` +
          `Un article de fond sur ${domain} qui nomme ${quote(focusLabel)} dès le titre et renvoie vers ${t.page ?? `https://${hubLabel}/`}.` +
          (already ? " Ce site vous lie déjà : gardez des ancres variées." : ""),
        query: t.query,
        url: t.page ?? undefined,
        siteId: t.siteId,
        priority: clamp(18 * Math.log(1 + t.impressions) + 5),
        source: "rule:guest_article",
      });
    }
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
    o.targetMedia.length ||
    o.targetPartners.length ||
    o.guestSites.length ||
    o.socialProfiles.length;
  if (!hasAnything) return { actions: [], notes };

  const hub = pickHub(input.sites, input.queries, o.focusTerms);
  const [wiki, refs, presence] = await Promise.all([
    wikiRules(input, hub, notes),
    referringDomains(input, notes),
    presenceRules(input, hub, notes),
  ]);
  const links = linkRules(input, refs, hub);

  return { actions: [...wiki, ...links, ...presence], notes };
}
