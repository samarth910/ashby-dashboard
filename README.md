# Sarvam Hiring Dashboard

Read-only executive analytics on top of Sarvam's Ashby ATS. Python FastAPI backend + React/Vite frontend. CSV + parquet cache. Refreshes every 6 hours and on demand.

See [CLAUDE.md](./CLAUDE.md) for the project constitution. See [docs/BUILD-PLAN.md](./docs/BUILD-PLAN.md) for the phased build plan.

## Local run

```bash
cp .env.example .env
# put your ASHBY_API_KEY into .env

# one-time: verify the key
bash scripts/verify_ashby_key.sh

# first full seed (5–15 min on a 40k-candidate org)
cd backend
uv sync
uv run python ../scripts/seed_from_ashby.py

# backend (dev) - auto-reload on code changes
uv run uvicorn app.main:app --reload --port 8000

# frontend (separate terminal)
cd ../frontend
pnpm install
pnpm dev
# opens http://localhost:5173; Vite proxies /api -> :8000
```

For the production-like single-process run, after `pnpm build`:

```bash
cd backend
uv run uvicorn app.main:app --port 8000
# open http://localhost:8000 — SPA + API served by one process
```

## Deploy to Railway

1. Push the repo. Create a Railway project pointing at it; Railway auto-picks up `Dockerfile` and `railway.json`.
2. Add env vars: `ASHBY_API_KEY`, `ALLOWED_IPS` (comma-sep), optionally `SYNC_INTERVAL_HOURS`.
3. Mount a persistent volume at `/app/data` so the CSV + parquet cache survives redeploys.
4. First deploy: exec into the container and run `uv run python ../scripts/seed_from_ashby.py` for the baseline sync. Subsequent syncs run automatically every 6 h and on `POST /api/refresh`.
5. Health check hits `GET /api/health` (already wired in `railway.json`).

## Structure

```
ashby-dashboard/
├── CLAUDE.md                  project constitution
├── docs/                      design + build reference
├── backend/                   FastAPI + sync + cache
│   ├── app/
│   │   ├── ashby/             AshbyClient, paginator, entities
│   │   ├── cache/             store (atomic write), registry, derived tables
│   │   ├── sync/              scheduler, runner, refresh service
│   │   ├── api/               dashboard endpoints
│   │   └── main.py            FastAPI app + lifespan + SPA mount
│   ├── tests/                 pytest: store + paginator
│   └── pyproject.toml
├── frontend/                  React + Vite + Tailwind
│   ├── src/
│   │   ├── pages/             Overview, Roles, RoleDetail, Velocity, Sources, People, Settings
│   │   ├── components/        Shell, RefreshButton, KPI
│   │   └── lib/               api client, formatters
│   └── tailwind.config.ts     brand tokens ported from docs/brand-tokens.md
├── data/                      gitignored parquet + CSV cache + sync_state.json
├── scripts/
│   ├── verify_ashby_key.sh    apiKey.info probe
│   ├── seed_from_ashby.py     CLI sync (full or incremental)
│   └── dev.sh                 reload uvicorn wrapper
├── Dockerfile                 multi-stage: pnpm build -> FastAPI static mount
└── railway.json
```

## v1 limitations

- `application.listHistory` requires per-application fan-out (Ashby gates it behind `applicationId`). Out of scope for v1; time-in-stage metrics use `updatedAt - createdAt` as a proxy. Proper stage history is v1.1.
- `interviewStage.list` requires `interviewPlanId`. Stages are currently derived from `applications.currentInterviewStage.*` only.
- Offers table returned 0 rows from Ashby on the seed. If this org does issue offers, confirm the API scope and re-sync.

## Commands

```bash
bash scripts/verify_ashby_key.sh     # smoke-test the API key
cd backend && uv run pytest          # run unit tests
cd frontend && pnpm build            # produce dist/ for the single-process run
```
