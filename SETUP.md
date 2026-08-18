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

## Déploiement en production (VPS + HTTPS)

C'est le chemin recommandé : Google refuse les URI de redirection OAuth en
`http://` sur autre chose que `localhost`, donc une adresse IP nue ne permet pas
de se connecter. Il faut un nom de domaine et un certificat.

### a. Obtenir un sous-domaine gratuit

Si tu ne possèdes pas déjà un domaine, [DuckDNS](https://duckdns.org) en donne
un permanent et gratuit, compatible Let's Encrypt :

1. Se connecter sur <https://duckdns.org> (GitHub, Google ou Reddit)
2. Réserver un sous-domaine — la configuration par défaut ici utilise
   **`siip-seo`**, donc `siip-seo.duckdns.org`
3. Coller l'IPv4 publique du VPS dans le champ « current ip » et valider

Vérifier depuis le VPS que la résolution est bonne :

```bash
getent ahostsv4 siip-seo.duckdns.org
curl -s https://api.ipify.org    # doit afficher la même IP
```

Si tu possèdes déjà un domaine en `siip`, saute cette étape et crée simplement
un enregistrement A vers l'IP du VPS.

### b. Ouvrir les ports 80 et 443

Let's Encrypt valide le certificat via le port 80. Sur un VPS Hostinger, penser
au pare-feu du panneau d'administration **et** à celui de la machine :

```bash
ufw allow 80/tcp && ufw allow 443/tcp
```

Le port 3000 doit rester fermé : la stack de production ne l'expose pas.

### c. Déployer

```bash
cd /opt
git clone -b claude/opensource-seo-platform-cj6dkd \
  https://github.com/monodf-beep/SEO.git crawlseo
cd crawlseo

DOMAIN=siip-seo.duckdns.org ./scripts/deploy.sh
```

Le premier passage génère `.env` puis s'arrête pour réclamer les identifiants
Google OAuth (étape 2 ci-dessous). Une fois collés dans `.env`, relancer la même
commande : elle récupère les images, démarre Caddy, l'application et Postgres,
attend que le healthcheck passe et affiche l'URL.

Le script est ré-exécutable : il ne régénère pas les secrets si `.env` existe,
donc un second passage vaut mise à jour, pas réinstallation.

**Ce que fait `docker-compose.prod.yml`** : Caddy est seul à écouter sur
l'extérieur (80/443, certificat Let's Encrypt automatique et renouvelé),
l'application n'est joignable que par le réseau Compose, et Postgres n'est
publié que sur `127.0.0.1:5432` pour rester accessible au serveur MCP.

## 1. Générer la configuration

```bash
./scripts/bootstrap.sh
```

Le script produit deux fichiers, tous les deux ignorés par git :

- `.env` — utilisé par Docker Compose (secrets aléatoires, base sur le réseau
  interne `db:5432`)
- `.env.local` — utilisé par le serveur MCP et l'outillage lancé depuis l'hôte
  (même base, mais via `localhost:5432`)

Pour un déploiement derrière un nom de domaine, passe le domaine — `NEXTAUTH_URL`
et `CRAWLSEO_DOMAIN` en découlent :

```bash
DOMAIN=siip-seo.duckdns.org ./scripts/bootstrap.sh
```

`scripts/deploy.sh` appelle ça pour toi, ce n'est utile que pour un usage manuel.

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
   - en production : `https://siip-seo.duckdns.org/api/auth/callback/google`

   ⚠️ Google n'accepte `http://` que pour `localhost`. Une IP nue ou un
   `http://` public est refusé — d'où le passage obligatoire par un domaine.
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
