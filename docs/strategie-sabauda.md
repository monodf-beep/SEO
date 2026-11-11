# Stratégie Sabauda

> Plan d'action multicanal — Google Images, presse & blogging, réseaux sociaux — pour l'écosystème langue-savoyarde, agendasabauda, cahiers-savioz et franckmonod.
>
> Franck Monod · 4 sites · données Search Console au 19 août 2026

## Où en sont les sites

| Site | Mots-clés | Pages | Situation (28 jours) |
|---|---:|---:|---|
| **langue-savoyarde.com** | 1 768 | 1 382 | Le moteur de l'écosystème. Positions 2–8 sur la niche patois : « bonjour en savoyard » (pos. 2,6), « expression savoyarde » (pos. 7,8, 70 impressions). |
| **agendasabauda.eu** | 169 | 338 | Bien placé sur les événements précis (« fiera di vicoforte » pos. 2,8) mais page 5 sur les requêtes génériques : « eventi aosta » pos. 45–48. |
| **cahiers-savioz.fr** | 25 | 60 | Encore invisible : positions 16–68, zéro clic. Priorité : autorité et notoriété. |
| **franckmonod.eu** | 1 | 9 | Site vitrine tout neuf. Rôle : signature personnelle et carrefour vers les trois autres. |

## Les trois canaux

### Google Images — le canal le plus sous-exploité

Votre univers — expressions en patois, affiches d'événements, cartes des pays de Savoie, documents d'archives — est visuel par nature, et Google Images est un onglet de recherche à part entière avec sa propre concurrence, bien plus faible que le web classique.

Le socle technique, valable partout : chaque image porte un **alt descriptif en français** (« Carte des expressions savoyardes pour dire bonjour » plutôt que « IMG_0234 »), un **nom de fichier parlant** (`bonjour-en-savoyard.webp`), un format **WebP compressé**, une légende visible sous l'image, et une entrée dans le **sitemap images**. Le crawl CrawlSEO signale déjà les alt manquants (issue `MISSING_ALT`) : c'est la liste de travail.

Le levier éditorial : créer des images qui sont la réponse. Une carte-visuel « 10 façons de dire bonjour en savoyard » se positionne dans Google Images sur la requête reine du site, se partage telle quelle sur les réseaux, et s'épingle sur Pinterest.

### Presse & blogging — autorité, Google News et Discover

Trois étages complémentaires :

1. **Le blog régulier** — un article de fond par semaine et par site prioritaire, construit sur les questions réelles que les gens posent (onglet Questions : « quel fromage ramener de savoie », « peut-on… », « combien… »). Chaque article coiffe une question en H1, y répond dans le premier paragraphe (format extrait optimisé), et porte le balisage `Article` en JSON-LD.
2. **Google News & Discover** — le gisement d'agendasabauda. Un agenda d'événements est exactement le contenu frais que Discover et News aiment : balisage `Event` et `NewsArticle`, grandes images (1200 px et plus, via `max-image-preview:large`), datelines claires, publication au fil de l'actualité. Objectif : demander l'inclusion dans Google Actualités via le Publisher Center.
3. **La presse tierce** — chaque parution dans un média local (Nos Alpes, Le Dauphiné, La Stampa locale, Aostasera, France 3 Alpes, radios patoisantes) vaut un lien d'autorité qu'aucune optimisation technique ne remplace. Matière à communiqués : le concours d'expressions savoyardes, la sortie d'un Cahier Savioz, le bilan « l'été des fêtes dans les pays de Savoie ». C'est le seul levier réaliste pour sortir cahiers-savioz de l'invisibilité.

### Réseaux sociaux — amplification et signaux de marque

Les réseaux n'influencent pas directement le classement, mais ils font trois choses que Google voit : du trafic de marque, des liens gagnés quand un contenu circule, et des visites qui nourrissent Discover.

Le prérequis technique, désormais audité par CrawlSEO : les balises **Open Graph** (og:title, og:image) et **Twitter Card** sur chaque page (issue `MISSING_SOCIAL_META`). Sans elles, chaque partage est un lien nu sans vignette.

