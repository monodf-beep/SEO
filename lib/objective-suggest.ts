/**
 * Pre-fill the off-site fields of an objective from what is already public:
 * the sites' own homepages (entity name, social profiles), Wikipedia (the
 * articles that carry the objective's vocabulary) and the external links of
 * the rival-term articles (the sites that carry the rival vocabulary).
 *
 * Suggestions only: nothing is written, the form decides what to keep.
 */

import { resolveScope, type ScopedSite } from "@/lib/objectives";
import { normalizeTerm } from "@/lib/objective-terms";

const WP_API = "https://fr.wikipedia.org/w/api.php";
const USER_AGENT = "CrawlSEO/1.0 (objective pre-fill; read-only)";
const TIMEOUT_MS = 8000;

export type NotorietySuggestions = {
  entityName: string | null;
  wikiArticles: string[];
  socialProfiles: string[];
  rivalSites: string[];
  mediaBlogs: string[];
  notes: string[];
};

const SOCIAL_HOSTS = /(^|\.)(facebook\.com|instagram\.com|youtube\.com|linkedin\.com|tiktok\.com|x\.com|twitter\.com|bsky\.app|threads\.net|mastodon\.[a-z]+|vimeo\.com|pinterest\.[a-z]+)$/i;
const SOCIAL_SHARE = /\/(sharer|share|intent|dialog|plugins|login|signup)\b|[?&]u=/i;
const NOT_A_RIVAL =
  /(^|\.)(wikipedia\.org|wikimedia\.org|wikidata\.org|wiktionary\.org|wikisource\.org|archive\.org|doi\.org|persee\.fr|cairn\.info|openedition\.org|jstor\.org|google\.[a-z]+|books\.google|youtube\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|bnf\.fr|gallica\.bnf\.fr|worldcat\.org|hal\.science|hal\.archives-ouvertes\.fr|theses\.fr|ethnologue\.com|glottolog\.org|sil\.org|unesco\.org|europa\.eu|gouv\.fr|admin\.ch|amazon\.[a-z.]+|fnac\.com|academia\.edu|researchgate\.net|semanticscholar\.org|isbnsearch\.org|viaf\.org|idref\.fr|loc\.gov|d-nb\.info|nla\.gov\.au|catalogue\.bnf\.fr|apple\.com|spotify\.com|deezer\.com)$/i;

// Catalogues, archives and mirrors cited as sources are not sites that
// compete on the vocabulary.
const NOT_A_RIVAL_WORDS = /archive|catalog|aleph|biblio|library|wikiwix|arlima|sudoc|isni|orcid|zenodo|ssrn|scholar|dialnet|persee|erudit|revues\.org|journals\.|springer|elsevier|wiley|tandfonline|cambridge\.org|oup\.com|degruyter|brill\.com/i;

