#!/usr/bin/env bash
# One-command production deploy: Caddy + CrawlSEO + Postgres, with automatic
# Let's Encrypt certificates.
#
#   DOMAIN=crawlseo-fm.duckdns.org ./scripts/deploy.sh
#
# Safe to re-run: it reuses an existing .env instead of regenerating secrets,
# so repeated runs act as an upgrade rather than a reinstall.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"

fail() { echo "error: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Domain
# ---------------------------------------------------------------------------

if [ -f .env ]; then
  DOMAIN=${DOMAIN:-$(grep -E '^CRAWLSEO_DOMAIN=' .env | cut -d= -f2- || true)}
fi
[ -n "${DOMAIN:-}" ] || fail "set DOMAIN, e.g. DOMAIN=crawlseo-fm.duckdns.org $0"

# Let's Encrypt validates over port 80, so a domain that does not resolve here
# yet produces a certificate failure that is slow and confusing to diagnose.
# Catch it up front.
resolved=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}' || true)
public=$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)

if [ -z "$resolved" ]; then
  fail "$DOMAIN does not resolve — create the DNS record first (see SETUP.md)"
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

echo "==> pulling images"
$COMPOSE pull

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
echo "The first certificate can take a minute; check: $COMPOSE logs caddy"
echo
echo "Once your account exists, set DISABLE_REGISTRATION=true in .env and re-run."
