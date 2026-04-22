# Ashby Exec Dashboard - Build Plan

Owner: Samarth
Target users: CEO, Cofounders, Head of People
Deployment: local first → Railway
Design language: Sarvam (see `/Design-Dashboard/brand-tokens.md`)

---

## TL;DR - what we're building

A read-only executive analytics dashboard on top of our Ashby ATS. A Python FastAPI backend pulls data from Ashby (full sync first, incremental every 6 hours, plus a manual "Refresh now" button), caches it as CSVs plus a hot parquet mirror, and exposes it to a React + Tailwind frontend that's styled in Sarvam's brand language and works well on mobile. Gated by an IP allowlist. Deployed as a single Railway service.

Design language reference: `/Design-Dashboard/brand-tokens.md`
Information architecture: `/Design-Dashboard/information-architecture.md`
Backend deep-dive: `/Design-Dashboard/backend-architecture.md`
Frontend + mobile deep-dive: `/Design-Dashboard/frontend-and-mobile.md`
Wireframes: `/Design-Dashboard/wireframes.md`

---

## Decisions already made (your answers)

| Question | Choice |
|---|---|
| Tech stack | FastAPI + React |
| Data storage | CSV files + cron (with parquet fast-cache behind the scenes) |
| Auth | IP allowlist / public no-auth |
| Refresh | Manual button + scheduled every 6 hours |

---

## 1. Ashby API - what's possible

Confirmed from `developers.ashbyhq.com`:

- **Auth:** HTTP Basic. API key goes as the username, password blank. One long-lived key. Do not call Ashby from the browser (CORS blocked, key would leak) - always proxy via FastAPI.
- **Style:** RPC over POST. Every endpoint takes JSON body. Format: `https://api.ashbyhq.com/<category>.<method>`.
- **Pagination:** cursor-based. Request `{ limit: 100, cursor: "..." }`. Response includes `moreDataAvailable` and `nextCursor`.
- **Incremental sync:** most `*.list` endpoints also support `syncToken`. First full sync returns a `syncToken` at the last page; subsequent calls pass that token to get only deltas. Tokens expire if unused for a while, so we sync at least every 6h.
- **Rate limits:** Ashby doesn't publish an exact number. We assume a few req/sec per key, design with a semaphore of 8, and handle 429s with exponential backoff.
- **Key endpoints we use (all `read` permission):**
  - `job.list`, `jobPosting.list`, `opening.list` - roles
  - `candidate.list` - people
  - `application.list`, `application.listHistory` - applications + stage transitions over time (the 7-day charts)
  - `offer.list` - offer tracking
  - `interview.list`, `interviewStage.list`, `interviewStageGroup.list` - stage metadata
  - `archiveReason.list`, `source.list` - small lookup tables
  - `user.list`, `department.list`, `location.list` - directory

**API-key permissions to enable in Ashby admin UI:** Jobs (read), Candidates (read), Interviews (read), Hiring Process (read), Organization (read), Offers (read). Everything read-only. Do not grant write unless we later automate stage changes - we don't plan to.

---

## 2. What we display

Short version here. Full view-by-view spec with "so-what" rationale is in `/Design-Dashboard/information-architecture.md`.

### Views that ship in v1

1. **Overview** - KPIs + applications-per-day (30d) + stage-movement (7d) + stuck-candidate list.
2. **Roles table** - the main open-roles table with Days Open, Applied, In Pipeline, Live interviews, Offers, Hired, Archived, status chip, 14d sparkline. Sortable, filterable, exportable to CSV.
3. **Per-role detail** with four tabs:
   - **Overview** - the funnel table (Review / R1 / R2 / R3 / R4 / Final / Offer / Hired / Archived × Now / All-time / 7d / Median days) and the source table (Applied, Cold email, Referral, LinkedIn, Indeed - excluding Kula_Migrated and Unspecified).
   - **Pipeline** - current candidates kanban.
   - **Velocity** - time-in-stage distributions.
   - **Activity** - the 7-day charts: new applications per day and stage-entrances per day, plus an event feed.
