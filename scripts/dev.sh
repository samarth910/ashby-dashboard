#!/usr/bin/env bash
# Run the backend locally with auto-reload.
set -euo pipefail
cd "$(dirname "$0")/../backend"
uv run uvicorn app.main:app --reload --port "${APP_PORT:-8000}"
