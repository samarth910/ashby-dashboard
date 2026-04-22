# Sarvam Hiring Dashboard

Read-only executive analytics on top of Sarvam's Ashby ATS. Python FastAPI backend + React/Vite frontend. CSV + parquet cache. Refreshes every 6 hours and on demand.

See [CLAUDE.md](./CLAUDE.md) for the project constitution. See [docs/BUILD-PLAN.md](./docs/BUILD-PLAN.md) for the phased build plan.

## Local run

```bash
cp .env.example .env
# put your ASHBY_API_KEY into .env

# backend
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
# first full seed (takes 5-15 min):
uv run python ../scripts/seed_from_ashby.py

# frontend (new terminal, added in Phase 5)
cd frontend
pnpm install
pnpm dev
```

## Structure

```
ashby-dashboard/
├── CLAUDE.md                  project constitution
├── docs/                      design + build reference
├── backend/                   FastAPI + sync + cache
├── frontend/                  React + Vite (added in Phase 5)
├── data/                      gitignored parquet + CSV cache
└── scripts/                   seed + dev helpers
```
