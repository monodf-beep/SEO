/**
 * Answer rules (AEO): a page that ranks on a question must answer it where
 * a snippet, an AI Overview or a chatbot looks first — the opening lines —
 * and say so in its markup. Both checks read the latest crawl.
 */

import { isQuestion } from "@/lib/objective-demand";
import { normalizeTerm } from "@/lib/objective-terms";
import type { GeneratedAction, PageMeta, QueryAgg, ScopedSite } from "@/lib/objectives";

export type AnswerInput = {
  sites: ScopedSite[];
  queries: QueryAgg[];
  meta: Map<string, PageMeta>;
  canonicalUrl: (u: string) => string;
};

const quote = (s: string) => `« ${s} »`;
const fmtInt = (n: number) => n.toLocaleString("fr-FR");
const clamp = (p: number) => Math.max(1, Math.min(100, Math.round(p)));

const STOPWORDS = new Set(
  "le la les un une des du de d l et ou en au aux a à est sont ce cet cette ces que qui quoi quel quelle quels quelles comment pourquoi quand combien ou où on ne pas plus pour par sur dans avec sans son sa ses leur leurs mon ma mes ton ta tes il elle ils elles nous vous je tu y se the of to in is are what how why when where which who does do can".split(" ")
);

/** Content words of a query: what the opening lines must contain. */
function contentWords(query: string): string[] {
  return [...new Set(normalizeTerm(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOPWORDS.has(w)))];
}

export function answerRules(input: AnswerInput): GeneratedAction[] {
  const actions: GeneratedAction[] = [];
  const domainOf = new Map(input.sites.map((s) => [s.id, s.domain]));

  for (const site of input.sites) {
    if (site.kind === "PROFILE") continue;
    const ranking = input.queries
      .filter((a) => a.siteId === site.id && a.page && isQuestion(a.query) && a.position <= 20 && a.impressions >= 10)
      .sort((a, b) => b.impressions - a.impressions);
    if (ranking.length === 0) continue;

    // 1. Answer up front: the question's own words in the opening lines.
    let n = 0;
    const unmarked = new Map<string, { page: string; query: string; impressions: number }>();
    for (const a of ranking) {
      const key = input.canonicalUrl(a.page!);
      const m = input.meta.get(key);
      if (!m) continue;

      if (!m.schemaTypes.some((t) => /^(FAQPage|QAPage|HowTo)$/.test(t))) {
        const cur = unmarked.get(key);
        if (!cur) unmarked.set(key, { page: a.page!, query: a.query, impressions: a.impressions });
        else cur.impressions += a.impressions;
      }

      if (n >= 5 || m.intro === null) continue;
      const words = contentWords(a.query);
      if (words.length === 0) continue;
      const intro = normalizeTerm(m.intro);
      const hit = words.filter((w) => intro.includes(w)).length;
      if (hit / words.length >= 0.6) continue;
      n++;
      actions.push({
        fingerprint: `answer:${site.id}:${normalizeTerm(a.query)}`,
        type: "CONTENT_UPDATE",
        title: `Répondre dès les premières lignes à ${quote(a.query)}`,
        detail:
          `La page est en position ${a.position.toFixed(1)} sur cette question (${fmtInt(a.impressions)} impressions sur 28 j) mais ses 300 premiers mots ne reprennent que ${hit} de ses ${words.length} mots-clés (${words.join(", ")}). ` +
          `Un extrait optimisé, un AI Overview ou un chatbot prennent la réponse là où elle est : mettez la question en sous-titre (H2) juste sous le H1 et répondez en deux ou trois phrases, avec un chiffre ou une source, avant tout développement.`,
        query: a.query,
        url: a.page!,
        siteId: site.id,
        priority: clamp(12 * Math.log(1 + a.impressions) + 12),
        source: "rule:answer_first",
      });
    }

    // 2. FAQPage markup on the pages that answer questions.
    if (unmarked.size >= 1) {
      const list = [...unmarked.values()].sort((a, b) => b.impressions - a.impressions);
      const total = list.reduce((s, x) => s + x.impressions, 0);
      actions.push({
        fingerprint: `faq:${site.id}`,
        type: "TECHNICAL",
        title: `Baliser en FAQPage ${list.length === 1 ? "la page qui répond" : `les ${fmtInt(list.length)} pages qui répondent`} à des questions sur ${domainOf.get(site.id) ?? site.domain}`,
        detail:
          `${fmtInt(total)} impressions sur 28 j sur des requêtes formulées en question, sans balisage FAQPage ni QAPage. ` +
          `Un bloc JSON-LD FAQPage qui reprend la question et sa réponse courte (celle des premières lignes) est ce que Google lit pour « Autres questions posées » et ce que les moteurs de réponse citent volontiers. ` +
          `Exemples : ${list.slice(0, 3).map((x) => `${x.page} (${quote(x.query)})`).join(" · ")}.`,
        url: list[0].page,
        siteId: site.id,
        priority: clamp(25 + Math.min(30, list.length * 4)),
        source: "rule:faq_markup",
      });
    }
  }
  return actions;
}
