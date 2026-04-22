# Claude Code Kickoff Prompt — Sarvam Hiring Dashboard

> Paste this as your first message to Claude Code after opening the project folder. The folder must already have `CLAUDE.md` and `docs/` populated (see the "Before you start" section at the end of this file).

---

## Context

You are building the Sarvam Hiring Dashboard, a read-only executive analytics view on top of Ashby ATS. Read `CLAUDE.md` at the repo root before doing anything else, then read `docs/backend-architecture.md`, `docs/information-architecture.md`, and `docs/brand-tokens.md`. Skim `docs/mockup.html` to see the first-pass design.

All architectural decisions are already made and documented. Do not propose alternatives (SQLite instead of CSV, Next.js instead of Vite, webhooks instead of polling) unless you hit a documented failure mode. If you think a decision should be revisited, flag it in a single sentence and proceed with the documented choice.

## What I want you to do first

Do not start coding yet. Before you write a line, produce a Phase 0 plan in this exact shape:

1. Verify your understanding of the three so-whats the dashboard answers (see CLAUDE.md). State them back in your own words.
2. List the 13 Ashby entities you will fetch, which of them support `syncToken` incremental sync, and which fall back to full re-fetch every run.
3. Describe the sync-state checkpoint format in `data/sync_state.json`. Show the exact JSON schema.
4. Describe the atomic write pattern you will use for CSV and parquet. Why is `.tmp` -> fsync -> rename the chosen path?
5. List the derived tables (role_summary, stage_movement_daily, source_performance), what each one contains, and which dashboard views read from each.
6. State the concurrency model: how many in-flight HTTP calls at once, how 429s are handled, how a manual refresh during a scheduled refresh is handled.
7. State the performance budget for incremental sync and how you will measure it end to end.
8. Name the three biggest risks you see and how you will mitigate them.

When I say "go", start Phase 1.

## Build order (strict)

Follow the phase order from `docs/BUILD-PLAN.md` (you will find this in the root or in docs/). Ship Phase 1 completely before touching Phase 2. Do not build the frontend until Phase 4 is green.

1. Phase 0: scaffold monorepo, verify Ashby API key with `POST /apiKey.info`.
2. Phase 1: backend skeleton, `AshbyClient`, generic paginator, entity fetchers, `scripts/seed_from_ashby.py`. Run the full seed against the real Ashby API, measure end-to-end time, tune `limit` and semaphore size based on observed rate limit behavior.
3. Phase 2: `cache/store.py` atomic read/write, `cache/derived.py` derived tables, unit tests against synthetic 1k-row data.
4. Phase 3: APScheduler 6h cron, `POST /api/refresh` with job-id polling, concurrency lock.
5. Phase 4: every dashboard API endpoint in `docs/backend-architecture.md` section "API contract". All read from in-memory DataFrames. Auto-generate OpenAPI spec, export TypeScript types to `frontend/src/types/api.ts`.
6. Phase 5: Vite + React shell, tokens from `brand-tokens.md` ported to `tailwind.config.ts`, layout shell with sticky nav and refresh button wired to Phase 3.
7. Phase 6: views in this order, one ships at a time: Overview, Roles table, Per-role Overview tab, Per-role Activity tab, Velocity, Sources, People, Settings.
8. Phase 7: mobile polish, card-list mode for tables, bottom tab bar, pull-to-refresh, PWA manifest, contrast and keyboard audit.
9. Phase 8: Dockerfile (multi-stage: build FE, copy dist into FE static mount of FastAPI), Railway deploy, persistent volume for `/data`, IP allowlist.

Every phase ends with a manual validation step. Do not mark a phase complete until I have validated it.

## How you report progress

- Use the TodoList tool. One top-level item per phase, child items per deliverable.
- After every file you write or modify, show a one-line diff summary. I do not want full-file diffs by default.
- When a phase is complete, ship a numbered validation checklist I can run by hand and a screenshot or curl output proving it works.

## Non-negotiables (from CLAUDE.md, restated)

