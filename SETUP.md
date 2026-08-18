# Déploiement CrawlSEO

Ce dépôt contient le code de [CrawlSEO](https://github.com/crawlseo/crawlseo)
(MIT), une plateforme SEO auto-hébergée : Search Console, crawler, Core Web
Vitals, suivi de positions, alertes et serveur MCP.

Tout ce qui est nécessaire au fonctionnement est gratuit. DataForSEO reste
optionnel et ne sert qu'à la recherche de mots-clés avec volumes et à l'analyse
de backlinks.

## Prérequis

- Docker + Docker Compose
- Un compte Google avec au moins une propriété dans la Search Console
- Node.js 20+ uniquement si tu veux utiliser le serveur MCP depuis ta machine

## 1. Générer la configuration

```bash
./scripts/bootstrap.sh
```

Le script produit deux fichiers, tous les deux ignorés par git :

- `.env` — utilisé par Docker Compose (secrets aléatoires, base sur le réseau
  interne `db:5432`)
- `.env.local` — utilisé par le serveur MCP et l'outillage lancé depuis l'hôte
  (même base, mais via `localhost:5432`)

Pour un déploiement derrière un nom de domaine, passe l'URL publique :

```bash
BASE_URL=https://seo.mondomaine.fr ./scripts/bootstrap.sh
```

## 2. Créer les identifiants Google OAuth

C'est la seule étape manuelle, et elle est obligatoire : sans elle, pas de
données Search Console.

1. Ouvrir la [Google Cloud Console](https://console.cloud.google.com/) et créer
   un projet
2. Activer l'API **Google Search Console** dans la bibliothèque d'API
3. **Identifiants** → **Créer des identifiants** → **ID client OAuth 2.0**
4. Type d'application : **Application Web**
5. URI de redirection autorisée :
   - en local : `http://localhost:3000/api/auth/callback/google`
   - en production : `https://seo.mondomaine.fr/api/auth/callback/google`
6. Reporter l'ID client et le secret dans `.env` :

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Portées demandées par l'application : `openid`, `email`, `profile` et
`https://www.googleapis.com/auth/webmasters.readonly` — lecture seule, CrawlSEO
ne peut rien modifier dans la Search Console.

## 3. Démarrer

```bash
docker compose pull
docker compose up -d
```

Compose récupère l'image préconstruite `ghcr.io/crawlseo/crawlseo:latest`
(amd64 et arm64). Les migrations Prisma s'exécutent automatiquement au
démarrage du conteneur.

L'interface est sur <http://localhost:3000> : connexion avec Google, puis ajout
du premier site.

Pour épingler une version au lieu de suivre `latest`, ajouter dans `.env` :

```
CRAWLSEO_IMAGE=ghcr.io/crawlseo/crawlseo:1.2.3
```

## 4. Fermer les inscriptions

Une fois ton compte créé, décommente cette ligne dans `.env` puis relance
`docker compose up -d` :

```
DISABLE_REGISTRATION=true
```

Sans ça, n'importe qui atteignant l'URL peut se créer un compte.

## Brancher le serveur MCP sur Claude Code

Le serveur MCP expose 10 outils (`list_sites`, `get_keywords`, `run_crawl`,
`get_crawl_issues`, `get_opportunities`…) et lit directement la base.

`scripts/mcp-local.sh` charge `.env.local` puis lance le serveur, ce qui évite
de mettre des identifiants dans un fichier de configuration versionné. Ajoute
ceci à ton `.mcp.json` ou à `.claude/settings.json` :

```json
{
  "mcpServers": {
    "crawlseo": {
      "command": "./scripts/mcp-local.sh",
      "args": []
    }
  }
}
```

Le serveur a besoin que la base Compose tourne (`docker compose up -d db` au
minimum).

## Suivre les mises à jour amont

Le code a été copié depuis l'amont, sans son historique git. Pour pouvoir
récupérer les correctifs :

```bash
git remote add upstream https://github.com/crawlseo/crawlseo.git
git fetch upstream
git merge upstream/main --allow-unrelated-histories
```

Le premier merge demandera de résoudre quelques conflits sur les fichiers
ajoutés ici (`SETUP.md`, `scripts/bootstrap.sh`, `scripts/mcp-local.sh`).

## Ce qui reste payant

| Fonction | Gratuit | Condition |
|---|---|---|
| Analytics Search Console | ✅ | tes propres sites uniquement |
| Crawl / audit (2 000 pages) | ✅ | — |
| Core Web Vitals | ✅ | quota PageSpeed limité sans clé API |
| Suivi de positions | ✅ | via l'historique Search Console |
| Alertes | ✅ | SMTP, Slack ou Telegram à configurer |
| Recherche de mots-clés | ⚠️ | Google Autocomplete gratuit, mais sans volumes ni difficulté |
| Backlinks | ❌ | nécessite une clé DataForSEO |

## Options utiles dans `.env`

```
# Quota Core Web Vitals plus élevé (clé PageSpeed Insights, gratuite)
GOOGLE_PAGESPEED_KEY=

# Planification des tâches
CRAWL_SCHEDULE=0 0 * * 0        # crawl hebdomadaire, dimanche minuit
GSC_SYNC_SCHEDULE=0 2 * * *     # synchro Search Console, 2h UTC
VITALS_SCHEDULE=0 3 * * 0       # vitals hebdomadaires

# Alertes
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SLACK_WEBHOOK_URL=
TELEGRAM_BOT_TOKEN=
```

## Dépannage

**`redirect_uri_mismatch` à la connexion** — l'URI de redirection déclarée dans
la Google Cloud Console doit correspondre exactement à `NEXTAUTH_URL` +
`/api/auth/callback/google`, protocole et port compris.

**Aucun site proposé après connexion** — le compte Google utilisé doit être
propriétaire ou utilisateur autorisé d'une propriété Search Console vérifiée.

**Derrière un reverse proxy** — `AUTH_TRUST_HOST=true` est déjà positionné par
le bootstrap ; vérifie aussi que `NEXTAUTH_URL` pointe bien vers l'URL publique.

**Le serveur MCP ne démarre pas** — vérifie que `.env.local` existe et que la
base est joignable : `docker compose ps db`.

## Développement local

```bash
npm ci
npx prisma generate
npm run dev
```

Vérifications avant commit :

```bash
npx tsc --noEmit
npm run lint
```
