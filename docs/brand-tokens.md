# Sarvam Brand Tokens - Ashby Exec Dashboard

> Source: Sarvam brand guidelines (sv-design:brand-guidelines skill) + live sarvam.ai inspection.
> These tokens drive the Tailwind theme config in `frontend/tailwind.config.js`.

## Brand essence

- **Name meaning:** "Sarvam" = Sanskrit for "all" - wholeness, inclusivity.
- **Tagline in use:** "AI for all from India."
- **Visual philosophy:** Mandala construction logic - layered circles, geometric rhythm, emergence.
- **Motion principle:** Gradients over flat fills. Communicate transformation, flow, responsive states.
- **Voice in UI:** Familiar yet modern. Precise. Not technical jargon. Not overly decorative.

## Color system

Sarvam's public palette is a **continuous blue → orange gradient**, not a fixed swatch set. For a data dashboard we need semantic tokens that stay brand-accurate while remaining accessible (WCAG AA minimum). The values below are derived from the live site (`assets.sarvam.ai` SVG motifs and the hero gradient). Refine the hex values from the final brand kit once shared.

### Foundation

| Token | Hex | Use |
|---|---|---|
| `--sv-ink` | `#0A0A0B` | Primary text, wordmark |
| `--sv-ink-2` | `#2A2A2E` | Secondary text |
| `--sv-ink-3` | `#6B6B72` | Tertiary text, muted labels |
| `--sv-paper` | `#FFFFFF` | Primary background (light mode) |
| `--sv-paper-2` | `#FAFAF7` | Secondary surface (cards) |
| `--sv-hairline` | `#EAEAE4` | Borders, dividers |
| `--sv-night` | `#0E1014` | Primary background (dark mode) |
| `--sv-night-2` | `#15181E` | Secondary surface (dark) |

### Brand gradient (the hero)

| Token | Hex | Use |
|---|---|---|
| `--sv-blue` | `#2F5BFF` | Anchor brand blue |
| `--sv-blue-soft` | `#7AA0FF` | Chart series, hover tints |
| `--sv-blue-ink` | `#1336B5` | Pressed / deep accent |
| `--sv-orange` | `#FF6A1A` | Anchor brand orange |
| `--sv-orange-soft` | `#FFB37A` | Chart series, highlights |
| `--sv-orange-ink` | `#C9450A` | Pressed / deep accent |
| `--sv-gradient` | `linear-gradient(135deg, #2F5BFF 0%, #8B4DE8 50%, #FF6A1A 100%)` | Hero bars, primary CTA, KPI headers |

> **Rule:** use the gradient for primary framing (hero bar, KPI card tops, active tabs). Never tint dense tabular data with the gradient - use solid ink colors there.

### Semantic (stage / status)

These map to the dashboard's recurring concepts. Derived from the brand gradient family so everything feels part of one system.

| Token | Hex | Meaning |
|---|---|---|
| `--sv-stage-applied` | `#7AA0FF` | Application Review |
| `--sv-stage-r1` | `#5A7EFF` | Round 1 |
| `--sv-stage-r2` | `#4F68F0` | Round 2 |
| `--sv-stage-r3` | `#8B4DE8` | Round 3 |
| `--sv-stage-r4` | `#B85BD9` | Round 4 |
| `--sv-stage-final` | `#E85BBE` | Final round |
| `--sv-stage-offer` | `#FF6A1A` | Offer |
| `--sv-stage-hired` | `#16A34A` | Hired |
| `--sv-stage-archived` | `#6B6B72` | Rejected / Archived |

### Source colors (for application-source chart)

| Source | Hex |
|---|---|
| Applied (direct) | `#2F5BFF` |
| Cold email | `#8B4DE8` |
| Referral | `#16A34A` |
| LinkedIn | `#0A66C2` |
| Indeed | `#003A9B` |
| Other (sans Kula_Migrated, Unspecified) | `#6B6B72` |

## Typography

Sarvam's wordmark uses a contemporary wide sans. Closest free web-safe fit:

- **Display / H1-H3:** `Söhne`, `Inter Tight` (700) - fallback `Inter`, `system-ui`
- **Body / table:** `Inter` (400/500) - tabular nums ON for all numeric columns
- **Mono (IDs, timestamps):** `JetBrains Mono` (400)

```css
font-feature-settings: "tnum" 1, "cv11" 1, "ss01" 1;
```

Scale (desktop; multiply 0.875× on mobile):

| Role | Size | Weight | Line |
|---|---|---|---|
| Display | 48px | 700 | 1.05 |
| H1 | 32px | 700 | 1.1 |
| H2 | 24px | 600 | 1.2 |
| H3 | 18px | 600 | 1.3 |
| Body | 14px | 400 | 1.5 |
| Small | 12px | 500 | 1.4 |
| Caption | 11px | 500 | 1.3 |

## Spacing & radius

Mandala-inspired rhythm: everything aligns to a 4px base. Prefer 8 / 16 / 24 / 32 / 48.

| Token | Value |
|---|---|
| `--radius-sm` | 6px (chips, pills) |
| `--radius-md` | 10px (buttons, inputs) |
| `--radius-lg` | 16px (cards) |
| `--radius-xl` | 24px (hero panels) |
| `--shadow-card` | `0 1px 2px rgba(10,10,11,0.04), 0 8px 24px rgba(10,10,11,0.04)` |
| `--shadow-float` | `0 12px 40px rgba(47,91,255,0.12)` |

## Motifs

- Use a faint mandala motif SVG (`/Design-Dashboard/assets/motif.svg`) at 4% opacity in empty-state cards and the refresh-screen background.
- Active KPI cards get a 2px top border filled with `--sv-gradient`.
- Page header uses a 320px-tall hero with the gradient at 8% opacity, thin hairline at the bottom.

## Accessibility rules

- Minimum contrast 4.5:1 for body text, 3:1 for large text and icons. Never place body text on the raw gradient - reserve that for H1/H2 display only.
- All charts must pass color-blind review: ship a pattern/shape fallback (stripe, dot, dash) on time series.
- Focus rings: `--sv-blue` outline, 2px offset.
- Tap targets on mobile: minimum 44×44px.