- Never call Ashby from a user-facing API endpoint.
- Never write directly to a CSV. Always use `<path>.tmp` -> fsync -> rename via `cache/store.py`.
- Never put the Ashby API key in the frontend bundle or ship it past FastAPI.
- Never break the UI when a sync fails. Partial failures keep the old cache live.
- Every chart has a so-what caption.
- No em dashes in any user-facing string or markdown doc.
- Tabular numerals on every numeric column.
- Mobile is first-class for Overview, Roles list, and Role detail.
- The stuck-in-pipeline call-out is load-bearing and keeps the orange accent exclusive.

## Specific things I want you to get right

### Incremental sync
The first run is heavy (5 to 15 minutes). Every run after is cheap (20 to 60 seconds). The checkpoint is `data/sync_state.json` storing `syncToken` per entity. On the refresh hot path:

1. Load `sync_state.json`.
2. For each entity that supports `syncToken`: call `.list` with `{syncToken: <saved>}` and walk the pages. For each entity that does not: call `.list` from scratch (the lookup tables are under 1k rows combined, so this is cheap).
3. Upsert results into the in-memory DataFrame by primary key. Overwrite on conflict.
4. Write full DataFrame to `<path>.parquet.tmp` -> fsync -> rename. Same for `<path>.csv.tmp`.
5. Recompute derived tables (`role_summary`, `stage_movement_daily`, `source_performance`).
6. Swap live DataFrames in the FastAPI app state under an `RLock`.
7. Update `sync_state.json` with the new token and timestamp.

If any entity returns `syncTokenExpired`, downgrade that entity to a full fetch and continue. Do not break the refresh.

### Atomic cache writes
Every CSV and parquet write goes through `cache/store.py`. The contract:

```
def write_atomic(path: Path, df: pd.DataFrame, fmt: Literal["csv", "parquet"]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    if fmt == "csv":
        df.to_csv(tmp, index=False)
    else:
        df.to_parquet(tmp, index=False)
    os.fsync(open(tmp, "rb").fileno())
    tmp.replace(path)
```

No caller bypasses this.

### Refresh endpoint
`POST /api/refresh` returns `{jobId}` immediately and kicks the sync in the background. `GET /api/refresh/{jobId}` returns `{status, progress, entities: [{name, state, count, error?}]}`. If a manual refresh arrives while one is running, return the existing job id, do not start a second run. The frontend polls this endpoint and shows a progress bar that morphs out of the Refresh button.

### Rate limit handling
httpx with a semaphore of 8. On 429: sleep for `1 * 2^attempt` seconds, max 4 attempts. On 5xx: same. On network error: 2 retries with 500ms linear backoff. Never bury an error silently. Log to the app logger at warning level, surface the last error on `/api/health`.

## Stack confirmation

Backend: Python 3.12, FastAPI, httpx, pandas, pyarrow (parquet), APScheduler, pydantic v2, uv as the package manager.

Frontend: React 18, Vite, TypeScript, TailwindCSS, shadcn/ui, Recharts, TanStack Table, TanStack Query, Framer Motion, pnpm as the package manager.

No Next.js. No Django. No relational database. No ORM. No Redux. No Jest (use Vitest).

---

## Before you start (things I do manually, not Claude Code)

These steps are on me, not on you. Ping me if any are missing:

1. Create the repo folder on disk.
2. Copy `CLAUDE.md` to the repo root.
3. Copy all of `Design-Dashboard/*.md` and `mockup.html` into `docs/` inside the repo.
4. Copy `BUILD-PLAN.md` into `docs/` inside the repo.
5. Generate an Ashby API key with these read-only permissions: Jobs, Candidates, Interviews, Hiring Process, Organization, Offers. Paste it into `.env` as `ASHBY_API_KEY=...`.
6. Verify the key manually with: `curl -u "$ASHBY_API_KEY:" -X POST https://api.ashbyhq.com/apiKey.info`. You should see a JSON response confirming the key.

---

## First message to send Claude Code

Literally paste this:

> Read `CLAUDE.md`, `docs/BUILD-PLAN.md`, `docs/backend-architecture.md`, `docs/information-architecture.md`, and `docs/brand-tokens.md`. Then produce the Phase 0 plan in the eight-part shape described in `CLAUDE-CODE-KICKOFF.md` section "What I want you to do first". Do not write any code yet. When the plan is ready, wait for me to say "go".