4. **Velocity** - org-wide heatmap + conversion funnel (last 90d).
5. **Sources** - source performance (app → interview → offer → hire) with Kula_Migrated and Unspecified filtered out.
6. **People** - hiring manager / recruiter load.
7. **Settings** - sync health, refresh button, api key check.

### Extra dashboards suggested (with so-what)

| View | So-what |
|---|---|
| Offer acceptance tracker | "Are we losing at the finish line?" |
| Time-to-hire by role | "How long does each role actually take?" |
| Stuck-candidate alert | "Who's been ghosted > 5 days?" |
| Rejection reason mix | "Why are we saying no?" |
| Recruiter throughput | "Who's moving candidates fastest?" |
| Pipeline diversity (if enabled) | "Is the funnel broad enough?" |
| Referral leaderboard | "Who's sending quality referrals?" |

These are planned for v1.1 - architecture supports them because the raw data is already cached.

---

## 3. How we engineer it (efficiently)

Full detail in `/Design-Dashboard/backend-architecture.md`. The shape in one breath:

- FastAPI owns the Ashby client, the sync scheduler, and the in-memory cache.
- **Full sync** runs once on first boot (or on manual "reset"): 13 entities fetched in parallel, each paginated serially, all constrained by a single `asyncio.Semaphore(8)`. Expected 5–15 minutes for a 40k-candidate org.
- **Incremental sync** runs every 6h via APScheduler and on-demand via `POST /api/refresh`. Uses `syncToken` per entity to pull only changed rows. Expected 20–60 seconds.
- **On-disk:** CSV per entity in `data/raw/*.csv` (human-inspectable, what you asked for) **plus** parquet mirrors in `data/parquet/*.parquet` (what the app actually loads - 10× faster cold start). Atomic rename after each write.
- **In-memory:** pandas DataFrames held in the FastAPI app state behind an RLock. Pre-computed derived tables (role_summary, stage_movement_daily, source_performance) refreshed after every sync. Dashboard endpoints read from memory only - none call Ashby synchronously.
- **Failure modes:** sync token expired → fall back to full for that entity. 429 → exp-backoff 1/2/4/8s. Bad response → keep old cache live, surface error in `/api/health`.
- **Why this beats CSV-only:** CSV stays for debuggability and your original preference, parquet gives us instant loads. Best of both.
- **Why this is "fast enough":** 40k rows × 30 cols in pandas ≈ 10 MB, every query groupby/merge runs in under 50ms. Page load is always <200ms server-side because we never hit Ashby on the hot path.

### "Will we multi-thread?"

Yes, but via **asyncio, not threads**. httpx async + a semaphore gives us 8 concurrent HTTP calls with zero GIL drama, and pandas does its heavy lifting single-threaded (which is fine - joins on 40k rows are milliseconds). Adding threads or multiprocessing would make code harder, not faster, for this workload.

---

## 4. How we design it (Sarvam brand, mobile-ready)

Full detail in `/Design-Dashboard/frontend-and-mobile.md`. Key decisions:

- **Visual language:** Sarvam's blue → orange gradient as the signature, used sparingly (hero strip, KPI top borders, primary CTA). Everything else is clean white/off-white with Inter typography. Mandala motif at 4% opacity for empty states.
- **Typography:** Inter Tight display, Inter body, JetBrains Mono for IDs and timestamps. Tabular numerals on every numeric column.
- **Stack:** React 18 + Vite + TypeScript + TailwindCSS + shadcn/ui + Recharts + TanStack Table/Query + Framer Motion.
- **Mobile:** bottom tab bar, tables collapse to cards, KPIs become a horizontal snap-scroll, pull-to-refresh hits the same `/api/refresh`. Installable as a PWA so it feels like an app.
- **Accessibility:** WCAG 2.1 AA - contrast audited, keyboard nav, color-blind-safe chart encodings, 44px tap targets.
- **What we will NOT do v1:** edit data in Ashby, auth beyond IP allowlist, real-time webhooks, per-user dashboards.

---

## 5. Repo layout

