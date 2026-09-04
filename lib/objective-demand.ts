/**
 * Demand rules: what the search data itself says to do next.
 *
 * - questions people ask that no page of ours answers well
 * - topics whose demand is rising, worth a post now
 * - queries where Google's results page carries videos, forums or social
 *   posts, so a post or a video can rank where an article would not
 * - domains that link to the sites owning the rival vocabulary but not to us
 * - directories the entity is not listed in
 *
 * Search Console rows are free; the SERP and link-gap checks need DataForSEO
 * and are skipped, with a note, when it is not configured.
 */

import { referringDomainsOf, serpItemTypes } from "@/lib/dataforseo/client";
import { normalizeTerm } from "@/lib/objective-terms";
import type { GeneratedAction, QueryAgg, ScopedSite } from "@/lib/objectives";

export type DemandInput = {
  userId: string;
  focusTerms: string[];
  entityName: string | null;
  directories: string[];
  rivalSites: string[];
  sites: ScopedSite[];
  /** in-scope aggregates, current 28-day window */
  queries: QueryAgg[];
  /** same, previous 28-day window */
  previous: QueryAgg[];
  /** referring domains of the sites in scope, null when DataForSEO is not configured */
  refs: Set<string> | null;
  hub: ScopedSite | null;
};

export type DemandReport = { actions: GeneratedAction[]; notes: string[] };

const quote = (s: string) => `« ${s} »`;
const fmtInt = (n: number) => n.toLocaleString("fr-FR");
const clamp = (p: number) => Math.max(1, Math.min(100, Math.round(p)));
const priorityOf = (impressions: number) => clamp(12 * Math.log(1 + impressions));

function hostOf(input: string): string {
  const raw = input.trim();
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  }
}

