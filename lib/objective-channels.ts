/**
 * Channel rules: what each site should do on Google Images, on the social
 * networks and towards the press and Discover, plus the links the pivot
 * owes to the sites still to be born. Everything comes from the crawl and
 * the Search Console rows already in the database.
 */

import { normalizeTerm } from "@/lib/objective-terms";
import type { GeneratedAction, PageMeta, QueryAgg, ScopedSite } from "@/lib/objectives";
import type { SiteSituation } from "@/lib/objective-sites";

export type ChannelInput = {
  situations: SiteSituation[];
  queries: QueryAgg[];
  hub: ScopedSite | null;
  focusTerms: string[];
  /** crawled page meta keyed by canonical url */
  meta: Map<string, PageMeta>;
  canonicalUrl: (u: string) => string;
};

const quote = (s: string) => `« ${s} »`;
const fmtInt = (n: number) => n.toLocaleString("fr-FR");
const clamp = (p: number) => Math.max(1, Math.min(100, Math.round(p)));
const host = (d: string) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("%n", fmtInt(n)));

function slug(s: string): string {
  return normalizeTerm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function channelRules(input: ChannelInput): GeneratedAction[] {
  const actions: GeneratedAction[] = [];
  const { situations, queries, hub } = input;
  const focusLabel = input.focusTerms[0] ?? null;

  for (const s of situations) {
    const site = s.site;
    // A creator profile has no pages, images or markup of its own; its
    // queries feed the social rules instead.
    if (site.kind === "PROFILE") continue;
    const label = host(site.domain);
    const crawlUrl = `/sites/${site.id}/crawl`;

    // --- Images: the technical floor, then the image that is the answer.
    if (s.crawl.crawled && s.crawl.imagesMissingAlt > 0) {
      actions.push({
        fingerprint: `channel:alt:${site.id}`,
        type: "TECHNICAL",
        title: `Renseigner ${plural(s.crawl.imagesMissingAlt, "le texte alternatif manquant", "les %n textes alternatifs manquants")} sur ${label}`,
        detail:
          `${fmtInt(s.crawl.pagesMissingAlt)} page(s) sur ${fmtInt(s.crawl.pages)} ont des images sans alt au dernier crawl. ` +
          `Google Images ne classe que ce qu'il peut lire : un alt descriptif en français, un nom de fichier parlant (bonjour-en-savoyard.webp plutôt que IMG_0234.jpg), une légende visible, et l'image dans le sitemap. ` +
          `La liste des pages est dans le crawl.`,
        url: crawlUrl,
        siteId: site.id,
        priority: clamp(30 + Math.min(30, s.crawl.imagesMissingAlt / 5)),
        source: "rule:images_alt",
      });
    }

    const winners = queries
      .filter((a) => a.siteId === site.id && a.position <= 10 && a.impressions >= 30 && a.bucket !== "rival")
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 3);
    for (const a of winners) {
      actions.push({
        fingerprint: `channel:image:${site.id}:${normalizeTerm(a.query)}`,
        type: "CONTENT_UPDATE",
        title: `Créer l'image qui répond à ${quote(a.query)}`,
        detail:
          `Position ${a.position.toFixed(1)}, ${fmtInt(a.impressions)} impressions sur 28 j : la page gagne sur le web, l'onglet Images reste à prendre, avec une concurrence bien plus faible. ` +
          `Un visuel qui contient la réponse (carte, infographie, photo légendée), alt « ${a.query} », fichier ${slug(a.query)}.webp, placé en haut de ${a.page ?? "la page"} ; le même visuel se partage tel quel sur les réseaux et s'épingle sur Pinterest.`,
        query: a.query,
        url: a.page ?? undefined,
        siteId: site.id,
        priority: clamp(10 * Math.log(1 + a.impressions) + 8),
        source: "rule:image_answer",
      });
    }

    // --- Social: no card, no share worth the name.
    if (s.crawl.crawled && s.crawl.pagesMissingSocial > 0) {
      const ratio = s.crawl.pagesMissingSocial / Math.max(1, s.crawl.pages);
      actions.push({
        fingerprint: `channel:og:${site.id}`,
        type: "TECHNICAL",
        title: `Ajouter les cartes de partage Open Graph sur ${label} (${plural(s.crawl.pagesMissingSocial, "1 page", "%n pages")})`,
        detail:
          `${Math.round(ratio * 100)} % des pages crawlées n'ont pas og:title et og:image : chaque partage sur Facebook, LinkedIn ou X y est un lien nu, sans vignette. ` +
          `og:title, og:description, og:image (1200×630, URL absolue), og:url et twitter:card=summary_large_image, générés par le plugin SEO page par page. À faire avant toute campagne sociale.`,
        url: crawlUrl,
        siteId: site.id,
        priority: clamp(35 + ratio * 30),
        source: "rule:social_meta",
      });
    }

    // --- Press, News and Discover.
    if (s.crawl.crawled) {
      const ranking = queries.filter((a) => a.siteId === site.id && a.page && a.position <= 20 && a.impressions >= 10);
      const seen = new Set<string>();
      const unmarked: string[] = [];
      for (const a of ranking) {
        const key = input.canonicalUrl(a.page!);
        if (seen.has(key)) continue;
        seen.add(key);
        const m = input.meta.get(key);
        if (!m) continue;
        if (!m.schemaTypes.some((t) => /Article|BlogPosting|Event|Product|FAQPage|HowTo/.test(t))) unmarked.push(a.page!);
      }
      if (unmarked.length >= 2) {
        actions.push({
          fingerprint: `channel:article:${site.id}`,
          type: "TECHNICAL",
          title: `Baliser en Article ${plural(unmarked.length, "la page qui se positionne", "les %n pages qui se positionnent")} sur ${label}`,
          detail:
            `Ces pages sont vues dans Google mais ne déclarent aucun type de contenu en JSON-LD (Article, BlogPosting, Event…). ` +
            `Le balisage Article avec headline, datePublished, dateModified, author et image ≥ 1200 px est ce que Discover et Google Actualités lisent. ` +
            `Exemples : ${unmarked.slice(0, 3).join(", ")}.`,
          url: unmarked[0],
          siteId: site.id,
          priority: clamp(30 + Math.min(25, unmarked.length * 3)),
          source: "rule:article_markup",
        });
      }

      if (s.crawl.eventPages >= 3 || s.crawl.newsPages >= 3) {
        const what = s.crawl.eventPages >= 3 ? `${fmtInt(s.crawl.eventPages)} pages balisées Event` : `${fmtInt(s.crawl.newsPages)} pages NewsArticle`;
        actions.push({
          fingerprint: `channel:news:${site.id}`,
          type: "PRESS",
          title: `Candidater à Google Actualités et viser Discover avec ${label}`,
          detail:
            `${what} au dernier crawl : c'est du contenu daté et frais, exactement ce que Discover et Google Actualités reprennent. ` +
            `Publisher Center (publishercenter.google.com) : déclarer la publication, sa rubrique et son flux ; sur le site, max-image-preview:large dans la balise robots, images ≥ 1200 px de large, dateline visible, balisage NewsArticle ou Event complet. ` +
            `Le canal se mesure ensuite dans les types de recherche News et Discover de la Search Console.`,
          url: `https://${label}/`,
          siteId: site.id,
          priority: 55,
          source: "rule:google_news",
        });
      }
    }
  }

  // --- The pivot lends its authority to the sites still to be born.
  if (hub) {
    const hubPages = queries
      .filter((a) => a.siteId === hub.id && a.page && a.bucket !== "rival")
      .sort((a, b) => b.impressions - a.impressions);
    const byPage = new Map<string, { page: string; impressions: number; query: string }>();
    for (const a of hubPages) {
      const cur = byPage.get(a.page!);
      if (cur) cur.impressions += a.impressions;
      else byPage.set(a.page!, { page: a.page!, impressions: a.impressions, query: a.query });
    }
    const top = [...byPage.values()].sort((a, b) => b.impressions - a.impressions).slice(0, 3);
    if (top.length > 0) {
      for (const s of situations) {
        if (s.role !== "naissant" && s.role !== "secondaire") continue;
        if (s.site.id === hub.id || s.site.kind === "PROFILE") continue;
        if (s.role === "secondaire" && s.clicks > 0) continue;
        const weak = host(s.site.domain);
        actions.push({
          fingerprint: `channel:hub:${s.site.id}`,
          type: "INTERNAL_LINK",
          title: `Lier ${weak} depuis les pages fortes de ${host(hub.domain)}`,
          detail:
            `${weak} est vu (${fmtInt(s.impressions)} impressions sur vos termes) mais ne reçoit ${s.clicks === 0 ? "aucun clic" : `que ${fmtInt(s.clicks)} clics`}. ` +
            `Le site pivot prête son autorité : un lien en contexte${focusLabel ? `, ancré sur ${quote(focusLabel)} ou sur le sujet de la page` : ""}, depuis ` +
            top.map((t) => `${t.page} (${fmtInt(t.impressions)} impr.)`).join(", ") +
            `, vers la page de ${weak} qui traite le même sujet. Un lien par page, dans le corps du texte, jamais en pied de page.`,
          url: top[0].page,
          siteId: hub.id,
          priority: clamp(40 + Math.min(25, s.impressions / 20)),
          source: "rule:hub_links",
        });
      }
    }
  }

  return actions;
}
