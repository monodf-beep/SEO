#!/usr/bin/env bash
# One-command production deploy of CrawlSEO + Postgres behind TLS.
#
#   DOMAIN=siip.srv1697018.hstgr.cloud ./scripts/deploy.sh
#
# Picks its own reverse proxy: an existing Traefik on the host is reused,
# otherwise a Caddy is brought up alongside.
#
# Safe to re-run: it reuses an existing .env instead of regenerating secrets,
# so repeated runs act as an upgrade rather than a reinstall.
set -euo pipefail

cd "$(dirname "$0")/.."

fail() { echo "error: $*" >&2; exit 1; }

# A host already running Traefik owns 80/443, so bringing up our own Caddy
# would collide with it and take the existing sites down. Match on the image
# as well as the name: Compose names containers after the project, so a
# perfectly ordinary Traefik is called traefik-traefik-1 and an exact-name
# check silently misses it — and the cost of missing it is production down.
if docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -qi 'traefik'; then
  COMPOSE_FILE=docker-compose.traefik.yml
  echo "detected a running Traefik — deploying behind it, no Caddy"
else
  COMPOSE_FILE=docker-compose.prod.yml
fi
COMPOSE="docker compose -f $COMPOSE_FILE"

# Belt and braces: whatever the detection concluded, never start our own proxy
# on ports another container already holds. Name-based detection can always be
# defeated by an unusual image or a renamed container; a bound port cannot.
if [ "$COMPOSE_FILE" = "docker-compose.prod.yml" ]; then
  holder=$(docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null \
    | grep -E ':(80|443)->' | awk '{print $1}' | paste -sd, - || true)

  # A container in network_mode: host publishes nothing in `docker ps`, so the
  # check above cannot see it — which is exactly how Traefik runs on the target
  # VPS. Ask the kernel who is listening instead.
  if [ -z "$holder" ] && command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE ':(80|443)$' \
      && holder="a host process (network_mode: host?)"
  fi

  if [ -n "$holder" ]; then
    fail "refusing to start Caddy: ports 80/443 are already taken by [$holder].
       Something else is already fronting this host. Deploy behind it with:
         docker compose -f docker-compose.traefik.yml up -d
       after setting TRAEFIK_ENTRYPOINT / TRAEFIK_CERTRESOLVER in .env
       — see SETUP.md."
  fi
fi

# ---------------------------------------------------------------------------
# Domain
# ---------------------------------------------------------------------------

if [ -f .env ]; then
  DOMAIN=${DOMAIN:-$(grep -E '^CRAWLSEO_DOMAIN=' .env | cut -d= -f2- || true)}
fi
[ -n "${DOMAIN:-}" ] || fail "set DOMAIN, e.g. DOMAIN=siip.srv1697018.hstgr.cloud $0"

# Let's Encrypt validates over port 80, so a domain that does not resolve here
# yet produces a certificate failure that is slow and confusing to diagnose.
# Catch it up front.
resolved=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}' || true)
public=$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)

if [ -z "$resolved" ]; then
  fail "$DOMAIN does not resolve — create the DNS record first (see SETUP.md)"
fi

if [ "$COMPOSE_FILE" = "docker-compose.traefik.yml" ]; then
  # Postgres is published on the loopback for the MCP server, so a port already
  # in use there would fail the start with a less obvious message.
  #
  # Skip the check once our own db holds it, or every re-run after the first
  # successful deploy would trip on the container this script just started —
  # turning a re-runnable script into a one-shot.
  own_db=$($COMPOSE ps -q db 2>/dev/null || true)
  if [ -z "$own_db" ] && command -v ss >/dev/null 2>&1 \
    && ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE '^(127\.0\.0\.1|0\.0\.0\.0|\*|\[::\]):5432$'; then
    fail "127.0.0.1:5432 is already in use — another Postgres is published there.
       Change the db port mapping in docker-compose.traefik.yml and the port in
       .env.local before deploying."
  fi
fi
if [ -n "$public" ] && [ "$resolved" != "$public" ]; then
  echo "warning: $DOMAIN resolves to $resolved but this host is $public" >&2
  echo "         Let's Encrypt will fail until DNS points here." >&2
  echo "         Continuing in 10s — Ctrl-C to stop." >&2
  sleep 10
fi

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

if [ ! -f .env ]; then
  DOMAIN="$DOMAIN" ./scripts/bootstrap.sh
  echo
  echo "Now add your Google OAuth credentials to .env, then re-run this script."
  echo "Authorized redirect URI: https://${DOMAIN}/api/auth/callback/google"
  exit 0
fi

for var in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  value=$(grep -E "^${var}=" .env | cut -d= -f2- || true)
  [ -n "$value" ] || fail "$var is empty in .env — see SETUP.md section 2"
done

# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Image: the published build, or one built from this checkout
# ---------------------------------------------------------------------------
#
# The published image is the upstream project's. A checkout that carries its
# own changes has to build its image here, otherwise a re-run of this script
# would quietly replace the deployed app with the upstream one. Opt in with
# CRAWLSEO_BUILD_LOCAL=1, on the command line or in .env. The resulting tag is
# written to .env as CRAWLSEO_IMAGE so a plain `docker compose up -d` keeps
# using it.

build_local=${CRAWLSEO_BUILD_LOCAL:-$(grep -E '^CRAWLSEO_BUILD_LOCAL=' .env | cut -d= -f2- || true)}
case "${build_local:-}" in
  1|true|yes)
    sha=$(git rev-parse --short HEAD 2>/dev/null || echo manual)
    image="crawlseo-local:${sha}"
    echo "==> building ${image} from this checkout"
    docker build -t "$image" -t crawlseo-local:latest .
    if grep -qE '^CRAWLSEO_IMAGE=' .env; then
      sed -i "s|^CRAWLSEO_IMAGE=.*|CRAWLSEO_IMAGE=${image}|" .env
    else
      printf 'CRAWLSEO_IMAGE=%s\n' "$image" >> .env
    fi
    grep -qE '^CRAWLSEO_BUILD_LOCAL=' .env || printf 'CRAWLSEO_BUILD_LOCAL=1\n' >> .env
    echo "==> pulling the other images"
    $COMPOSE config --services | grep -vx app | xargs -r $COMPOSE pull
    ;;
  *)
    echo "==> pulling images"
    $COMPOSE pull
    ;;
esac

echo "==> starting stack"
$COMPOSE up -d

echo "==> waiting for the app to become healthy"
for _ in $(seq 1 60); do
  status=$($COMPOSE ps --format json app 2>/dev/null | grep -o '"Health":"[a-z]*"' | cut -d'"' -f4 || true)
  [ "$status" = "healthy" ] && break
  sleep 5
done

if [ "${status:-}" != "healthy" ]; then
  echo "app did not report healthy in five minutes — check: $COMPOSE logs app" >&2
  exit 1
fi

echo
echo "CrawlSEO is up at https://${DOMAIN}"
if [ "$COMPOSE_FILE" = "docker-compose.traefik.yml" ]; then
  # There is no caddy service in this stack — the certificate is Traefik's,
  # and its container is not part of this compose project.
  echo "The first certificate can take a minute; check: docker logs \$(docker ps --filter name=traefik --format '{{.Names}}' | head -1) --tail 30"
else
  echo "The first certificate can take a minute; check: $COMPOSE logs caddy"
fi
if ! grep -qE '^DISABLE_REGISTRATION=true' .env; then
  echo
  echo "Registration is open: once your account exists, set DISABLE_REGISTRATION=true in .env and re-run."
fi