/** One row per query: total impressions across sites, best position, its page. */
function byQuery(aggs: QueryAgg[]): Map<string, QueryAgg & { total: number }> {
  const out = new Map<string, QueryAgg & { total: number }>();
  for (const a of aggs) {
    const cur = out.get(a.query);
    if (!cur) {
      out.set(a.query, { ...a, total: a.impressions });
      continue;
    }
    cur.total += a.impressions;
    if (a.position < cur.position) {
      cur.position = a.position;
      cur.page = a.page;
      cur.siteId = a.siteId;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const QUESTION_PATTERNS = [
  /^(comment|pourquoi|quand|combien|quel(le)?s?|qui|où|ou)\b/,
  /\b(qu'est[- ]ce|qu est ce|que veut dire|que signifie|c'est quoi|c est quoi|ca veut dire|ça veut dire)\b/,
  /\b(signification|definition|définition|traduction|traduire|origine|difference|différence)\b/,
  /^(how|what|why|when|where|which|who)\b/,
  /\bmeaning\b/,
];

export function isQuestion(query: string): boolean {
  const q = normalizeTerm(query);
  return QUESTION_PATTERNS.some((re) => re.test(q));
}

function questionRules(input: DemandInput): GeneratedAction[] {
  const actions: GeneratedAction[] = [];
  const rows = [...byQuery(input.queries).values()]
    .filter((r) => isQuestion(r.query) && r.total >= 5 && r.position > 5)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  for (const r of rows) {
    const site = input.sites.find((s) => s.id === r.siteId);
    const answered = r.position <= 20;
    actions.push({
      fingerprint: `question:${normalizeTerm(r.query)}`,
      type: answered ? "CONTENT_UPDATE" : "CONTENT_NEW",
      title: `Répondre à la question ${quote(r.query)}`,
      detail:
        `${fmtInt(r.total)} impressions sur 28 j. ` +
        (answered
          ? `Votre page ${r.page ?? ""} est en position ${r.position.toFixed(1)} : elle ne répond pas assez directement. Mettez la question en titre (H2) et la réponse en deux phrases juste dessous, puis le développement.`
          : `Aucune de vos pages ne se place (meilleure position ${r.position.toFixed(1)}${site ? ` sur ${hostOf(site.domain)}` : ""}). Une page ou une section qui pose la question en titre et répond en deux phrases, c'est ce que Google met en avant et ce que les assistants citent.`),
      query: r.query,
      url: answered ? r.page ?? undefined : undefined,
      siteId: r.siteId,
      priority: priorityOf(r.total) + 5,
      source: "rule:question",
    });
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Social: demand rising, and SERPs that show social content
// ---------------------------------------------------------------------------

function risingDemandRules(input: DemandInput): GeneratedAction[] {
  const actions: GeneratedAction[] = [];
  const now = byQuery(input.queries);
  const before = byQuery(input.previous);
  const rows = [...now.values()]
    .filter((r) => r.bucket !== "other" && r.total >= 30)
    .map((r) => {
      const prev = before.get(r.query)?.total ?? 0;
      const growth = prev === 0 ? null : (r.total - prev) / prev;
      return { r, prev, growth };
    })
    .filter((x) => x.growth !== null && x.growth >= 0.25)
    .sort((a, b) => (b.growth ?? 0) * b.r.total - (a.growth ?? 0) * a.r.total)
    .slice(0, 5);
  const focusLabel = input.focusTerms[0] ?? null;
  for (const { r, prev, growth } of rows) {
    actions.push({
      fingerprint: `social:rising:${normalizeTerm(r.query)}`,
      type: "SOCIAL",
      title: `Publier un post sur ${quote(r.query)} : la demande monte`,
      detail:
        `${fmtInt(r.total)} impressions sur 28 j contre ${fmtInt(prev)} sur les 28 précédents (+${Math.round((growth ?? 0) * 100)} %). ` +
        `Un post ou une courte vidéo maintenant capte cette hausse${focusLabel ? `, en nommant ${quote(focusLabel)}` : ""}, avec le lien vers ${r.page ?? "votre page"}.`,
      query: r.query,
      url: r.page ?? undefined,
      siteId: r.siteId,
      priority: priorityOf(r.total) + 10,
      source: "rule:social_rising",
    });
  }
  return actions;
}

const SOCIAL_SERP_TYPES: Record<string, string> = {
  video: "des vidéos",
  short_videos: "des vidéos courtes",
  discussions_and_forums: "des discussions et forums",
  twitter: "des posts X",
  perspectives: "des avis et témoignages",
  people_also_ask: "une section « Autres questions posées »",
};

async function serpSocialRules(input: DemandInput, notes: string[]): Promise<GeneratedAction[]> {
  const actions: GeneratedAction[] = [];
  const candidates = [...byQuery(input.queries).values()]
    .filter((r) => r.bucket !== "other" && r.total >= 20)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  if (candidates.length === 0) return actions;

  let configured: boolean | null = null;
  for (const r of candidates) {
    let types: string[] | null;
    try {
      types = await serpItemTypes(input.userId, r.query);
    } catch {
      notes.push(`DataForSEO : lecture de la SERP de ${quote(r.query)} en échec`);
      continue;
    }
    if (types === null) {
      configured = false;
      break;
    }
    configured = true;
    const social = types.filter((t) => t in SOCIAL_SERP_TYPES && t !== "people_also_ask");
    const paa = types.includes("people_also_ask");
    if (social.length === 0 && !paa) continue;
    if (social.length > 0) {
      const what = social.map((t) => SOCIAL_SERP_TYPES[t]).join(", ");
      const wantsVideo = social.some((t) => t === "video" || t === "short_videos");
      actions.push({
        fingerprint: `social:serp:${normalizeTerm(r.query)}`,
        type: "SOCIAL",
        title: `${wantsVideo ? "Publier une vidéo" : "Publier un post"} sur ${quote(r.query)} : Google y affiche ${what}`,
        detail:
          `La page de résultats de cette requête (${fmtInt(r.total)} impressions sur 28 j) contient ${what}. ` +
          (wantsVideo
            ? `Une vidéo YouTube de deux à quatre minutes, titrée avec la requête, peut s'y placer là où un article ne le peut pas. `
            : `Une réponse dans une discussion existante, ou un post qui en lance une, peut s'y placer. `) +
          `Votre meilleure page : ${r.page ?? "aucune"} (position ${r.position.toFixed(1)}).`,
        query: r.query,
        url: r.page ?? undefined,
        siteId: r.siteId,
        priority: priorityOf(r.total) + 8,
        source: "rule:social_serp",
      });
    }
    if (paa) {
      actions.push({
        fingerprint: `paa:${normalizeTerm(r.query)}`,
        type: r.position <= 20 ? "CONTENT_UPDATE" : "CONTENT_NEW",
        title: `Ajouter une FAQ sur ${quote(r.query)} : Google affiche « Autres questions posées »`,
        detail:
          `Google ouvre une boîte de questions sur cette requête (${fmtInt(r.total)} impressions). Une section FAQ, une question par H2 avec une réponse courte, est le format qui y entre. ` +
          `Page concernée : ${r.page ?? "à créer"} (position ${r.position.toFixed(1)}).`,
        query: r.query,
        url: r.page ?? undefined,
        siteId: r.siteId,
        priority: priorityOf(r.total) + 3,
        source: "rule:paa",
      });
    }
  }
  if (configured === false) {
    notes.push("DataForSEO n'est pas configuré : les pages de résultats Google (vidéos, forums, questions) n'ont pas été lues");
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Links: gap against rival sites, and directories
// ---------------------------------------------------------------------------

async function linkGapRules(input: DemandInput, notes: string[]): Promise<GeneratedAction[]> {
  const actions: GeneratedAction[] = [];
  if (input.rivalSites.length === 0) {
    notes.push("Aucun site concurrent renseigné dans l'objectif : l'écart de liens (backlinks à aller chercher) n'a pas été calculé");
    return actions;
  }
  if (input.refs === null) {
    notes.push("DataForSEO n'est pas configuré : l'écart de liens face aux sites concurrents n'a pas été calculé");
    return actions;
  }
  const ours = new Set([...input.refs, ...input.sites.map((s) => hostOf(s.domain))]);
  const hubLabel = input.hub ? hostOf(input.hub.domain) : "votre site";
  const focusLabel = input.focusTerms[0] ?? "votre terme";
  const gap = new Map<string, { rank: number; via: string[] }>();
  for (const raw of input.rivalSites) {
    const rival = hostOf(raw);
    let rows: { domain: string; rank: number }[] | null;
    try {
      rows = await referringDomainsOf(input.userId, rival, 150);
    } catch {
      notes.push(`DataForSEO : liens entrants de ${rival} illisibles`);
      continue;
    }
    if (!rows) continue;
    for (const r of rows) {
      const d = hostOf(r.domain);
      if (!d || ours.has(d) || d === rival) continue;
      if (/wikipedia|wikidata|facebook|twitter|x\.com|instagram|youtube|linkedin|pinterest|blogspot|wordpress\.com/.test(d)) continue;
      const cur = gap.get(d) ?? { rank: 0, via: [] };
      cur.rank = Math.max(cur.rank, r.rank);
      cur.via.push(rival);
      gap.set(d, cur);
    }
  }
  const top = [...gap.entries()]
    .sort((a, b) => b[1].via.length - a[1].via.length || b[1].rank - a[1].rank)
    .slice(0, 10);
  for (const [domain, g] of top) {
    actions.push({
      fingerprint: `gap:${domain}`,
      type: "BACKLINK",
      title: `Obtenir un lien depuis ${domain}`,
      detail:
        `Ce domaine lie ${g.via.join(" et ")} mais aucun de vos sites. Trouvez la page qui fait ce lien (ressources, partenaires, article) et proposez-lui ${hubLabel} avec l'ancre ${quote(focusLabel)} : un site qui cite déjà le sujet accepte plus volontiers une source de plus.`,
      priority: clamp(45 + g.via.length * 10 + Math.min(g.rank, 500) / 20),
      source: "rule:link_gap",
    });
  }
  return actions;
}

function directoryRules(input: DemandInput): GeneratedAction[] {
  const actions: GeneratedAction[] = [];
  const entity = input.entityName?.trim() || null;
  const hubLabel = input.hub ? hostOf(input.hub.domain) : "votre site";
  for (const raw of input.directories) {
    const domain = hostOf(raw);
    if (input.refs?.has(domain)) continue;
    actions.push({
      fingerprint: `directory:${domain}`,
      type: "PROFILE",
      title: `Inscrire ${entity ? quote(entity) : hubLabel} sur ${domain}`,
      detail:
        `${input.refs ? "Aucun lien depuis cet annuaire vers vos sites. " : ""}` +
        `Même nom, même description et même lien que sur vos autres fiches (https://${hubLabel}/), catégorie la plus précise possible. Un annuaire vaut par sa cohérence avec les autres fiches, pas par son trafic.`,
      priority: 40,
      source: "rule:directory",
    });
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function generateDemandActions(input: DemandInput): Promise<DemandReport> {
  const notes: string[] = [];
  if (input.directories.length === 0) {
    notes.push("Aucun annuaire renseigné dans l'objectif : pas de fiche à créer");
  }
  const [serp, gap] = await Promise.all([serpSocialRules(input, notes), linkGapRules(input, notes)]);
  return {
    actions: [...questionRules(input), ...risingDemandRules(input), ...serp, ...gap, ...directoryRules(input)],
    notes,
  };
}
