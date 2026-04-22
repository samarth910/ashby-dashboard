# Frontend + Mobile Design - Ashby Exec Dashboard

## Stack

- **React 18 + Vite** - fast dev server, simple build.
- **TypeScript** - catches schema mismatches between FastAPI and UI early.
- **TailwindCSS** - brand tokens compiled from `brand-tokens.md` into `tailwind.config.js`.
- **shadcn/ui** - unopinionated accessible primitives; we style them Sarvam.
- **TanStack Query** - caching, refetch on focus, refresh after mutation.
- **TanStack Table** - the roles table (sorting, filtering, column visibility, virtualization for 40k rows if needed).
- **Recharts** - bar, line, stacked, heatmap; React-native, unlike d3.
- **Framer Motion** - tasteful page transitions, KPI number counting.

## Why not Next.js

We don't need SSR - the dashboard is behind an IP allowlist and the payload size is already in the backend cache. Vite+React ships in < 200kb gzipped. Simpler build, faster HMR.

## Folder layout

```
frontend/
├── src/
│   ├── app.tsx                    # router + providers
│   ├── main.tsx                   # mount + theme provider
│   ├── theme/
│   │   ├── tailwind.css           # @tailwind base/components/utilities
│   │   ├── tokens.css             # CSS vars from brand-tokens.md
│   │   └── motif.svg              # the mandala background asset
│   ├── lib/
│   │   ├── api.ts                 # typed fetch wrappers around FastAPI
│   │   ├── formatters.ts          # days-ago, percent, nbsp
│   │   └── hooks/                 # useOverview, useRoles, useRefresh, …
│   ├── components/
│   │   ├── KPI.tsx                # gradient-topped card
│   │   ├── HeroHeader.tsx
│   │   ├── RolesTable.tsx
│   │   ├── FunnelTable.tsx
│   │   ├── SourceTable.tsx
│   │   ├── StageMovementChart.tsx
│   │   ├── Applications7dChart.tsx
│   │   ├── VelocityHeatmap.tsx
│   │   ├── PipelineKanban.tsx
│   │   ├── RefreshButton.tsx
│   │   └── ui/                    # shadcn components, themed
│   ├── pages/
│   │   ├── Overview.tsx
│   │   ├── Roles.tsx
│   │   ├── RoleDetail.tsx         # tabs: Overview / Pipeline / Velocity / Activity
│   │   ├── Velocity.tsx
│   │   ├── Sources.tsx
│   │   ├── People.tsx
│   │   └── Settings.tsx
│   └── types/
│       └── api.ts                 # generated from FastAPI OpenAPI
├── index.html
├── tailwind.config.ts
├── vite.config.ts
└── package.json
```

## Layout shell (all pages)

Desktop (≥ 1024px):
- Left rail 240px: logo (wordmark), nav, org filter, sync status, refresh button.
- Main area: hero strip (64px, gradient-tinted at 8%), then content at max-width 1440px.

Tablet (640–1023px):
- Top nav bar with dropdown. No left rail. Filters collapse into a drawer.

Mobile (< 640px):
- Bottom tab bar (Home, Roles, Velocity, More). Sticky sync-status pill at top right.
- All tables switch to **card lists** (every row = a card with label/value pairs). No horizontal scroll tables on phone - we punish them.
- KPI strip becomes a horizontal snap-scroll row.

## Component patterns

### KPI card

- 1px hairline border, 16px radius, 24px padding.
- 2px top edge filled with `--sv-gradient` on the active / hero KPI.
- Label (12px, `--sv-ink-3`), Value (32px, 700, tabular nums), Delta chip (green/red, 11px).
- Counts up from 0 to value over 400ms on first mount (Framer Motion).

### Roles table

- Sticky header, zebra rows off (noisy), hover tint `rgba(47,91,255,0.04)`.
- Every numeric column: tabular nums, right-aligned.
- `Days Open` cell turns to an orange chip when > 60.
- Row hover reveals a ›  chevron on the right.
- Column visibility picker + CSV export in the header toolbar.
- 14-day sparkline column renders inline (Recharts sparkline, 80×24px).

### Funnel table (per-role)

