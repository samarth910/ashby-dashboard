# Backend Architecture - Ashby Exec Dashboard

## Goal

Pull the full Ashby dataset into a local CSV cache so the dashboard is instant. Refresh every 6 hours automatically, and on demand via a button. Handle 40k applicants without blowing up the process or hitting rate limits.

## Why CSV works for us (and what we do to keep it fast)

Chosen because you wanted simple. It's fine for 40k records **if we do three things**:

1. **Read CSVs once, into memory.** pandas DataFrames on app start. ~40k rows × 30 columns ≈ 10 MB resident. Queries are in-memory, so every view is under 50ms even without indexes.
2. **Partition by entity, not one mega-file.** Separate files per entity (jobs, applications, application_history, offers, …). Refresh runs per-entity. One corruption doesn't break everything.
3. **Write parquet alongside CSV for fast load.** CSV for human readability/debugging, parquet for fast reload on app restart. Parquet cuts 40k-row load from ~400ms to ~30ms. We hot-reload from parquet, rewrite CSV only after successful sync.

We keep the CSV as the "source of truth on disk" because you wanted that debuggability. Parquet is an optimization the app manages behind the scenes.

## File layout on disk

```
data/
├── raw/                          # one CSV per entity, append-only daily snapshots
│   ├── jobs.csv
│   ├── job_postings.csv
│   ├── openings.csv
│   ├── candidates.csv
│   ├── applications.csv
│   ├── application_history.csv
│   ├── offers.csv
│   ├── interview_stages.csv
│   ├── interview_stage_groups.csv
│   ├── archive_reasons.csv
│   ├── sources.csv
│   ├── users.csv
│   ├── departments.csv
│   └── locations.csv
├── parquet/                      # hot cache for app startup
│   └── <same entities>.parquet
├── sync_state.json               # { entity: { syncToken, lastFullSync, lastIncrementalSync } }
└── metrics/                      # pre-computed derived tables
    ├── role_summary.parquet      # the /roles table - pre-joined
    ├── stage_movement_daily.parquet
    └── source_performance.parquet
```

## Concurrent fetch strategy (the 40k problem, solved)

Ashby's API is synchronous per request but your API key can run many requests in parallel. The constraint is their per-key rate limit (they don't publish an exact number but it's conservative ~ a few requests/sec per key based on community reports). We design for that:

**Technique: async httpx with a semaphore, per-entity parallelism.**

```
# pseudo-code
SEM = asyncio.Semaphore(8)         # cap concurrent in-flight to 8
async def fetch_page(endpoint, body):
    async with SEM:
        r = await client.post(endpoint, json=body, auth=(API_KEY, ""))
        handle_429(r)              # exponential backoff on 429/5xx
        return r.json()
```

### Phase 1 - Full initial sync (one-time)

For each entity in parallel (not within an entity - pagination is serial per cursor):

```
entities = [jobs, openings, interview_stages, sources, users, departments,
            locations, archive_reasons,                            # small
            candidates, applications, application_history,          # large
            offers, job_postings]
```

- Launch 13 top-level async tasks. Each walks its own `cursor` pagination at `limit=100` (Ashby max).
- Inside each entity, we hit the Semaphore (8 slots org-wide). So the large lists effectively use most of the semaphore; small lists slip through in between.
- Expected first-run time for 40k applications + 40k candidates + ~10x history rows: **5–12 minutes** depending on Ashby's current response times. Acceptable because it runs once.

### Phase 2 - Incremental sync (every 6 hours thereafter)

- For entities that support `syncToken` (candidates, applications, application_history, offers, jobs): pass the last saved token. Fetches **only changed records**. Typical delta = a few hundred rows.
- For small entities without sync tokens (stages, sources, users, departments, locations, archive_reasons): just re-fetch them fully. They're < 1k rows combined.
- Expected incremental time: **20–60 seconds end to end.** Good enough for the "Refresh now" button.

### Upsert logic

Pandas: keep in-memory dict keyed by primary id per entity. Incremental records overwrite existing rows by id. After each sync:

1. Write full DataFrame to `parquet/<entity>.parquet.tmp`, fsync, rename atomically.
2. Write the same to `raw/<entity>.csv.tmp`, fsync, rename atomically.
3. Update `sync_state.json` with new `syncToken` and timestamp.
4. Regenerate derived tables (`role_summary`, `stage_movement_daily`, `source_performance`) - these are pandas joins + groupbys, run in < 2 sec for 40k rows.
5. Swap live DataFrames in the FastAPI app state under a `threading.RLock`.

### Failure handling

- `sync_token_expired` → downgrade that entity to a full sync, keep others incremental.
- 429 → exponential backoff, 4 retries (1s, 2s, 4s, 8s). Surface last error in `/api/health`.
- Partial failure → keep previous snapshot live. Never break the UI because one entity failed.

