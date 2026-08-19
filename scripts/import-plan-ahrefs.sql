-- Import du plan de mots-clés Ahrefs (Sujets d'articles.xlsx) dans le suivi
-- de positions CrawlSEO, avec répartition des territoires entre les deux
-- sites pour éviter qu'ils se cannibalisent mutuellement.
--
--   cahiers-savioz.fr    → francoprovençal large : valdôtain, Suisse, Italie,
--                          arpitan « international », dictionnaires frp
--   langue-savoyarde.com → savoyard / patois savoyard (apprentissage)
--
-- Ré-exécutable : ON CONFLICT ignore ce qui existe déjà.

-- ============ cahiers-savioz.fr ============
INSERT INTO "SavedKeyword" (id, "siteId", query, notes, "createdAt")
SELECT 'sk_' || md5('cmsz7wb7h0001pz01us93mkkt' || q), 'cmsz7wb7h0001pz01us93mkkt', q, n, now()
FROM (VALUES
  ('valdôtain',                    'Plan Ahrefs — niche naturelle GSC (pos 16.7, à consolider)'),
  ('patois valdotain',             'Plan Ahrefs — niche naturelle GSC'),
  ('francoprovençal',              'Plan Ahrefs P1 — LS ne ressort pas (note Feuille 3)'),
  ('le francoprovençal',           'Plan Ahrefs — Feuille 3'),
  ('dictionnaire francoprovençal', 'Plan Ahrefs — Feuille 3'),
  ('dictionnaire en arpitan',      'Plan Ahrefs — Feuille 3'),
  ('arpitan italie',               'Plan Ahrefs P2 — catégorie Réel'),
  ('arpitan suisse',               'Plan Ahrefs P2'),
  ('arpitan valais',               'Plan Ahrefs P2'),
  ('arpitan genevois',             'Plan Ahrefs P2'),
  ('arpitan bressan',              'Plan Ahrefs P2'),
  ('où est parlé le francoprovençal', 'Plan Ahrefs — Feuille 3'),
  ('trésor arpitan',               'Plan Ahrefs P1'),
  ('tintin en arpitan',            'Plan Ahrefs P1'),
  ('conjugaison arpitan',          'Plan Ahrefs P1'),
  ('arpitan carte',                'Plan Ahrefs P1'),
  ('patois vaudois',               'Niche GSC existante'),
  ('van gennep',                   'Niche GSC existante — ethnographie')
) AS t(q, n)
ON CONFLICT ("siteId", query) DO NOTHING;

-- ============ langue-savoyarde.com ============
INSERT INTO "SavedKeyword" (id, "siteId", query, notes, "createdAt")
SELECT 'sk_' || md5('cmsz85fil00zopz018ad0p5yh' || q), 'cmsz85fil00zopz018ad0p5yh', q, n, now()
FROM (VALUES
  ('y savoyard',                     'Plan Ahrefs P1'),
  ('expression patois savoyard',     'Plan Ahrefs P1 — pos 11.1, striking distance'),
  ('patois haut-savoyard',           'Plan Ahrefs P1 — volume 100-1k, pos 8.8'),
  ('patois savoyard dictionnaire',   'Plan Ahrefs P1 — pos 63.5, article à créer'),
  ('traduction patois savoyard français', 'Plan Ahrefs P1'),
  ('prénom patois savoyard',         'Plan Ahrefs P1'),
  ('noël savoyard',                  'Plan Ahrefs P1'),
  ('accent savoyard',                'Plan Ahrefs P1 — pos 38.6'),
  ('savoyard traduction',            'Plan Ahrefs P1'),
  ('z et x savoyard',                'Plan Ahrefs P1'),
  ('comment ça va en patois savoyard', 'Plan Ahrefs P1'),
  ('arvi pa',                        'Plan Ahrefs P1 — pos 2.6, consolider'),
  ('apprendre patois savoyard',      'Plan Ahrefs P1 — pos 2.6, consolider'),
  ('patois savoyard insulte',        'Plan Ahrefs P1 — pos 25.5'),
  ('monchu patois savoyard',         'Plan Ahrefs P1 — cannibalisation à résoudre'),
  ('parler patois savoyard',         'Plan Ahrefs P1'),
  ('proverbe patois savoyard',       'Plan Ahrefs P1'),
  ('savoyard ou arpitan ou franco-provençal', 'Plan Ahrefs P1 — prise de position'),
  ('langues de france',              'Plan Ahrefs P1 — prise de position')
) AS t(q, n)
ON CONFLICT ("siteId", query) DO NOTHING;

SELECT s.domain, count(*) AS saved_keywords
FROM "SavedKeyword" sk JOIN "Site" s ON s.id = sk."siteId"
GROUP BY s.domain;
