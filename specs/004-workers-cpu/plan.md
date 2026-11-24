# Plan — 004 Workers CPU per request
Spec: `spec.md` (approved 2026-11-24).

## Design principle
As in specs 001 and 003: parsing, µs to ms conversion, script-to-site mapping and the "Cortadas" highlight live in pure modules tested without the cloud; the daily task and the routes only read and write. The new figures ride on the existing per-account query, so the subrequest budget does not change.

## New files
| File | Content |
|---|---|
| `web/migrations/statistics/0002_workers_cpu.sql` | Tables `workers_cpu_daily` and `workers_cpu_checked`. |
| `web/src/logic/cpu.ts` | Parser of the `c<day>` and `x<day>` parts, µs → ms, days to read, per-site figures (highest p50/p99, sum of requests cut), labels ("Sin script"). |
| `web/test/cpu.test.ts`, `web/test/fixtures/cpu-*.json` | Dummy GraphQL responses and tests of the parser, the conversion, the mapping and the highlight. |

## Modified files
| File | Change |
|---|---|
| `web/src/cloudflare/queries.ts` | `accountUsageQuery` takes a second list, the CPU days, and adds per day `c<day>` (by `scriptName`: `sum { requests errors }`, `quantiles { cpuTimeP50 cpuTimeP99 cpuTimeP999 wallTimeP50 wallTimeP99 }`, `avg { sampleInterval }`) and `x<day>` (filter `status: "exceededResources"`, by `scriptName`: `sum { requests }`). The `w<day>` parts stay as they are, so the precision measured in P11 does not change. |
| `web/src/db/statistics.ts` | `saveCpuDays` (one D1 batch: delete and insert the day's rows, plus the `checked` mark), `storedCpuDays`, `readCpu`. |
| `web/src/cron.ts` | CPU days per account: days of the last 29 missing from `workers_cpu_checked`, plus yesterday, limited by `workerDays` (P11). They are independent of the usage days, so the D1/R2 range does not grow. |
| `web/config/sites.json` | `scripts` per site: soma `["soma-web"]`, boraei `[]`, mohamed-boraei `["mohamed-boraei", "__unknown__"]`. |
| `web/src/routes/api.ts` | `/api/usage`: CPU per account and script (D1 for past days, today live with the existing cache). Site API: CPU p50, p99 and requests cut per day of the site's scripts. |
| `web/src/logic/series.ts` | Daily series of p50, p99 and requests cut per script. |
| `web/ui/api.ts`, `web/ui/pages/Usage*.tsx`, `web/ui/pages/Site.tsx` | The two cards per account in "Consumo de planes" and the three columns in "Tráfico diario". |
| `web/ui/components/LineChart.tsx`, `web/ui/styles.css` | A fourth series color (up to 2 scripts × p50/p99 per account), validated for both themes with the dataviz method; optional label for the limit line ("Límite por petición (Free)"). |
| `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md` | New tables, source and the `__unknown__` mapping note. |

## Data
Migration `0002_workers_cpu.sql` in `monitor-cbt-statistics-db`:

```sql
CREATE TABLE workers_cpu_daily (
  day TEXT NOT NULL,
  account_id TEXT NOT NULL,
  script TEXT NOT NULL,            -- scriptName; '__unknown__' when Cloudflare gives none
  requests INTEGER NOT NULL CHECK (requests >= 0),
  errors INTEGER NOT NULL CHECK (errors >= 0),
  exceeded_resources INTEGER NOT NULL CHECK (exceeded_resources >= 0),
  cpu_p50_ms REAL, cpu_p99_ms REAL, cpu_p999_ms REAL,
  wall_p50_ms REAL, wall_p99_ms REAL,
  sample_interval REAL,            -- 1 = exact; above 1 = estimated from a sample
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (day, account_id, script)
);

-- A processed day, even with no invocations, so it is not read again every day.
CREATE TABLE workers_cpu_checked (
  day TEXT NOT NULL,
  account_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (day, account_id)
);
```

- Times are stored in ms (µs ÷ 1,000) with their decimals; rounding to one decimal is done only for display (R4, R20).
- A script that appears only in `x<day>` (cut requests with no other row) is stored with its count and empty quantiles.
- Processing a day again replaces its rows, as for usage (R30 of spec 001).
- Size: about 6 rows per day for the 3 accounts, a few hundred bytes.
- Reading: past days from D1; today live, inside the query `/api/usage` already makes, with its one-hour cache. Days before the first run are not read from Cloudflare when a page opens: the daily task fills 29 days on its first run.

## Security
- Same token and same read-only permission (Account Analytics Read), already confirmed on the 3 accounts on 2026-11-24.
- Errors are logged only through `describeError` (R7); no new data reaches the browser except figures per script.
- A site's page only receives the scripts listed for it in `sites.json` (R9); staging scripts and `__unknown__` not assigned stay in "Consumo de planes", which only the owner sees.

## Risks
- **Query size:** the first run adds about 58 parts (29 days × 2) to each account's query. If Cloudflare rejects it (complexity or time), the CPU goes to its own query per account: 3 more subrequests, within the 50 per invocation.
- **Sampling:** the percentiles are estimates when `sampleInterval` is above 1 (SOMA had 2.5 over the week). The (i) of the CPU card says so.
- **`__unknown__` mapping:** right only while `mohamed-boraei` is the only Worker with code in the BORAEI account (P2).
- **Chart colors:** a fourth color must pass contrast and color-blindness checks in both themes, as the three in T6 of spec 003.

## Testing strategy
- Vitest with dummy fixtures (the GraphQL API is never called): quantile parser, µs → ms, `exceededResources` count, script with only cut requests, days to read and the 29-day cap, D1 writes and replacement in the local Miniflare database, per-site figures (highest p50/p99, sum of cut), "Sin script" label, "Cortadas" highlight (> 0, with text), "Sin dato" on a missing day, boraei notice.
- The daily task is tested by calling `scheduled` with mocked responses, as in `cron.test.ts`.
- The owner tests T6 and T7 locally, after running the daily task by hand so the local database has the previous days.
- Deploy only with the owner's authorization: first `npx wrangler d1 migrations apply monitor-cbt-statistics-db --remote`, then `npm run deploy` (`docs/DEVELOPMENT.md`).
