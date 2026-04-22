#!/usr/bin/env bash
# Verify the Ashby API key by calling apiKey.info.
# Run from the repo root: bash scripts/verify_ashby_key.sh
set -euo pipefail

# Load .env if present. .env at repo root is the source of truth.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${ASHBY_API_KEY:-}" ]]; then
  echo "ASHBY_API_KEY not set. Put it in .env at the repo root." >&2
  exit 1
fi

BASE_URL="${ASHBY_BASE_URL:-https://api.ashbyhq.com}"

echo "POST ${BASE_URL}/apiKey.info"
curl -sS -u "${ASHBY_API_KEY}:" \
  -X POST "${BASE_URL}/apiKey.info" \
  -H "Accept: application/json" \
  -w "\nHTTP %{http_code}  in %{time_total}s\n"
