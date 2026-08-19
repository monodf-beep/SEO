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

`scripts/deploy.sh` choisit tout seul son reverse proxy :

| Situation | Fichier utilisé | Ce qui se passe |
|---|---|---|
| Un conteneur `traefik` tourne déjà | `docker-compose.traefik.yml` | on se greffe dessus par des labels, aucun port publié |
| Aucun Traefik | `docker-compose.prod.yml` | un Caddy est monté, il prend 80 et 443 |

⚠️ **Ne jamais lancer les deux.** Sur un hôte qui fait déjà tourner Traefik, monter
le Caddy provoque un conflit sur les ports 80/443 et coupe les sites existants.

### Cas du VPS srv1697018 (Traefik déjà en place)

Cette machine héberge déjà Hermes, Hindsight, Supabase et Obsidian derrière
Traefik, avec le DNS wildcard `*.srv1697018.hstgr.cloud`. Il n'y a donc ni
domaine à réserver ni enregistrement DNS à créer : le sous-domaine retenu ici est
**`siip.srv1697018.hstgr.cloud`**.

Configuration relevée sur cette machine :

| | |
|---|---|
| Conteneur | `traefik-traefik-1` (image `traefik:latest`) |
| Réseau | `host` — Traefik n'est sur aucun bridge |
| Entrypoints | `web` (:80, redirigé) et `websecure` (:443) |
| Certresolver | `letsencrypt`, challenge HTTP |
| Découverte | `providers.docker` avec `exposedbydefault=false` |

Deux conséquences pour `docker-compose.traefik.yml` :

- **Aucun réseau partagé n'est déclaré.** En `network_mode: host`, Traefik joint
  les conteneurs directement sur leur IP de bridge. C'est exactement ainsi que
  fonctionne le routeur `hermes-workspace-jh8p` existant, qui ne porte d'ailleurs
  aucun label `traefik.docker.network`.
- **`traefik.enable=true` est obligatoire**, puisque `exposedbydefault` est à
  `false`.

Il suffit donc de deux lignes dans `.env` :

```
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_CERTRESOLVER=letsencrypt
```

Pour retrouver ces valeurs sur une autre machine — sans supposer le nom du
conteneur, que Compose préfixe par le nom du projet :

```bash
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'
docker inspect <nom-du-conteneur> --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -Ei 'entrypoint|certificatesresolver'
docker inspect <nom-du-conteneur> --format '{{.HostConfig.NetworkMode}}'
```

**Si ton Traefik tourne sur un bridge et non en `host`**, l'application doit
rejoindre ce réseau. Ajouter alors dans `docker-compose.traefik.yml` :

```yaml
services:
  app:
    networks: [default, traefik]
    labels:
      traefik.docker.network: traefik
networks:
  traefik:
    name: le-nom-du-reseau
    external: true
```

### Empreinte mémoire

`docker-compose.traefik.yml` plafonne l'application à 512 Mo et Postgres à
256 Mo, avec un `shared_buffers` réduit à 64 Mo. Ce n'est pas de la prudence
gratuite : cette machine tournait à 92 % de swap avec la pile Supabase complète,
et un conteneur sans limite y ferait choisir sa victime à l'OOM killer parmi les
services déjà en production.

Ajuster au besoin dans `.env` :

```
APP_MEMORY_LIMIT=512m
DB_MEMORY_LIMIT=256m
```

### a. Sous-domaine gratuit (uniquement s'il n'y a pas déjà de Traefik)