Répartition par contenu : **Facebook** (groupes patois, Savoie, Vallée d'Aoste) · **Instagram + Pinterest** pour les cartes d'expressions et visuels d'événements · **LinkedIn** pour franckmonod.eu et les carousels Canva · **WhatsApp/Telegram** en diffusion hebdo de l'agenda. Règle d'or : chaque publication renvoie vers une page du site, jamais l'inverse.

## Priorités par site

### langue-savoyarde.com
*1 768 mots-clés · niche forte · canal dominant : Images + social*

1. Série de cartes-visuels « expressions savoyardes » (bonjour, je t'aime, trinquer…), alt et nom de fichier optimisés, épinglée sur Pinterest et déclinée en carousel Instagram. « Bonjour en savoyard » est déjà pos. 2,6 : l'image doit suivre.
2. Pousser « expression savoyarde » (pos. 7,8, 70 impressions, CTR 1,4 %) vers le top 3 : enrichir la page, répondre aux questions PAA, soigner title/description.
3. Groupes Facebook patois : partage hebdomadaire d'une expression avec lien vers le dictionnaire.

### agendasabauda.eu
*169 mots-clés · fort potentiel News/Discover · canal dominant : presse + social*

1. Pages piliers par ville (« eventi Aosta », « eventi Valle d'Aosta », « que faire à Nice ce week-end ») — aujourd'hui pos. 45–48, la structure par événement ne couvre pas ces requêtes génériques qui font le volume.
2. Balisage Event + NewsArticle et candidature au Publisher Center ; grandes images pour viser Discover.
3. Rendez-vous social hebdo « les 5 sorties du week-end » (IG/Facebook/WhatsApp), publié le jeudi.

### cahiers-savioz.fr
*25 mots-clés · zéro clic · canal dominant : presse & autorité*

1. Relations presse à chaque parution : communiqué + exemplaire aux médias régionaux et aux revues de linguistique — les backlinks d'autorité sont ce qui manque pour sortir des positions 16–68.
2. Un article de vulgarisation par Cahier (« qu'est-ce que le valdôtain ? ») ciblant les requêtes déjà touchées sans clic (valdôtain, patois valdostano).
3. Maillage depuis langue-savoyarde : chaque entrée du dictionnaire cite le Cahier pertinent.

### franckmonod.eu
*9 pages · site signature · canal dominant : LinkedIn*

1. Hub de l'écosystème : une page qui présente et lie les trois projets, balisage `Person` avec `sameAs` vers les profils sociaux.
2. Chaque carousel LinkedIn renvoie ici.

## Le suivi dans CrawlSEO

| Canal | Ce qui le mesure | Cadence |
|---|---|---|
| Images | Page Search Types (clics Web vs Images vs Video), issues `MISSING_ALT` du crawl | Mensuel |
| Presse & blog | Surfaces News et Discover dans Search Types, Backlinks (DataForSEO), onglet Questions pour les sujets d'articles | À chaque parution |
| Réseaux sociaux | Issues `MISSING_SOCIAL_META` (Open Graph / Twitter Card) à chaque crawl | À chaque crawl |

> Discover et News ne remontent des données dans Search Types que lorsque Google commence à y servir vos pages — un zéro aujourd'hui est normal ; c'est la ligne à surveiller après la mise en place du balisage sur agendasabauda.

## Démarrage sur quatre semaines

| Semaine | Action | Site |
|---:|---|---|
| 1 | Crawl complet des 4 sites → corriger alt manquants et balises Open Graph signalés | Tous |
| 2 | Créer les 3 premières cartes-visuels d'expressions + comptes Pinterest | langue-savoyarde |
| 3 | Pages piliers par ville + balisage Event, candidature Publisher Center | agendasabauda |
| 4 | Premier rendez-vous hebdo social (expression du jeudi + sorties du week-end) et premier communiqué de presse | Tous |

---
*Établi le 19 août 2026 · données Google Search Console via CrawlSEO*
