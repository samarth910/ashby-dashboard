# CLAUDE.md — Sarvam Hiring Dashboard

> This file is the project constitution. Claude Code reads it at the start of every session. Keep it short, keep it canonical. If a decision here conflicts with a code comment or an old doc, this file wins.

---

## What this project is

A read-only executive analytics dashboard on top of Sarvam's Ashby ATS. It answers three questions that Sarvam leadership asks every morning:

1. Is hiring on track this week?
2. What is stuck and who owns it?
3. Which roles are dragging the org?

Target readers: CEO and cofounders (2 to 5 minutes a day on mobile), Head of People (10 minutes weekly on desktop), hiring managers named in stuck-candidate lists.

Deployment: local first, then Railway with a single service and a persistent volume.

---

## Architecture at a glance

**Backend**: Python 3.12 + FastAPI + httpx (async) + pandas. One process. APScheduler for the 6-hour refresh cron. IP allowlist middleware for auth.

**Frontend**: React 18 + Vite + TypeScript + TailwindCSS + shadcn/ui + Recharts + TanStack Table + TanStack Query + Framer Motion. PWA-installable.

**Data layer**: CSV files per entity in `data/raw/` as the human-readable source of truth, plus parquet mirrors in `data/parquet/` for fast app startup, plus in-memory pandas DataFrames for hot queries. No relational database. No ORM. No SQLite. This is a settled decision, do not re-litigate.

**Sync**: Ashby's `syncToken` drives incremental fetch. `sync_state.json` is the checkpoint. First run is full (5 to 15 minutes), every run after is incremental (20 to 60 seconds).

**Derived tables**: pre-computed aggregations (`role_summary.parquet`, `stage_movement_daily.parquet`, `source_performance.parquet`) recomputed after every sync. Dashboard endpoints read only from in-memory DataFrames, never from Ashby, never from CSV on the hot path.

Full architecture: see `docs/backend-architecture.md`.

---

## Hard rules

1. **Never call Ashby from a user-facing request**. Every API endpoint reads from in-memory DataFrames. The only code that talks to Ashby lives in `app/sync/` and `app/ashby/`.
2. **Never put the Ashby API key in the frontend**. Browser never sees it. All Ashby calls proxy through FastAPI.
3. **Never write to CSV directly**. Always write to `<path>.tmp`, fsync, rename. The `store.py` module owns all disk writes.
4. **Never break the UI when sync fails**. Partial failures keep the old cache live. Errors surface on `/api/health` only.
5. **Never add a database unless the CSV+parquet system fails at documented scale limits** (> 500k rows, or multi-writer requirement).
6. **Every chart and KPI has a so-what caption**. If you cannot write the one-line takeaway, the chart gets cut.
7. **The "stuck in pipeline" call-out is load-bearing**. It appears twice on the Overview page (above-the-fold strip + dedicated section) and uses the orange brand color exclusively. Do not dilute orange with decorative uses elsewhere.
8. **No em dashes in user-facing copy or markdown docs**. Use commas, colons, or short sentences.
9. **Tabular numerals on every numeric column**. `font-feature-settings: "tnum" 1`. Consistent width or the eye cannot scan.
10. **Mobile is not an afterthought**. Overview, Roles list, and Role detail must be beautiful on a phone. Design for the CEO in an Uber first.

---

## Repo layout

```
ashby-dashboard/
├── CLAUDE.md                         # this file
├── README.md
├── .env.example
├── .gitignore
├── Dockerfile
├── railway.json
├── docs/                             # the design reference (copied from research)
│   ├── brand-tokens.md
│   ├── information-architecture.md
│   ├── backend-architecture.md
│   ├── frontend-and-mobile.md
│   ├── wireframes.md
│   └── mockup.html                   # current first-pass mockup
├── backend/
│   ├── app/
│   │   ├── main.py                   # FastAPI entrypoint, lifespan, static mount
│   │   ├── config.py                 # env loading
│   │   ├── security.py               # IP allowlist middleware
│   │   ├── ashby/
│   │   │   ├── client.py             # AshbyClient: async httpx, Basic auth, retry
│   │   │   ├── paginator.py          # cursor + syncToken pagination helper
│   │   │   └── entities.py           # per-entity fetch + schema
│   │   ├── cache/
│   │   │   ├── store.py              # DataFrame store, load/save, atomic swap
│   │   │   └── derived.py            # role_summary, stage_movement_daily, source_performance
│   │   ├── sync/
│   │   │   ├── scheduler.py          # apscheduler 6h cron
│   │   │   └── runner.py             # run_full_sync / run_incremental
│   │   └── api/
│   │       ├── overview.py
│   │       ├── roles.py
│   │       ├── velocity.py
│   │       ├── sources.py
│   │       ├── people.py
│   │       ├── refresh.py
│   │       └── health.py
│   ├── tests/
│   ├── pyproject.toml
│   └── README.md
├── frontend/
│   ├── src/
│   ├── index.html
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── package.json
├── data/                             # gitignored
│   ├── raw/                          # <entity>.csv
│   ├── parquet/                      # <entity>.parquet
│   ├── metrics/                      # derived tables
│   └── sync_state.json               # the checkpoint
└── scripts/
    ├── seed_from_ashby.py            # manual full-sync CLI
    └── dev.sh
```

