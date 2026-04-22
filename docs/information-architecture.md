# Information Architecture - Ashby Exec Dashboard

> Who it's for: CEO, Cofounders, Head of People. They open this 2 minutes a day on mobile, or 10 minutes on desktop weekly.
> Design rule: every view must answer a specific executive question in under 5 seconds. If we can't name the so-what, we cut the view.

## Route map

```
/                              → Overview (top-of-funnel, org health)
/roles                         → Roles table (main open-roles table)
/roles/:jobId                  → Per-role deep dive
   ├─ Overview tab             (funnel + source mix)
   ├─ Pipeline tab             (current candidates at each stage)
   ├─ Velocity tab             (time-in-stage distribution)
   └─ Activity tab             (last 7/30 days of movement)
/velocity                      → Org-wide funnel velocity
/sources                       → Source performance (ROI-style)
/people                        → Hiring manager / recruiter load
/settings                      → API key status, sync status, refresh trigger
```

## View catalogue

Each view names its **so-what** - the single question an exec should walk away answering.

### 1. Overview (`/`)

**So-what: "Is hiring on track this week?"**

KPI strip (top):
- Open roles today
- Total active candidates in pipeline
- Applications last 7 days (delta vs. previous 7)
- Interviews scheduled next 7 days
- Offers outstanding
- Offer acceptance rate (trailing 30d)

Below: two 50/50 panels.
- Left: **Applications per day, last 30 days** (stacked bar by source). Spot the spike.
- Right: **Stage-movement last 7 days** (sankey-lite or grouped bar): how many entered Review, R1, R2, R3, R4, Final, Offer, Hired, Archived.

Footer strip: **Oldest candidates stuck per stage** - top 5 across org. Accountability widget.

### 2. Roles table (`/roles`) - the main one

**So-what: "Which roles need attention?"**

Columns (sortable, filterable, sticky header):

| # | Role | Dept | Hiring Mgr | Days Open | Applied | In Pipeline | Interviews (live) | Offers (out) | Hired | Archived | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|

- `Days Open` = today − `publishedDate`. Highlight red if > 60 days.
- `In Pipeline` = candidates in any active (non-archived, non-hired) stage.
- `Interviews (live)` = candidates currently in R1–Final.
- `Offers (out)` = offers in state `Pending` / `Sent`.
- Tiny sparkline per row: applications last 14 days.
- Row click → `/roles/:jobId`.
- Global filters: Department, Hiring Manager, Location, Date Opened, Status.
- Export CSV button.

### 3. Per-role overview (`/roles/:jobId` - Overview tab)

**So-what: "How is THIS role doing?"**

Two stacked tables as the user explicitly requested:

**Funnel table** - this is the "Application Review || Interview Rounds || Offer || Rejected" macro view:

| Stage | Active now | Passed through (all-time) | Passed through (last 7d) | Median days in stage |
|---|---|---|---|---|
| Application Review | … | … | … | … |
| Round 1 | … | … | … | … |
| Round 2 | … | … | … | … |
| Round 3 | … | … | … | … |
| Round 4 | … | … | … | … |
| Final | … | … | … | … |
| Offer | … | … | … | … |
| Hired | … | … | … | … |
| Rejected / Archived | … | … | … | … |

**Source table** - excludes `Kula_Migrated` and `Unspecified`:

| Source | Applied | Moved past Review | Moved to Interview | Offered | Hired | % past Review |
|---|---|---|---|---|---|---|
| Applied (direct) | … | … | … | … | … | … |
| Cold email | … | … | … | … | … | … |
| Referral | … | … | … | … | … | … |
| LinkedIn | … | … | … | … | … | … |
| Indeed | … | … | … | … | … | … |

Right rail: role meta card - opened date, hiring manager, compensation band, location, job posting link.

### 4. Per-role pipeline tab

**So-what: "Who's currently in motion for this role?"**

