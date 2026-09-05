/**
 * Ready-made objective trees.
 *
 * A template is instantiated for one user: its site matchers are resolved
 * against that user's sites by substring on the domain, so the same template
 * works whatever the exact GSC property shape was when the site was added.
 *
 * Templates are structure only — no vocabulary, no entity name, no site of
 * anyone's in particular. A template that bakes in one user's own content
 * (their language, their association, their competitors) stops being a
 * platform feature and starts being that user's data checked into shared
 * code: every other workspace would see it, and the day that user's own
 * copy gets deleted, the "recovery" path would depend on code meant for
 * everyone. What a user types into an objective belongs to that objective,
 * nowhere else.
 */

export type ObjectiveTemplateNode = {
  title: string;
  description?: string;
  /** substrings matched against site domains; empty = every site */
  siteMatch?: string[];
  focusTerms: string[];
  rivalTerms: string[];
  targetShare?: number;
  entityName?: string;
  wikiArticles?: string[];
  mediaBlogs?: string[];
  guestSites?: string[];
  socialProfiles?: string[];
  directories?: string[];
  rivalSites?: string[];
  children?: ObjectiveTemplateNode[];
  /**
   * Instantiate this node once per site of the workspace instead of once:
   * "{domain}" in the title and description is replaced by the site's
   * domain, and the node's scope is that one site.
   */
  perSite?: boolean;
  /**
   * Add one child per channel (surface) under this node. Channel children
   * carry no terms or sites of their own: they inherit the node's.
   */
  channels?: boolean;
};

export type ObjectiveTemplate = {
  key: string;
  label: string;
  summary: string;
  root: ObjectiveTemplateNode;
};

export const objectiveTemplates: ObjectiveTemplate[] = [
  {
    key: "multicanal",
    label: "Stratégie multicanal",
    summary:
      "Un but, six canaux coordonnés. La racine porte le but et son vocabulaire (à renseigner : termes à défendre, termes concurrents, entité) ; six sous-objectifs, un par canal — Sites, Réponses Google, Wikipédia et IA, Images, Réseaux, Presse — héritent de ce vocabulaire et ne gardent que leurs tâches. La racine montre le plan coordonné par sujet : pour chaque requête, la page, puis l'image, puis le post, puis le billet.",
    root: {
      title: "Stratégie multicanal",
      description:
        "Un seul but, décliné par canal. Renseignez ici le vocabulaire à imposer et l'entité : chaque canal en hérite. Le plan coordonné par sujet, en bas de cette page, enchaîne les canaux sur chaque requête qui compte.",
      focusTerms: [],
      rivalTerms: [],
      channels: true,
    },
  },
];

export function findObjectiveTemplate(key: string) {
  return objectiveTemplates.find((t) => t.key === key) ?? null;
}