---

## Ashby API essentials

- Base URL: `https://api.ashbyhq.com`
- Auth: HTTP Basic. API key as username, empty password. One long-lived key from env `ASHBY_API_KEY`.
- Style: RPC over POST. JSON body. Format: `POST /{category}.{method}`.
- Pagination: cursor-based. `{limit: 100, cursor: "..."}`. Response has `moreDataAvailable` and `nextCursor`.
- Incremental sync: most `.list` endpoints accept `syncToken`. First full sync returns a token on the final page. Pass that token on subsequent calls to fetch only changes. Tokens expire if unused, so we sync at least every 6 hours.
- Rate limits: undocumented, assume a few requests per second per key. Semaphore of 8 concurrent in-flight. Exponential backoff on 429: 1s, 2s, 4s, 8s.

Endpoints we use (all read-only):

`job.list`, `jobPosting.list`, `opening.list`, `candidate.list`, `application.list`, `application.listHistory`, `offer.list`, `interview.list`, `interviewStage.list`, `interviewStageGroup.list`, `archiveReason.list`, `source.list`, `user.list`, `department.list`, `location.list`.

Required API key permissions: Jobs (read), Candidates (read), Interviews (read), Hiring Process (read), Organization (read), Offers (read). Read-only everywhere.

Reference: `docs/backend-architecture.md`, section "Ashby API essentials".

---

## Sync state file shape

`data/sync_state.json`:

```json
{
  "jobs": {
    "syncToken": "abc123...",
    "lastFullSync": "2026-04-22T03:15:00Z",
    "lastIncrementalSync": "2026-04-22T09:00:00Z",
    "rowCount": 142
  },
  "applications": {
    "syncToken": "def456...",
    "lastFullSync": "2026-04-22T03:17:00Z",
    "lastIncrementalSync": "2026-04-22T09:00:12Z",
    "rowCount": 1247
  }
  // ... one entry per entity
}
```

If `syncToken` is null or the Ashby response indicates `syncTokenExpired`, that entity falls back to a full fetch on the next refresh. Other entities continue incremental.

---

## Env vars

```env
# required
ASHBY_API_KEY=

# optional, defaults shown
ASHBY_BASE_URL=https://api.ashbyhq.com
DATA_DIR=./data
SYNC_INTERVAL_HOURS=6
ALLOWED_IPS=
APP_PORT=8000
APP_LOG_LEVEL=info
```

---

## Performance budgets (non-negotiable)

| Metric | Target |
|---|---|
| App cold start | < 1s |
| Any dashboard page server-side response | < 200ms |
| Full sync (first run) | < 15 min for 40k applications |
| Incremental sync | < 60s typical, < 90s worst case |
| Memory footprint | < 200 MB |
| Lighthouse accessibility score (mobile + desktop) | >= 95 |
| Roles table TTFB | < 500ms |

If you cannot hit these, surface it and we redesign. Do not silently degrade.

---

## What we do NOT build in v1

- Writes to Ashby. Read-only, period.
- Auth beyond IP allowlist. Google SSO is v1.1 if the allowlist is painful.
- Real-time webhooks. The 6-hour cron plus manual refresh covers the use case.
- Per-user dashboards. One view for the whole exec team.
- Historical trend storage beyond what Ashby's application_history gives us.
- Dark mode as a priority (tokens should anticipate it, but light mode ships first).

---

## Definition of done (v1)

- [ ] Exec opens the dashboard on their phone at 8am and sees yesterday's applications, this week's stage movement, and current open roles without scrolling twice.
- [ ] Roles table loads in under 500ms and is sortable by any column.
- [ ] Per-role funnel table matches Ashby's native view within plus or minus 1 candidate at any stage.
- [ ] Refresh Now completes incremental sync in under 90 seconds with a live progress bar.
- [ ] Lighthouse accessibility >= 95 on mobile and desktop.
- [ ] Color-blind simulator review passes for every chart.
- [ ] Railway deploy survives a redeploy with the data volume intact (no re-seed required).
- [ ] Stuck-candidate call-out is unmissable on the Overview page.

---

## Sources of truth

- Design system: `docs/brand-tokens.md`
- Screen-by-screen spec: `docs/information-architecture.md`
- Backend architecture: `docs/backend-architecture.md`
- Frontend: `docs/frontend-and-mobile.md`
- Wireframes: `docs/wireframes.md`
- Ashby API reference: https://developers.ashbyhq.com/reference
- Ashby incremental sync docs: https://developers.ashbyhq.com/docs/pagination-and-incremental-sync
