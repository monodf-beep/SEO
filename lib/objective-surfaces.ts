/**
 * The surface a task works on. SEO, AEO and GEO are not three disciplines
 * but three places the same page can show up: the ten links, the answer
 * Google extracts (snippet, "Autres questions", AI Overviews), and the
 * citation in a ChatGPT or Perplexity answer. Images, social and press are
 * the other channels of a multichannel objective. Derived from the rule that
 * produced the task, so nothing is stored.
 */

import type { ActionType } from "@prisma/client";

export type Surface = "seo" | "aeo" | "geo" | "images" | "social" | "presse";

export const SURFACE_ORDER: Surface[] = ["seo", "aeo", "geo", "images", "social", "presse"];

export const SURFACE_LABELS: Record<Surface, string> = {
  seo: "SEO",
  aeo: "AEO",
  geo: "GEO",
  images: "Images",
  social: "Réseaux",
  presse: "Presse",
};

export const SURFACE_HINTS: Record<Surface, string> = {
  seo: "Les dix liens bleus de Google : positions, titres, pages, liens entre vos sites.",
  aeo: "La réponse extraite sur Google même : extrait optimisé, « Autres questions posées », AI Overviews, fiche Google.",
  geo: "La citation dans une réponse de ChatGPT, Perplexity ou Gemini : Wikipédia, Wikidata, entité cohérente, sources que les IA lisent.",
  images: "L'onglet Images de Google : textes alternatifs, visuels qui sont la réponse.",
  social: "Les réseaux sociaux : posts, conversations, cartes de partage.",
  presse: "Médias, blogs invités, Google Actualités et Discover.",
};

const BY_SOURCE: Array<[RegExp, Surface]> = [
  [/^rule:(question|paa|faq_markup|answer_first|google_business_profile)$/, "aeo"],
  [/^rule:(wikipedia_|wikidata_|organization_schema|directory|social_profile|ai_citation|conversation_(reddit|youtube))/, "geo"],
  [/^rule:(images_alt|image_answer)$/, "images"],
  [/^rule:(social_|conversation_|youtube_)/, "social"],
  [/^rule:(media_blog|guest_article|google_news|article_markup)$/, "presse"],
];

export function surfaceOf(source: string | null | undefined, type: ActionType): Surface {
  if (source) for (const [re, surface] of BY_SOURCE) if (re.test(source)) return surface;
  // Manual tasks and older rules: the type is the best hint left.
  switch (type) {
    case "WIKIPEDIA":
    case "AI_VISIBILITY":
      return "geo";
    case "SOCIAL":
      return "social";
    case "PRESS":
      return "presse";
    case "PROFILE":
      return "aeo";
    default:
      return "seo";
  }
}
