# Plan — 003 Charts and CBT design
Spec: `spec.md` (approved 2026-10-31).

## Design principle
Data keeps coming only from the Worker's API; the UI draws it. Calculations (series, summaries, comparisons) live in pure modules tested without the cloud. No new dependencies: charts are hand-written SVG, as in the "CBT Monitoreo" prototype.

## New files
| File | Content |
|---|---|
| `web/ui/assets/` | CBT logos, copied from the design system artifact, never redrawn. |
| `web/ui/theme.ts` | Theme chosen and remembered (R4, R5). |
| `web/ui/components/Card.tsx`, `Meter.tsx`, `InfoTip.tsx`, `ThemeButton.tsx`, `LineChart.tsx`, `NodeNetwork.tsx` | Interface pieces. |
| `web/ui/pages/Panel.tsx` | General panel (R12–R16). |
| `web/src/logic/series.ts` | Daily series and panel summary. |

## Modified files
| File | Change |
|---|---|
| `web/ui/styles.css` | Design system tokens, light and dark themes, layout, phone rules. |
| `web/ui/components/Layout.tsx`, `DataTable.tsx`, `StatusBadge.tsx` | Side menu and restyling. |
| `web/ui/pages/Home.tsx`, `Usage.tsx`, `Site.tsx`, `web/ui/route.ts`, `web/ui/api.ts` | Landing, `/panel`, cards, charts. |
| `web/src/routes/api.ts` | New `/api/panel`; daily series in `/api/usage` and `/api/sites/:id`. |
| `web/src/cloudflare/queries.ts` | Daily visits per site; Worker requests read from 29 days back instead of 8. |
| `specs/001-usage-and-traffic-tables/spec.md` | R43 changes from 8 to 29 days. |

## Data
- No migrations and nothing new stored.
- Days missing from D1 are read from Cloudflare, up to 29 days back (R35), and kept for a while in the Worker's memory.
- Same read-only token.

## Security
- `/api/panel` goes through the same Access JWT and email allowlist checks as every `/api/*` route, and is recorded in the audit log.
- The panel shows several clients together: it stays owner-only, and must be reviewed before any client role exists.

## Risks
- Coarse sampling: a Worker range starting 29 days and 16 hours back was precise, one at 30 days and 16 hours was not; the exact limit is unknown, so a test forbids reading past 29 days.
- Visits per site in one 29-day range were not measured: T3 measures them first, and uses short ranges if they turn out imprecise.
- Workers Free: 50 subrequests and 10 ms of CPU per invocation. A few more queries per screen stay far from the first; the second is watched.
- Animation: it stops when leaving the landing.

## Testing strategy
- Pure modules and API routes: Vitest with mocked GraphQL responses and the local D1.
- UI: rendered to text, plus checks on styles and markup for what has no layout in tests (R2, R3, R9, R36–R41).
- The owner tests every task locally; the look, the animation and narrow windows are only judged in the browser.
