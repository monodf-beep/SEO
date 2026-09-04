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
  children?: ObjectiveTemplateNode[];
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