Kanban-style columns, one per stage. Each card: candidate name, source chip, days-in-stage badge, last activity. Click → opens Ashby deep link (we don't re-implement Ashby).

### 5. Per-role velocity tab

**So-what: "Where do candidates get stuck for this role?"**

- Box-plot of time-in-stage for every closed transition in the last 90 days.
- Red threshold line per stage (e.g., Review > 5 days is slow).
- Table of candidates currently exceeding their stage SLA.

### 6. Per-role activity tab (the "past 7 days" requirement)

**So-what: "What moved for this role this week?"**

Two small charts side by side:
- **New applications per day (last 7)** - daily bar, one color per source.
- **Stage entrances per day (last 7)** - stacked bar: how many entered R1, R2, R3, R4, Final today, yesterday, etc.

Below: event feed - every stage change in the last 14 days with candidate, from-stage, to-stage, timestamp. Searchable.

### 7. Velocity (`/velocity`) - org-wide

**So-what: "Where are bottlenecks across ALL roles?"**

- Heatmap: roles (rows) × stages (cols), cell shaded by median time-in-stage. Dark = slow.
- Below: **Conversion funnel, last 90 days.** Application → Review-Pass → R1-Pass → R2-Pass → R3-Pass → Final-Pass → Offer → Hired. Numbers + percentages between stages.

### 8. Sources (`/sources`)

**So-what: "Which channels are worth more of our money/time?"**

Table sorted by descending applied-to-hired conversion:

| Source | Applications (90d) | Reached Interview | Offered | Hired | App→Interview % | App→Hire % |

Plus a donut: this-week application share by source. Excludes `Kula_Migrated` and `Unspecified`.

### 9. People (`/people`) - hiring manager/recruiter load

**So-what: "Is anyone overloaded or coasting?"**

- Table: hiring manager → # active roles, # candidates pending review (> 48h), # interviews scheduled this week, offers outstanding.
- Red flag rows where "pending review > 48h" > 5.

### 10. Settings (`/settings`)

- Last sync timestamp per entity (jobs, candidates, applications, history, offers).
- Sync-token status per entity.
- "Refresh now" button (calls `/api/refresh`).
- API key health (does `apiKey.info` succeed?).
- Version, commit SHA.

## Extra dashboards you should add (with so-what)

These weren't in your brief but come up every month with execs. Each earns its place or gets cut in review.

| View | So-what | Data it needs |
|---|---|---|
| **Offer acceptance tracker** | "Are we losing at the finish line?" | `offer.list` + outcome |
| **Time-to-hire by role** | "How long does each role take, end to end?" | Application createdAt + hired event |
| **Stuck-candidate alert list** | "Who's been ghosted by us for > 5 days?" | `application.listHistory` + stage SLAs |
| **Rejection reason mix** | "Why are we saying no?" | `archiveReason.list` + applications filtered to archived |
| **Recruiter throughput** | "Who's moving candidates fastest?" | `application.listHistory` attributed to `user` |
| **Diversity of pipeline (if enabled)** | "Is the funnel broad enough?" | Custom fields on candidates, consent-gated |
| **Referral leaderboard** | "Who's sending quality referrals?" | `source.list` = Referral + referrer field |

All of these can be added after the core ships - we note them in the plan but do not gate v1 on them.

## Data model we actually need (maps to Ashby endpoints)

| Our table | From Ashby | Primary key | Used by |
|---|---|---|---|
| `jobs` | `job.list` + `jobPosting.list` (for publishedDate, status) | `job.id` | Roles table |
| `openings` | `opening.list` | `opening.id` | Roles table "Days Open" |
| `candidates` | `candidate.list` | `candidate.id` | Activity feed |
| `applications` | `application.list` | `application.id` | Every view |
| `application_history` | `application.listHistory` | (applicationId, stageId, enteredAt) | Velocity, stage-movement, 7-day charts |
| `offers` | `offer.list` | `offer.id` | Overview KPIs, offer acceptance |
| `interview_stages` | `interviewStage.list` | `stage.id` | Mapping stage ordering |
| `archive_reasons` | `archiveReason.list` | `reason.id` | Rejection mix |
| `sources` | `source.list` | `source.id` | Source tables |
| `users` | `user.list` | `user.id` | Hiring manager, recruiter names |
| `departments` | `department.list` | `department.id` | Filters |
| `locations` | `location.list` | `location.id` | Filters |

Every one of these has a `/docs/...list` endpoint in the Ashby docs, and **the ones that matter for 7-day trend calculations (`application.list`, `application.listHistory`, `candidate.list`) all support `syncToken` incremental sync** - confirmed in the pagination guide. That's why CSV caching is tractable.
