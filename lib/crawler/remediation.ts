export const REMEDIATION: Record<string, { title: string; howToFix: string }> = {
  BROKEN_LINK: {
    title: "Lien cassé",
    howToFix:
      "Mettez à jour ou supprimez le lien cassé. Si la page cible a été déplacée, remplacez l'URL par la nouvelle destination. Mettez en place des redirections 301 pour les pages retirées.",
  },
  REDIRECT: {
    title: "Redirection détectée",
    howToFix:
      "Faites pointer les liens internes directement vers l'URL de destination finale plutôt que vers l'URL qui redirige. Éliminez les chaînes de redirections : chaque redirection doit se résoudre en un seul saut.",
  },
  MISSING_TITLE: {
    title: "Balise title manquante",
    howToFix:
      "Ajoutez une balise <title> unique de 15 à 65 caractères qui décrit fidèlement le contenu de la page et contient le mot-clé principal visé.",
  },
  MISSING_DESCRIPTION: {
    title: "Meta description manquante",
    howToFix:
      "Ajoutez une balise <meta name=\"description\"> de 50 à 160 caractères qui résume la page et incite au clic depuis les résultats de recherche.",
  },
  DUPLICATE_TITLE: {
    title: "Balise title dupliquée",
    howToFix:
      "Rédigez un titre unique pour chaque page. Si des pages ont un contenu proche, envisagez de les consolider avec une balise canonical ou de fusionner le contenu en une seule page de référence.",
  },
  DUPLICATE_DESCRIPTION: {
    title: "Meta description dupliquée",
    howToFix:
      "Rédigez une meta description unique pour chaque page. Évitez les gabarits qui produisent des descriptions identiques sur plusieurs pages.",
  },
  MISSING_H1: {
    title: "Titre H1 manquant",
    howToFix:
      "Ajoutez un unique titre H1 qui décrit clairement le sujet principal de la page. Placez-le au-dessus du contenu principal et intégrez-y naturellement les mots-clés pertinents.",
  },
  MULTIPLE_H1: {
    title: "Plusieurs titres H1",
    howToFix:
      "Ramenez la page à un seul titre H1. Convertissez les H1 supplémentaires en H2 ou H3 pour établir une hiérarchie de titres claire.",
  },
  MISSING_ALT: {
    title: "Images sans texte alternatif",
    howToFix:
      "Ajoutez un attribut alt descriptif à toutes les balises <img>. Utilisez un texte concis qui décrit le contenu de l'image. Pour les images décoratives, utilisez un attribut alt=\"\" vide.",
  },
  MISSING_CANONICAL: {
    title: "Balise canonical manquante",
    howToFix:
      "Ajoutez une balise <link rel=\"canonical\" href=\"...\"> dans le <head> pointant vers l'URL de référence de la page. Cela évite les problèmes de contenu dupliqué liés aux variantes d'URL.",
  },
  MISSING_ROBOTS: {
    title: "robots.txt manquant",
    howToFix:
      "Créez un fichier robots.txt à la racine du site. Indiquez au minimum les directives User-agent et Sitemap. Utilisez des règles Disallow pour bloquer l'exploration des pages d'administration ou dupliquées.",
  },
  MISSING_SITEMAP: {
    title: "Sitemap manquant ou incomplet",
    howToFix:
      "Créez un sitemap XML listant toutes les pages indexables et soumettez-le à la Google Search Console. Vérifiez que chaque page explorable figure dans le sitemap.",
  },
  MISSING_SCHEMA: {
    title: "Aucune donnée structurée",
    howToFix:
      "Ajoutez des données structurées JSON-LD adaptées au type de page (Article, Product, FAQPage, etc.). Validez-les avec le test des résultats enrichis de Google avant la mise en ligne.",
  },
  SLOW_PAGE: {
    title: "Réponse de page lente",
    howToFix:
      "Réduisez le temps de réponse du serveur en activant la mise en cache, en optimisant les requêtes en base et en utilisant un CDN. Visez un temps de réponse serveur sous 200 ms et un chargement total sous 3 secondes.",
  },
  MIXED_CONTENT: {
    title: "Contenu mixte (HTTP sur HTTPS)",
    howToFix:
      "Passez toutes les URL de ressources (images, scripts, feuilles de style) en HTTPS. Utilisez des URL relatives au protocole ou imposez le HTTPS via des en-têtes Content-Security-Policy.",
  },
  LARGE_PAGE: {
    title: "Page HTML trop lourde",
    howToFix:
      "Allégez la page en retirant les CSS/JS inline, en différant les ressources non critiques, en chargeant les images en lazy-loading et en minifiant le HTML. Visez moins de 3 Mo par page.",
  },
};
