/**
 * "Cité par les IA": the one measure that separates GEO from the rest.
 * A handful of prompts built from the objective (its terms, its entity, the
 * questions people actually type) are put to the answer engines the user
 * holds a key for, and every answer's citations are kept. The KPI is the
 * share of answers that cite one of the user's sites; Wikipedia's presence
 * is kept too, because for most niches that is the door the engines use.
 *
 * Read-only towards the engines, a few cents per run, nothing automatic:
 * the user presses the button.
 */

import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { isQuestion } from "@/lib/objective-demand";
import { normalizeTerm } from "@/lib/objective-terms";
import { loadInScope, resolveScope, type ScopedSite } from "@/lib/objectives";

export const AI_PROVIDERS = ["perplexity", "openai"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  perplexity: "Perplexity",
  openai: "ChatGPT (OpenAI)",
};

const TIMEOUT_MS = 45_000;
const MAX_PROMPTS = 8;

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export async function getAiKey(userId: string, provider: AiProvider): Promise<string | null> {
  const key = await db.apiKey.findUnique({ where: { userId_provider: { userId, provider } } });
  return key ? decrypt(key.encryptedPassword) : null;
}

export async function testAiKey(provider: AiProvider, key: string): Promise<boolean> {
  try {
    if (provider === "perplexity") {
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
        signal: AbortSignal.timeout(20_000),
      });
      return res.ok;
    }
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** What someone curious about the objective's subject would actually ask. */
export function buildPrompts(
  objective: { focusTerms: string[]; entityName: string | null },
  questions: string[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (p: string) => {
    const k = normalizeTerm(p);
    if (seen.has(k) || out.length >= MAX_PROMPTS) return;
    seen.add(k);
    out.push(p);
  };
  for (const term of objective.focusTerms.slice(0, 2)) {
    add(`${capitalize(term)} : qu'est-ce que c'est ?`);
    add(`Quels sont les sites de référence sur ${term} ?`);
  }
  if (objective.entityName) add(`Que fait « ${objective.entityName} » et où le trouver ?`);
  for (const q of questions) add(capitalize(q.trim()) + (/[?]$/.test(q.trim()) ? "" : " ?"));
  return out;
}

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

async function askPerplexity(key: string, prompt: string): Promise<string[]> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: "Réponds en français, brièvement, en citant tes sources." },
        { role: "user", content: prompt },
      ],
      max_tokens: 400,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Perplexity ${res.status}`);
  const data = (await res.json()) as {
    citations?: string[];
    search_results?: Array<{ url?: string }>;
  };
  const urls = [...(data.citations ?? []), ...(data.search_results ?? []).map((r) => r.url ?? "")];
  return [...new Set(urls.filter(Boolean))];
}

async function askOpenAI(key: string, prompt: string): Promise<string[]> {
  // The web-search tool name changed once already; try the current one and
  // fall back to the preview name rather than fail the whole run.
  for (const tool of ["web_search", "web_search_preview"]) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        tools: [{ type: tool }],
        instructions: "Réponds en français, brièvement, en citant tes sources.",
        input: prompt,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 400 && tool === "web_search") continue;
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = (await res.json()) as {
      output?: Array<{ content?: Array<{ annotations?: Array<{ type?: string; url?: string }> }> }>;
    };
    const urls: string[] = [];
    for (const o of data.output ?? [])
      for (const c of o.content ?? [])
        for (const a of c.annotations ?? []) if (a.type === "url_citation" && a.url) urls.push(a.url);
    return [...new Set(urls)];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export type CitationRow = {
  provider: AiProvider;
  prompt: string;
  citedOwn: boolean;
  citedWikipedia: boolean;
  citations: string[];
};

export type ProviderSummary = {
  provider: AiProvider;
  prompts: number;
  citedOwn: number;
  citedWikipedia: number;
  /** share of prompts citing one of the user's sites, 0..1 */
  share: number;
  /** previous run's share, null when this is the first */
  previousShare: number | null;
  at: string;
  rows: CitationRow[];
};

export type CitationSummary = {
  configured: AiProvider[];
  providers: ProviderSummary[];
};

function ownHosts(sites: ScopedSite[]): string[] {
  return sites.map((s) => s.domain.replace(/^www\./, "").toLowerCase().split("/")[0]);
}

/** Put the prompts to every configured engine; store and return the rows. */
export async function runAiCitations(objectiveId: string): Promise<{ batch: string; rows: CitationRow[]; notes: string[] }> {
  const objective = await db.objective.findUniqueOrThrow({ where: { id: objectiveId } });
  const sites = await resolveScope(objective);
  const hosts = ownHosts(sites);
  const { inScope } = await loadInScope(objective, sites);
  const questions = [...new Map(inScope.filter((a) => isQuestion(a.query)).map((a) => [a.query, a])).values()]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
    .map((a) => a.query);
  const prompts = buildPrompts({ focusTerms: objective.focusTerms, entityName: objective.entityName }, questions);
  const notes: string[] = [];
  if (prompts.length === 0) {
    notes.push("Aucun prompt à poser : ajoutez des termes à défendre ou une entité à l'objectif");
    return { batch: "", rows: [], notes };
  }

  const batch = `${Date.now().toString(36)}`;
  const rows: CitationRow[] = [];
  for (const provider of AI_PROVIDERS) {
    const key = await getAiKey(objective.userId, provider);
    if (!key) continue;
    for (const prompt of prompts) {
      let citations: string[];
      try {
        citations = provider === "perplexity" ? await askPerplexity(key, prompt) : await askOpenAI(key, prompt);
      } catch (e) {
        notes.push(`${AI_PROVIDER_LABELS[provider]} : ${e instanceof Error ? e.message : "erreur"} sur « ${prompt} »`);
        continue;
      }
      const cited = citations.map(hostOf).filter((h): h is string => Boolean(h));
      const row: CitationRow = {
        provider,
        prompt,
        citedOwn: cited.some((h) => hosts.some((own) => h === own || h.endsWith(`.${own}`))),
        citedWikipedia: cited.some((h) => h.endsWith("wikipedia.org")),
        citations: [...new Set(cited)].slice(0, 20),
      };
      rows.push(row);
      await db.aiCitationRun.create({ data: { objectiveId, batch, ...row } });
    }
  }
  if (rows.length === 0 && notes.length === 0) {
    notes.push("Aucune clé Perplexity ni OpenAI : la mesure « Cité par les IA » n'a pas tourné (Paramètres du compte)");
  }
  return { batch, rows, notes };
}

/** Latest run per provider, with the previous one's share for the trend. */
export async function latestAiCitations(objectiveId: string, userId: string): Promise<CitationSummary> {
  const keys = await db.apiKey.findMany({
    where: { userId, provider: { in: [...AI_PROVIDERS] } },
    select: { provider: true },
  });
  const configured = AI_PROVIDERS.filter((p) => keys.some((k) => k.provider === p));

  const all = await db.aiCitationRun.findMany({
    where: { objectiveId },
    orderBy: { createdAt: "desc" },
    take: 400,
  });
  const providers: ProviderSummary[] = [];
  for (const provider of AI_PROVIDERS) {
    const mine = all.filter((r) => r.provider === provider);
    if (mine.length === 0) continue;
    const batches = [...new Set(mine.map((r) => r.batch))];
    const summarise = (batch: string) => {
      const rows = mine.filter((r) => r.batch === batch);
      return {
        rows,
        share: rows.length ? rows.filter((r) => r.citedOwn).length / rows.length : 0,
      };
    };
    const cur = summarise(batches[0]);
    const prev = batches[1] ? summarise(batches[1]) : null;
    providers.push({
      provider,
      prompts: cur.rows.length,
      citedOwn: cur.rows.filter((r) => r.citedOwn).length,
      citedWikipedia: cur.rows.filter((r) => r.citedWikipedia).length,
      share: cur.share,
      previousShare: prev ? prev.share : null,
      at: cur.rows[0].createdAt.toISOString(),
      rows: cur.rows.map((r) => ({
        provider,
        prompt: r.prompt,
        citedOwn: r.citedOwn,
        citedWikipedia: r.citedWikipedia,
        citations: r.citations,
      })),
    });
  }
  return { configured, providers };
}

/** Tasks from the latest run: every prompt no site of ours is cited on. */
export async function aiCitationRules(objectiveId: string, sites: ScopedSite[]): Promise<Array<{
  fingerprint: string;
  type: "AI_VISIBILITY";
  title: string;
  detail: string;
  priority: number;
  source: string;
  url?: string;
}>> {
  const all = await db.aiCitationRun.findMany({
    where: { objectiveId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  if (all.length === 0) return [];
  const byProvider = new Map<string, string>();
  for (const r of all) if (!byProvider.has(r.provider)) byProvider.set(r.provider, r.batch);
  const latest = all.filter((r) => byProvider.get(r.provider) === r.batch);

  const own = ownHosts(sites);
  const byPrompt = new Map<string, typeof latest>();
  for (const r of latest) {
    const list = byPrompt.get(r.prompt) ?? [];
    list.push(r);
    byPrompt.set(r.prompt, list);
  }
  const out = [];
  for (const [prompt, rows] of byPrompt) {
    if (rows.some((r) => r.citedOwn)) continue;
    const engines = rows.map((r) => AI_PROVIDER_LABELS[r.provider as AiProvider] ?? r.provider);
    const cited = [...new Set(rows.flatMap((r) => r.citations))].filter((h) => !own.includes(h)).slice(0, 6);
    const wiki = rows.some((r) => r.citedWikipedia);
    out.push({
      fingerprint: `ai:${normalizeTerm(prompt)}`,
      type: "AI_VISIBILITY" as const,
      title: `Être cité par les IA sur « ${prompt} »`,
      detail:
        `${engines.join(" et ")} ${engines.length > 1 ? "répondent" : "répond"} sans citer aucun de vos sites. Sources citées : ${cited.length ? cited.join(", ") : "aucune"}. ` +
        (wiki
          ? `Wikipédia est parmi elles : la voie la plus courte est l'article Wikipédia et l'élément Wikidata (tâches « Wikipédia / Wikidata » de cet objectif), puis une page qui répond à cette question dès ses premières lignes, avec chiffres et sources.`
          : `Une page qui répond à cette question dès ses premières lignes, avec chiffres et sources citées, et une mention sur les sites déjà cités (billet invité, commentaire sourcé) sont ce qui fait entrer un site dans ces réponses.`),
      priority: 60,
      source: "rule:ai_citation",
    });
  }
  return out;
}
