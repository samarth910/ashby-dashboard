# Wireframes (low-fi, ASCII)

## Desktop - Overview

```
┌──────────┬──────────────────────────────────────────────────────────────────────┐
│  SARVAM  │  ▒▒▒ hero strip (gradient 8%) ▒▒▒                                    │
│          │                                                                      │
│  Home    │  Overview                                                 [Refresh]  │
│  Roles   │                                                                      │
│  Velocity│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                │
│  Sources │  │Open  │ │Pipe  │ │Apps  │ │Intvw │ │Offers│ │Accept│                │
│  People  │  │ 14   │ │ 482  │ │ 231  │ │  38  │ │  7   │ │ 82%  │                │
│          │  │▲ 2   │ │▲ 40  │ │▲15%  │ │  -   │ │▼ 1   │ │▲ 4pt │                │
│  Settings│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                │
│          │                                                                      │
│ ━━━━━━━━ │  ┌───────────────────────────┐  ┌───────────────────────────────┐    │
│ Last sync│  │ Applications per day (30d)│  │ Stage movement (last 7d)      │    │
│  2h 14m  │  │  stacked bar by source    │  │  grouped bar by stage         │    │
│          │  │                           │  │                               │    │
│          │  └───────────────────────────┘  └───────────────────────────────┘    │
│          │                                                                      │
│          │  Oldest candidates stuck per stage                                   │
│          │  ┌──────────────────────────────────────────────────────────────┐    │
│          │  │ Anika Shah │ R2 │ 14 d │ Senior Backend │ HM: Ravi           │    │
│          │  │ ...                                                          │    │
│          │  └──────────────────────────────────────────────────────────────┘    │
└──────────┴──────────────────────────────────────────────────────────────────────┘
```

## Desktop - Roles

```
Roles (14 open)                  [Dept ▾] [Hiring Mgr ▾] [Status ▾]  [Export CSV]

# │ Role              │Dept│HM  │Days│Apps│Pipe│Live │Offers│Hired│Arch│Status
──┼───────────────────┼────┼────┼────┼────┼────┼─────┼──────┼─────┼────┼──────
1 │ Sr Backend Eng    │ENG │RT  │ 42 │ 87 │ 23 │  8  │  2   │  0  │ 55 │  ▲
2 │ Product Designer  │DSN │VV  │ 14 │143 │ 41 │ 12  │  3   │  0  │ 86 │  ▲
3 │ Forward Eng       │ENG │VN  │ 95 │211 │ 18 │  4  │  0   │  1  │192 │  ●  ← red chip (stale)
4 │ AI Researcher     │RES │PK  │  7 │ 22 │ 22 │  0  │  0   │  0  │  0 │  ▲
```

## Desktop - Role detail (Overview tab)

```
Sr Backend Engineer                                              [Open in Ashby]
Dept: Engineering · HM: Ravi T. · Opened: 42 days ago · Location: Bengaluru

Tabs:  ( Overview )  Pipeline   Velocity   Activity

FUNNEL                                          SOURCES
┌─────────────┬────┬──────┬──────┬─────┐         ┌──────────┬────┬────┬────┬───┬───┐
│Stage        │Now │All-tm│ 7d   │ Med │         │Source    │App │>R  │Int │Off│Hir│
├─────────────┼────┼──────┼──────┼─────┤         ├──────────┼────┼────┼────┼───┼───┤
│Review       │ 11 │  87  │   9  │ 3.2 │         │Applied   │ 41 │ 22 │  8 │ 1 │ 0 │
│Round 1      │  5 │  34  │   3  │ 5.1 │         │Cold email│ 12 │  7 │  4 │ 1 │ 0 │
│Round 2      │  3 │  18  │   1  │ 7.4 │         │Referral  │  9 │  6 │  5 │ 0 │ 0 │
│Round 3      │  1 │   7  │   0  │ 6.2 │         │LinkedIn  │ 21 │  8 │  3 │ 0 │ 0 │
│Round 4      │  1 │   4  │   0  │ 4.8 │         │Indeed    │  4 │  1 │  0 │ 0 │ 0 │
│Final        │  2 │   6  │   1  │ 3.1 │         └──────────┴────┴────┴────┴───┴───┘
│Offer        │  2 │   3  │   1  │ 4.0 │
│Hired        │  0 │   0  │   0  │  –  │
│Archived     │ 55 │  55  │   4  │  –  │
└─────────────┴────┴──────┴──────┴─────┘

     ┌──────────────────┐
     │ Role meta        │
     │ Opened 42d ago   │
     │ HM: Ravi T.      │
     │ Location: BLR    │
     │ Comp: ₹XX–YY L   │
     │ [Job posting ↗]  │
     └──────────────────┘
```

## Mobile - Overview

```
┌────────────────────┐
│ ≡ Sarvam · 2h ago  │
├────────────────────┤
│ Overview           │
│                    │
│ ← ┌─────┐ ┌─────┐ →│   ← horizontal KPI scroll
│   │Open │ │Pipe │  │
│   │ 14  │ │ 482 │  │
│   └─────┘ └─────┘  │
│                    │
│  Applications 30d  │
│  ┌────────────┐    │
│  │ ░░░▓▓▓███  │    │
│  └────────────┘    │
│                    │
│  Stage movement 7d │
│  ┌────────────┐    │
│  │ ▒▒▒▒▒      │    │
│  └────────────┘    │
│                    │
│  Stuck candidates  │
│  ┌────────────┐    │
│  │ Anika · R2 │    │
│  │ 14 days    │    │
│  └────────────┘    │
├────────────────────┤
│ 🏠  📋  ⚡  …     │   ← bottom tabs
└────────────────────┘
```

## Mobile - Roles list (cards)

```
Roles (14)
┌────────────────────┐
│ Sr Backend Eng  ▲  │
│ Eng · Ravi T.      │
│ 42 days · 23 live  │
│ 87 apps · 2 offers │
└────────────────────┘
┌────────────────────┐
│ Forward Eng     ●  │  ← stale
│ Eng · Viru N.      │
│ 95 days · 18 live  │
└────────────────────┘
```

## Refresh flow (toast UX)

```
Click Refresh → button morphs into progress bar
[ ■■■■■■□□□□ 60%  Fetching applications… 24,100 / 40k ]
→ on done → toast "Refreshed 12,431 records · 34s · ✓"
→ KPIs animate to new values
```