Si tu ne possèdes pas déjà un domaine, [DuckDNS](https://duckdns.org) en donne
un permanent et gratuit, compatible Let's Encrypt :

1. Se connecter sur <https://duckdns.org> (GitHub, Google ou Reddit)
2. Réserver un sous-domaine, par exemple `siip-seo`
3. Coller l'IPv4 publique du VPS dans le champ « current ip » et valider

Vérifier depuis la machine que la résolution est bonne :

```bash
getent ahostsv4 siip-seo.duckdns.org
curl -s https://api.ipify.org    # doit afficher la même IP
```

Si tu possèdes déjà un domaine, saute cette étape et crée simplement un
enregistrement A vers l'IP de la machine.

### b. Ouvrir les ports 80 et 443

Uniquement dans ce cas — avec Traefik déjà en place, les ports sont ouverts.
Let's Encrypt valide le certificat via le port 80. Sur un VPS Hostinger, penser
au pare-feu du panneau d'administration **et** à celui de la machine :

```bash
ufw allow 80/tcp && ufw allow 443/tcp
```

Le port 3000 doit rester fermé : aucune des deux stacks de production ne
l'expose.

### c. Déployer

```bash
cd /opt
git clone -b claude/opensource-seo-platform-cj6dkd \
  https://github.com/monodf-beep/SEO.git crawlseo
cd crawlseo

DOMAIN=siip.srv1697018.hstgr.cloud ./scripts/deploy.sh
```

Le premier passage génère `.env` puis s'arrête pour réclamer les identifiants
Google OAuth (étape 2 ci-dessous). Une fois collés dans `.env`, relancer la même
commande : elle récupère les images, démarre la stack, attend que le healthcheck
passe et affiche l'URL.

Le script est ré-exécutable : il ne régénère pas les secrets si `.env` existe,
donc un second passage vaut mise à jour, pas réinstallation.

Dans les deux cas, l'application n'est joignable que par le réseau Docker et
Postgres n'est publié que sur `127.0.0.1:5432`, pour rester accessible au serveur
MCP sans être exposé. La différence tient au proxy :
`docker-compose.traefik.yml` se contente de poser des labels sur le Traefik
existant, quand `docker-compose.prod.yml` monte son propre Caddy sur 80/443.

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
DOMAIN=siip.srv1697018.hstgr.cloud ./scripts/bootstrap.sh
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
   - en production : `https://siip.srv1697018.hstgr.cloud/api/auth/callback/google`

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

## Connecteur MCP distant (HTTP) — recommandé

Le serveur MCP existe en deux transports. Le transport HTTP est celui à
utiliser depuis Claude Desktop, claude.ai et le mobile : il s'ajoute dans
**Paramètres → Connecteurs**, sans processus local. (Le transport stdio via
SSH échoue notamment sur Windows, où OpenSSH meurt sans message quand il est
lancé sans console par Claude Desktop.)

L'endpoint est protégé par une URL-capacité : le secret fait partie du chemin,
`/<MCP_HTTP_SECRET>/mcp`. Sans le secret exact, le serveur répond 404 sans rien
révéler. Même modèle de confiance qu'une URL de webhook — ne partage jamais
l'URL complète.

### Déployer

`bootstrap.sh` génère `MCP_HTTP_SECRET` et `MCP_DOMAIN` pour les nouvelles
installations. Sur une installation existante, ajouter à `.env` :

```bash
printf 'MCP_HTTP_SECRET=%s\nMCP_DOMAIN=mcp-siip.srv1697018.hstgr.cloud\n' "$(openssl rand -hex 32)" >> .env
docker compose -f docker-compose.traefik.yml up -d mcp
```

Le service `mcp` monte le dépôt (il faut `npm ci` exécuté sur l'hôte) et
Traefik lui émet un certificat pour `MCP_DOMAIN` — couvert par le DNS wildcard,
rien à créer.

Vérifier :

```bash
curl -s https://mcp-siip.srv1697018.hstgr.cloud/healthz   # → ok
grep MCP_HTTP_SECRET .env                                  # récupérer le secret
```

### Connecter

Dans Claude Desktop ou claude.ai : **Paramètres → Connecteurs → Ajouter un
connecteur personnalisé**, avec l'URL :

```
https://mcp-siip.srv1697018.hstgr.cloud/<MCP_HTTP_SECRET>/mcp
```

Authentification : aucune (le secret est dans l'URL).

### Révoquer l'accès

Regénérer le secret et redémarrer :

```bash
sed -i "s/^MCP_HTTP_SECRET=.*/MCP_HTTP_SECRET=$(openssl rand -hex 32)/" .env
docker compose -f docker-compose.traefik.yml up -d mcp
```

L'ancienne URL devient immédiatement un 404.

## Brancher le serveur MCP sur Claude Code (stdio)

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