```
ashby-dashboard/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── security.py              # IP allowlist middleware
│   │   ├── ashby/
│   │   │   ├── client.py
│   │   │   ├── paginator.py
│   │   │   └── entities.py
│   │   ├── cache/
│   │   │   ├── store.py
│   │   │   └── derived.py
│   │   ├── sync/
│   │   │   ├── scheduler.py
│   │   │   └── runner.py
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
│   ├── src/… (see /Design-Dashboard/frontend-and-mobile.md)
│   ├── index.html
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── package.json
├── data/                            # gitignored
│   ├── raw/
│   ├── parquet/
│   ├── metrics/
│   └── sync_state.json
├── Design-Dashboard/                # the design reference
│   ├── brand-tokens.md
│   ├── information-architecture.md
│   ├── backend-architecture.md
│   ├── frontend-and-mobile.md
│   └── wireframes.md
├── scripts/
│   ├── seed_from_ashby.py           # manual full-sync script for CLI
│   └── dev.sh
├── Dockerfile                       # multi-stage: build FE, copy into BE image
├── railway.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 6. Env vars

```env
# Required
ASHBY_API_KEY=xxxx

# Optional (defaults shown)
ASHBY_BASE_URL=https://api.ashbyhq.com
DATA_DIR=./data
SYNC_INTERVAL_HOURS=6
ALLOWED_IPS=                         # comma-separated; empty = open (local dev)
APP_PORT=8000
APP_LOG_LEVEL=info
```

---

## 7. Phased build plan

Estimates assume one engineer working solo with AI assist.

### Phase 0 - Scaffolding (0.5 day)

- Init monorepo, `uv` for Python, `pnpm` for frontend.
- `.env.example`, `.gitignore`, README.
- Set up Ashby API key with read-only permissions (Jobs, Candidates, Interviews, Hiring Process, Organization, Offers). Store in `.env` locally.
- Verify with a `curl -u $ASHBY_API_KEY: https://api.ashbyhq.com/apiKey.info`.

### Phase 1 - Backend skeleton (1 day)

- FastAPI app with `/api/health`.
- `AshbyClient` (httpx async + Basic auth + retry).
- Generic `paginate()` helper supporting cursor + syncToken.
- Implement `entities.py` with fetchers for all 13 entities.
- Write `scripts/seed_from_ashby.py` - do the first full sync from the CLI. **This is where we validate the 40k-candidate scale.** Measure actual time, tune `limit` and semaphore.

### Phase 2 - Cache + derived tables (1 day)

- `store.py` - atomic read/write CSV + parquet, dtype casting (category for stages/sources).
- `derived.py` - compute role_summary, stage_movement_daily, source_performance.
- Unit tests with synthetic data (1k rows) that snapshot the derived tables.

### Phase 3 - Sync scheduler + refresh endpoint (0.5 day)

- APScheduler 6h cron.
- `POST /api/refresh` returns a jobId; `GET /api/refresh/{jobId}` returns progress.
- Lock so concurrent refreshes coalesce.

### Phase 4 - Dashboard APIs (1 day)

- Implement every endpoint in the API contract. All read from in-memory DataFrames.
- Auto-generate OpenAPI spec, export to `frontend/src/types/api.ts`.

### Phase 5 - Frontend shell + theme (1 day)

- Vite + React + Tailwind + shadcn init.
- Port brand tokens from `brand-tokens.md` to `tailwind.config.ts`.
- Build layout shell, nav rail, refresh button wiring.
- Dark-mode toggle.

### Phase 6 - Views (2–3 days)

Build in this order (delivers exec value incrementally):

1. Overview page (KPIs + 2 charts + stuck list) - **half-day**
2. Roles table with filters + CSV export - **half-day**
3. Per-role Overview tab (funnel + source tables) - **half-day**
4. Per-role Activity tab (7d charts + event feed) - **half-day**
5. Velocity + Sources + People pages - **1 day combined**
6. Settings - **quick, half-day**

### Phase 7 - Mobile polish + accessibility pass (0.5 day)

- Card-list mode for tables on mobile.
- Bottom tab bar.
- Pull-to-refresh.
- PWA manifest + icon.
- Contrast & keyboard audit.