- Dense, no padding waste. Stage column uses the stage color dot + text.
- "Active now" gets a gradient-bg pill if > 0.
- "Median days in stage" turns red if above SLA (configurable, default Review > 5d, R1–Final > 7d).

### Source table

- Hides `Kula_Migrated` and `Unspecified` - enforced server-side, double-enforced client-side.
- "% past Review" sparkline column showing trailing 30-day trend for each source.

### Applications-per-day chart

- Stacked bars (one stack per source). 30-day default, 7-day toggle.
- Today's bar is outlined, not filled - reads "in progress."
- Tooltip shows breakdown by source plus delta vs same day last week.

### Stage-movement chart

- Grouped bar chart: x = day (last 7), y = entrances, series = stage.
- Stage colors from `--sv-stage-*`.
- A "movement totals" strip above the chart shows the 7-day total per stage - lets exec scan "R1: 12, R2: 8…" at a glance.

### Velocity heatmap

- Rows = roles, columns = stages, cell color = median days in stage (pale = fast, deep = slow).
- Click a cell → drills into `/roles/:id` pipeline filtered to that stage.

### Pipeline kanban

- Vertical columns scroll within themselves. Cards are compact: name, source chip, days-in-stage badge.
- On mobile, collapses to an accordion with stage names and candidate lists.

### Refresh flow

- Button shows `Last synced: 2h 14m ago`.
- On click: button turns into a progress bar. WebSocket or 1-sec-poll to `/api/refresh/:id` for per-entity progress.
- Toast on completion: "Refreshed 12,431 records in 34s."

## Responsive breakpoints

```ts
// tailwind.config.ts
screens: {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1440px",
}
```

Concrete rules per view:

| View | Desktop | Tablet | Mobile |
|---|---|---|---|
| Overview | KPI strip 6 cols, 2-col chart row, 3-col footer | KPI strip 3 cols × 2, 1-col charts | KPI horizontal snap, 1-col everything |
| Roles table | Full table with 12 cols | Table with 8 cols (hide Archived, Offers, status) | Card list, each card has key metrics only |
| Role detail | 2-col layout (main + right rail) | Tabs stack, rail moves under tabs | Tabs become segmented control |
| Velocity heatmap | Full heatmap | Horizontal scroll inside card | Replaced by top-10 slowest cells list |
| Pipeline kanban | Horizontal columns | Horizontal scroll | Accordion by stage |

## Dark mode

- Toggle in the left rail / more menu.
- Persisted in localStorage.
- All tokens have dark-mode variants defined in `tokens.css`.
- The gradient becomes slightly richer in dark: blue `#3E6BFF` → orange `#FF7A2E`.

## Motion

- Page transition: 120ms fade + 8px slide up.
- KPI number counting: 400ms ease-out.
- Chart reveal: staggered bar grow, 80ms per bar, cap 600ms total.
- Hover / focus: 100ms, avoid anything that makes exec wait.

## Loading & empty states

- Skeletons per component, not a full-page spinner.
- If any entity's cache is empty (first boot, mid-sync), show a friendly "Populating from Ashby… 43%" card with the progress from `/api/refresh/:id`.
- Empty filter result: mandala motif at 8% opacity, "No roles match these filters" and a "Clear filters" button.

## Accessibility checklist (v1 gate)

- Every chart paired with a screen-reader table alternative (`aria-describedby`).
- Keyboard nav through table rows (arrow keys) + focus ring.
- Color contrast audited against `--sv-ink-3` (the riskiest text color) on every background in use.
- Mobile tap targets ≥ 44×44.
- Don't rely on color alone - stage chips use label + color, not color-only.

## Mobile-specific polish

- Hero header collapses to a 48px bar on scroll.
- Pull-to-refresh wired to the same `/api/refresh` endpoint.
- Sticky sync-age pill in the top-right so exec always knows how fresh the data is.
- Install-to-home-screen PWA manifest (icon, theme color, standalone) so it feels like an app.

## Things we will not do in v1

- Drag-to-reorder stages, edit candidate data, move candidates between stages. This is a **read-only exec lens**. Writing stays in Ashby.
- Authentication beyond IP allowlist.
- Real-time (webhooks) - we'll add it later if 6h feels slow.
- User-specific dashboards. One view, fits all execs.
