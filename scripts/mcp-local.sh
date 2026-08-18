#!/usr/bin/env bash
# Launch the CrawlSEO MCP server against the Compose database.
# Referenced by .mcp.json so no credentials have to live in committed config.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "missing .env.local — run scripts/bootstrap.sh first" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

exec npx tsx mcp/server.ts