### Phase 8 - Deploy (0.5 day)

- Dockerfile: multi-stage (build FE → copy dist → copy BE → serve static from FastAPI).
- Railway project: single service, volume mount for `/data` (persistent).
- Set env vars on Railway.
- Smoke-test sync on prod.
- IP allowlist (read from `X-Forwarded-For`).

**Total: ~8 working days** for a polished v1.

---

## 8. Local run

```bash
# clone
git clone <repo>
cd ashby-dashboard
cp .env.example .env
# put your ASHBY_API_KEY into .env

# backend
cd backend
uv sync
uv run python scripts/seed_from_ashby.py      # first full sync, ~5–15 min
uv run uvicorn app.main:app --reload --port 8000

# frontend (new terminal)
cd frontend
pnpm install
pnpm dev                                       # opens http://localhost:5173
```

Vite proxies `/api/*` to `http://localhost:8000`.

---

## 9. Deploy to Railway

- Create a new Railway project from the repo.
- Service type: Dockerfile (multi-stage, the Dockerfile builds FE and copies dist into FastAPI's static mount).
- Add env vars: `ASHBY_API_KEY`, `ALLOWED_IPS`, `SYNC_INTERVAL_HOURS=6`.
- Add a persistent volume at `/app/data` so the CSV/parquet cache survives redeploys.
- Set port via Railway's `PORT` env var (FastAPI binds to it).
- First deploy: SSH into the container (or run a one-shot job) and invoke `scripts/seed_from_ashby.py` for the initial full sync.
- Attach custom domain (e.g., `hiring.sarvam.ai`).

Cost: Railway's Hobby plan is enough for this footprint (< 512 MB RAM, a few GB disk).

---

## 10. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Ashby rate limits bite during full sync | Med | Semaphore(8) + 429 backoff; retry queue. |
| Sync token expires silently | Low | Fall back to full sync on that entity; keep old cache live. |
| CSV corruption on crash | Low | Atomic rename pattern (write to `.tmp`, fsync, rename). |
| 40k rows becomes 200k | Low | pandas + parquet still fine; re-check at 500k. |
| Exec is on poor mobile network | Med | PWA + aggressive bundle splitting; all API responses gzipped. |
| IP allowlist breaks when exec travels | Med | Ship a password fallback in v1.1 (Google SSO) if pain is real. |
| Data inaccuracy from stale sync | Med | "Last synced 2h 14m ago" chip always visible; manual refresh one tap away. |

---

## 11. Success criteria for v1

- [ ] Exec opens the dashboard on their phone at 8am and sees yesterday's applications, this week's stage movement, and current open roles without scrolling twice.
- [ ] Roles table loads in < 500ms and is sortable by any column.
- [ ] Per-role funnel table matches Ashby's native view to within ±1 candidate at any stage.
- [ ] "Refresh now" completes incremental sync in < 90 seconds with a progress bar.
- [ ] Dashboard passes Lighthouse accessibility ≥ 95 on both mobile and desktop.
- [ ] Dashboard passes a color-blind simulator review for every chart.
- [ ] Railway deploy survives a redeploy with the cache volume intact (no re-sync required).

---

## 12. References

- Ashby API reference - https://developers.ashbyhq.com/reference
- Ashby auth - https://developers.ashbyhq.com/docs/authentication
- Pagination + incremental sync - https://developers.ashbyhq.com/docs/pagination-and-incremental-sync
- Ashby product docs - https://docs.ashbyhq.com/
- Sarvam brand - https://www.sarvam.ai/ (wordmark, gradient, voice)
- Railway - https://railway.com/

Sources:
- [Ashby API Reference](https://developers.ashbyhq.com/reference)
- [Ashby Authentication](https://developers.ashbyhq.com/docs/authentication)
- [Ashby Pagination & Incremental Sync](https://developers.ashbyhq.com/docs/pagination-and-incremental-sync)
- [Ashby Syncing Records](https://developers.ashbyhq.com/docs/sync)
- [Sarvam](https://www.sarvam.ai/)