/** Media with an open contributor space, by language of the audience. */
const MEDIA_BLOGS_FR = ["mediapart.fr", "letemps.ch", "agoravox.fr"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hostOf(input: string): string | null {
  try {
    const u = new URL(input.includes("://") ? input : `https://${input}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html", "Accept-Language": "fr,fr-FR;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  }
}

async function wikiJson(params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams({ ...params, format: "json" });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${WP_API}?${qs}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429) {
        await sleep(3000);
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await sleep(800);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Homepage: entity name and social profiles
// ---------------------------------------------------------------------------

type Homepage = { entityName: string | null; socials: string[] };

function readHomepage(html: string, ownHosts: string[]): Homepage {
  let entityName: string | null = null;
  let siteName: string | null = null;
  const socials = new Set<string>();
  // A name is a name only with letters in it: "|" is a broken site setting.
  const plausible = (v: string | null | undefined): string | null => {
    const t = v ? decode(v) : "";
    return /\p{L}{3,}/u.test(t) && t.length >= 4 && !/^(accueil|home|bienvenue|welcome)$/i.test(t) ? t : null;
  };

  // JSON-LD Organization: the most deliberate statement of the entity.
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      continue;
    }
    const nodes: unknown[] = [];
    const walk = (n: unknown) => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === "object") {
        nodes.push(n);
        const g = (n as { "@graph"?: unknown })["@graph"];
        if (g) walk(g);
      }
    };
    walk(json);
    for (const n of nodes as Array<Record<string, unknown>>) {
      const type = String(Array.isArray(n["@type"]) ? (n["@type"] as unknown[]).join(" ") : n["@type"] ?? "");
      const name = typeof n.name === "string" ? plausible(n.name) : null;
      if (/WebSite/i.test(type) && name && !siteName) siteName = name;
      if (!/Organization|LocalBusiness|NGO|EducationalOrganization|Corporation|Person/i.test(type)) continue;
      if (!entityName && name) entityName = name;
      const sameAs = Array.isArray(n.sameAs) ? n.sameAs : typeof n.sameAs === "string" ? [n.sameAs] : [];
      for (const s of sameAs) if (typeof s === "string" && SOCIAL_HOSTS.test(hostOf(s) ?? "")) socials.add(s);
    }
  }

  // Then the site's own name, then the homepage's Open Graph title, then
  // the longest segment of <title> ("Accueil | Institut …" -> "Institut …").
  entityName ??= siteName;
  entityName ??= plausible(html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1]);
  entityName ??= plausible(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]);
  if (!entityName) {
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const segments = (title ? decode(title) : "").split(/\s*[|–—-]\s*/).map(plausible).filter((x): x is string => x !== null);
    entityName = segments.sort((a, b) => b.length - a.length)[0] ?? null;
  }

  // Anchors to social networks that are not share buttons.
  for (const m of html.matchAll(/href=["'](https?:\/\/[^"'\s>]+)["']/gi)) {
    const url = decode(m[1]);
    const host = hostOf(url);
    if (!host || !SOCIAL_HOSTS.test(host) || SOCIAL_SHARE.test(url)) continue;
    if (ownHosts.includes(host)) continue;
    const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    if (path.length < 2) continue; // bare "facebook.com" is not a profile
    socials.add(url.replace(/[?#].*$/, "").replace(/\/+$/, ""));
  }

  return { entityName, socials: [...socials] };
}

// ---------------------------------------------------------------------------
// Wikipedia: the articles that carry each term, and who those articles cite
// ---------------------------------------------------------------------------

async function searchArticles(term: string): Promise<string[]> {
  const data = (await wikiJson({ action: "opensearch", search: term, limit: "3", namespace: "0" })) as
    | [string, string[]]
    | null;
  return data?.[1] ?? [];
}

async function externalHosts(title: string): Promise<string[]> {
  const hosts: string[] = [];
  let cont: string | undefined;
  for (let n = 0; n < 4; n++) {
    const data = (await wikiJson({
      action: "query",
      prop: "extlinks",
      ellimit: "max",
      titles: title,
      redirects: "1",
      formatversion: "2",
      ...(cont ? { elcontinue: cont } : {}),
    })) as { query?: { pages?: Array<{ extlinks?: Array<{ url?: string }> }> }; continue?: { elcontinue?: string } } | null;
    for (const l of data?.query?.pages?.[0]?.extlinks ?? []) {
      const h = l.url ? hostOf(l.url) : null;
      if (h) hosts.push(h);
    }
    cont = data?.continue?.elcontinue;
    if (!cont) break;
    await sleep(300);
  }
  return hosts;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function suggestNotoriety(input: {
  userId: string;
  siteIds: string[];
  focusTerms: string[];
  rivalTerms: string[];
}): Promise<NotorietySuggestions> {
  const sites = await resolveScope({ userId: input.userId, siteIds: input.siteIds });
  return suggestNotorietyForSites(sites, input.focusTerms, input.rivalTerms);
}

export async function suggestNotorietyForSites(
  sites: ScopedSite[],
  focusTerms: string[],
  rivalTerms: string[]
): Promise<NotorietySuggestions> {
  const input = { focusTerms, rivalTerms };
  const notes: string[] = [];
  const ownHosts = sites.map((s) => hostOf(s.domain) ?? s.domain);

  // Homepages, in parallel: they are the user's own servers.
  const pages = await Promise.all(
    sites.slice(0, 6).map(async (s) => {
      const html = await fetchText(`https://${hostOf(s.domain) ?? s.domain}/`);
      if (!html) {
        notes.push(`${s.domain} : page d'accueil injoignable`);
        return null;
      }
      return readHomepage(html, ownHosts);
    })
  );

  // The entity is the hub's: the site whose domain carries the vocabulary,
  // else the first site that declares one.
  const words = input.focusTerms.flatMap((t) => normalizeTerm(t).split(/[^a-z0-9]+/)).filter((w) => w.length >= 6);
  const hubIndex = Math.max(0, sites.findIndex((s) => words.some((w) => normalizeTerm(s.domain).includes(w))));
  const entityName =
    pages[hubIndex]?.entityName ?? pages.find((p) => p?.entityName)?.entityName ?? null;
  const socialProfiles = [...new Set(pages.flatMap((p) => p?.socials ?? []))].slice(0, 12);

  // Wikipedia, serialised: one search per term, then the rival articles' links.
  const wikiArticles: string[] = [];
  const seen = new Set<string>();
  const rivalTitles: string[] = [];
  for (const [terms, rival] of [
    [input.focusTerms.slice(0, 3), false],
    [input.rivalTerms.slice(0, 3), true],
  ] as const) {
    for (const term of terms) {
      const titles = await searchArticles(term);
      await sleep(300);
      for (const t of titles.slice(0, 2)) {
        const key = normalizeTerm(t);
        if (seen.has(key)) continue;
        seen.add(key);
        wikiArticles.push(t);
        if (rival && rivalTitles.length < 3) rivalTitles.push(t);
      }
    }
  }
  if (input.focusTerms.length + input.rivalTerms.length > 0 && wikiArticles.length === 0) {
    notes.push("Wikipédia : aucun article trouvé pour ces termes");
  }

  const rivalCount = new Map<string, number>();
  for (const title of rivalTitles) {
    for (const h of new Set(await externalHosts(title))) {
      if (ownHosts.includes(h) || NOT_A_RIVAL.test(h) || NOT_A_RIVAL_WORDS.test(h)) continue;
      rivalCount.set(h, (rivalCount.get(h) ?? 0) + 1);
    }
    await sleep(300);
  }
  const rivalSites = [...rivalCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([h]) => h);

  return {
    entityName,
    wikiArticles,
    socialProfiles,
    rivalSites,
    mediaBlogs: MEDIA_BLOGS_FR,
    notes,
  };
}
