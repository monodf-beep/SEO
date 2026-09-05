/**
 * Ready-made objective trees.
 *
 * A template is instantiated for one user: its site matchers are resolved
 * against that user's sites by substring on the domain, so the same template
 * works whatever the exact GSC property shape was when the site was added.
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
};

export type ObjectiveTemplate = {
  key: string;
  label: string;
  summary: string;
  root: ObjectiveTemplateNode;
};

const RIVAL_LANGUAGE_NAMES = [
  "francoprovençal",
  "franco-provençal",
  "francoprovencal",
  "arpitan",
  "patois savoyard",
  "patois vaudois",
  "patois valdôtain",
  "patois",
];

export const objectiveTemplates: ObjectiveTemplate[] = [
  {
    key: "multicanal",
    label: "Stratégie multicanal",
    summary:
      "Un plan d'action sur tous vos sites, sans vocabulaire imposé : Google Images, presse et blog, réseaux sociaux. La racine voit où en est chaque site et lui attribue un rôle (pivot, secondaire, naissant) ; un sous-objectif par site porte ses tâches propres — textes alternatifs, cartes de partage, balisage Article, candidature Google Actualités, liens depuis le site pivot. Ajoutez ensuite vos termes pour mesurer la part de demande.",
    root: {
      title: "Stratégie multicanal",
      description:
        "Trois canaux, un rôle par site. Images : chaque page qui gagne sur le web doit aussi gagner dans l'onglet Images. Presse et blog : du contenu balisé, daté, repris par Discover et Google Actualités, et des liens d'autorité. Réseaux : des cartes de partage sur chaque page, et le site pivot qui prête sa force aux sites naissants.",
      focusTerms: [],
      rivalTerms: [],
      children: [
        {
          perSite: true,
          title: "Faire progresser {domain}",
          description:
            "Les tâches propres à {domain} sur les trois canaux : Images (alt, visuels-réponses), presse et blog (balisage, actualités), réseaux (cartes de partage). Le rôle du site dans l'ensemble se lit sur l'objectif parent.",
          siteMatch: ["{domain}"],
          focusTerms: [],
          rivalTerms: [],
        },
      ],
    },
  },
  {
    key: "langue-savoyarde",
    label: "Visibilité de la langue savoyarde",
    summary:
      "Un objectif racine sur les 4 sites, avec deux sous-objectifs : faire de langue-savoyarde.com la référence, et imposer le terme « langue savoyarde » face à francoprovençal, arpitan et patois. La racine porte aussi la notoriété : Wikipédia, Wikidata, blogs de médias et sites où vous publiez.",
    root: {
      title: "Développer la visibilité de la langue savoyarde sur internet",
      description:
        "Que les personnes qui cherchent la langue de la Savoie tombent sur des contenus qui la nomment « langue savoyarde », et que ces contenus soient les vôtres.",
      focusTerms: ["langue savoyarde", "savoyard", "savoyarde"],
      rivalTerms: RIVAL_LANGUAGE_NAMES,
      targetShare: 0.5,
      entityName: "Institut de la langue savoyarde",
      wikiArticles: ["Savoyard (langue)", "Institut de la langue savoyarde", "Francoprovençal", "Patois savoyard"],
      mediaBlogs: ["mediapart.fr", "letemps.ch"],
      guestSites: ["mordus2savoie.com", "nosalpes.eu"],
      children: [
        {
          title: "Faire de langue-savoyarde.com la référence sur la langue",
          description:
            "L'Institut de la langue savoyarde doit être la première réponse sur les requêtes qui portent sur la langue elle-même : apprendre, traduire, expressions, grammaire.",
          siteMatch: ["langue-savoyarde"],
          focusTerms: ["langue savoyarde", "savoyard", "savoyarde"],
          rivalTerms: RIVAL_LANGUAGE_NAMES,
          targetShare: 0.6,
        },
        {
          title:
            "Imposer « langue savoyarde » face à francoprovençal, arpitan et patois",
          description:
            "Capter les requêtes formulées avec les noms concurrents et y installer votre terme dès le titre, pour que la part de demande du terme « langue savoyarde » progresse.",
          focusTerms: ["langue savoyarde", "savoyard langue", "langue savoyard"],
          rivalTerms: RIVAL_LANGUAGE_NAMES,
          targetShare: 0.3,
        },
      ],
    },
  },
];

export function findObjectiveTemplate(key: string) {
  return objectiveTemplates.find((t) => t.key === key) ?? null;
}