## Refresh scheduling

Two triggers, same code path:

| Trigger | Mechanism |
|---|---|
| Scheduled (every 6h) | `apscheduler.AsyncIOScheduler` running inside the FastAPI process. Cron: `0 */6 * * *`. |
| Manual | `POST /api/refresh` - kicks the same job. Returns immediately with a job id; frontend polls `/api/refresh/:id` for status and progress. |

Concurrency guard: a single `asyncio.Lock` around the refresh job - if a manual refresh arrives during a scheduled one, the caller gets `{status: "in_progress"}` immediately and streams the existing run's events.

## FastAPI structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI entrypoint, lifespan, static mount
│   ├── config.py                  # env loading, constants (ASHBY_BASE_URL, etc.)
│   ├── security.py                # IP allowlist middleware
│   ├── ashby/
│   │   ├── client.py              # AshbyClient: async httpx, auth, retry
│   │   ├── paginator.py           # generic sync/incremental pagination helper
│   │   └── entities.py            # per-entity fetch + schema
│   ├── cache/
│   │   ├── store.py               # DataFrame store, load/save, atomic swap
│   │   └── derived.py             # role_summary, stage_movement, source_perf
│   ├── sync/
│   │   ├── scheduler.py           # apscheduler config
│   │   └── runner.py              # run_full_sync / run_incremental
│   └── api/
│       ├── overview.py            # GET /api/overview
│       ├── roles.py               # GET /api/roles, /api/roles/{id}
│       ├── velocity.py
│       ├── sources.py
│       ├── people.py
│       ├── refresh.py             # POST /api/refresh, GET /api/refresh/{id}
│       └── health.py
├── tests/
│   ├── test_paginator.py
│   ├── test_derived.py            # snapshot-tests against synthetic data
│   └── test_api.py
├── pyproject.toml
└── README.md
```

## API contract (frontend ↔ backend)

All responses include `{ data, lastSyncAt, source: "cache" }`.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/overview` | KPIs + 30-day applications + 7-day stage-movement |
| GET | `/api/roles` | Roles table rows (see IA doc) |
| GET | `/api/roles/{jobId}` | Funnel table + source table + meta |
| GET | `/api/roles/{jobId}/pipeline` | Candidates grouped by current stage |
| GET | `/api/roles/{jobId}/velocity` | Time-in-stage distributions |
| GET | `/api/roles/{jobId}/activity?days=7` | New apps + stage entrances + event feed |
| GET | `/api/velocity` | Heatmap + org funnel |
| GET | `/api/sources` | Source table + this-week share |
| GET | `/api/people` | Hiring manager load |
| GET | `/api/health` | Sync state, token status |
| POST | `/api/refresh` | `{ jobId }` |
| GET | `/api/refresh/{jobId}` | `{ status, progress, entities: [{name, state, count}] }` |

All GETs cache-hit the in-memory DataFrames. No endpoint talks to Ashby synchronously during a page load - that would murder latency and rate limits.

## IP allowlist (you chose no-auth)

A tiny middleware:

```python
ALLOW = os.getenv("ALLOWED_IPS", "").split(",")
if ALLOW and request.client.host not in ALLOW: return PlainTextResponse("forbidden", 403)
```

Railway sits behind a proxy, so read `X-Forwarded-For` too. Allowlist leaves blank → open (for local dev). Set in prod to your office + home IPs.

## Env vars

```
ASHBY_API_KEY=              # required
ASHBY_BASE_URL=https://api.ashbyhq.com
DATA_DIR=./data
SYNC_INTERVAL_HOURS=6
ALLOWED_IPS=                # comma-separated; empty = open
APP_PORT=8000
APP_LOG_LEVEL=info
```

## Why this beats every alternative

- **vs. "live API calls per page load":** the user gets instant loads. Ashby rate limit never bites exec traffic. Costs nothing to open the dashboard 100 times an hour.
- **vs. SQLite:** CSV is human-inspectable, survives bad deploys (you can `scp` the file and eyeball it), and parquet gives us the speed SQLite would have given us anyway. For 40k rows we don't need a query planner.
- **vs. webhooks-first:** we may *add* webhooks later for near-real-time, but they fail open: you still need a baseline sync for the first load and for webhook misses. So we build the sync first, webhooks as a layer on top.

## Performance targets

| Metric | Target | How we get there |
|---|---|---|
| App cold start | < 1s | parquet load, lazy derive |
| Any dashboard page load | < 200ms server-side | in-memory pandas |
| Full sync | < 15 min | 8-way concurrent pagination |
| Incremental sync | < 60s | syncToken-based |
| Memory footprint | < 200 MB | DataFrames with right dtypes (category for stage/source) |
