# Data Model — monitor-cbt

## Data stores
| Store | Contents |
|---|---|
| D1 `monitor-cbt-statistics-db` | Daily history of plan usage, traffic per site, countries and top IPs. |
| D1 `monitor-cbt-audit-db` | Audit log: data views and exports. Kept separate so restoring statistics (Time Travel) never erases audit records, and so it can be backed up and exported on its own. |
| Config file in the repo `web/config/sites.json` | Monitored accounts and sites (id, name, account ID, zone, zone ID). Changed by commit; rarely changes. |
| Config file in the repo (e.g. `web/config/limits.json`) | Free plan limits, each with the date it was checked on the provider's pricing page. Changed by commit, so changes have history. |
| Worker secret `ALLOWED_EMAILS` (and `web/.dev.vars` locally) | Allowed emails with their role. Not in the repo: emails are personal data. |
| Worker secret `CLOUDFLARE_ANALYTICS_TOKEN` (and `web/.dev.vars` locally) | Read-only Cloudflare analytics token. |

## Entities
<!-- Fields confirmed by the T3 discovery (2026-10-29, `web/scripts/discover.mjs`); sources in "GraphQL sources" below. -->
All `day` fields are Cloudflare's UTC day (19:00 to 19:00 ECT), as `YYYY-MM-DD`.

### Accounts and sites (config file `web/config/sites.json`, not tables)
`accounts` lists the 3 accounts whose plan usage is read (COBTEC included: its usage covers the monitor's own
Worker and D1 databases). `sites` lists the 3 sites whose zone is in Cloudflare; `cobtec.net` is not a site
because its DNS is at GoDaddy.

| Field | Type | Required | Sensitive | Description |
|---|---|---|---|---|
| accounts[].id | text | yes | no | `cobtec`, `soma`, `boraei`. |
| accounts[].name | text | yes | no | Display name. |
| accounts[].accountId | text | yes | no | Cloudflare account ID. |
| sites[].id | text | yes | no | `soma`, `boraei`, `mohamed-boraei` (used as `site_id` in the tables). |
| sites[].name | text | yes | no | Display name (SOMA, BORAEI, MOHAMED-BORAEI). |
| sites[].accountId | text | yes | no | Account that owns the zone. |
| sites[].zone | text | yes | no | Zone name (e.g. `somabwc.com`). |
| sites[].zoneTag | text | yes | no | Zone ID, required by GraphQL. |
| sites[].host | text | no | no | Hostname filter for traffic: only `www.mohamedboraei.com` (its apex only redirects; on 2026-10-28 the zone had 5,364 visitor requests, 1,561 of them to www). |

### usage_daily (`monitor-cbt-statistics-db`)
| Field | Type | Required | Sensitive | Description |
|---|---|---|---|---|
| day | text | yes | no | UTC day. |
| account_id | text | yes | no | Cloudflare account ID. |
| product | text | yes | no | `workers`, `d1` or `r2`. |
| metric | text | yes | no | `requests` (workers); `rows_read`, `rows_written`, `storage_bytes`, `largest_db_bytes`, `database_count` (d1); `class_a_ops`, `class_b_ops`, `storage_bytes` (r2). Summed over all scripts, databases or buckets of the account, except `largest_db_bytes` (size of the largest database that day) and `database_count` (databases reported that day). |
| value | integer | yes | no | Value for that day. |
| fetched_at | text | yes | no | When it was read from the API (ISO UTC). |

Key: (day, account_id, product, metric). Every metric is stored even when its value is 0 (e.g. an account
without Workers), so a processed day never looks missing to the backfill (R31).

### traffic_daily (`monitor-cbt-statistics-db`)
| Field | Type | Required | Sensitive | Description |
|---|---|---|---|---|
| day | text | yes | no | UTC day. |
| site_id | text | yes | no | Site id from `sites.json`. |
| requests | integer | yes | no | Requests from real visitors (`requestSource = eyeball`), filtered by `host` when set. |
| visits | integer | yes | no | Visits (`sum.visits`), same filter. |
| page_views | integer | no | no | Page views of the whole zone (only in `httpRequests1dGroups`, which has no host or source filter). |
| bytes | integer | yes | no | Bytes served (`sum.edgeResponseBytes`), same filter as requests. |
| fetched_at | text | yes | no | When it was read from the API. |

Key: (day, site_id).

### country_daily (`monitor-cbt-statistics-db`)
| Field | Type | Required | Sensitive | Description |
|---|---|---|---|---|
| day | text | yes | no | UTC day. |
| site_id | text | yes | no | Site id. |
| country | text | yes | no | ISO 3166-1 alpha-2 code (`clientCountryName`). |
| requests | integer | yes | no | Requests from that country (real visitors, same filter as `traffic_daily`). |

Key: (day, site_id, country).

### ip_daily (`monitor-cbt-statistics-db`)
| Field | Type | Required | Sensitive | Description |
|---|---|---|---|---|
| day | text | yes | no | UTC day. |
| site_id | text | yes | no | Site id. |
| kind | text | yes | no | `traffic` (top by request volume) or `security` (top by security events: blocked or challenged). |
| ip | text | yes | **yes (personal data)** | Visitor IP address. |
| country | text | no | no | ISO country code of the IP. |
| action | text | no | no | `security` only: `block` or `challenge` family (`securityAction`), shown as "Bloqueada" / "Desafiada". |
| requests | integer | yes | no | Requests (traffic) or security events (security) from that IP that day. |
| last_seen_hour | text | no | no | Start of the last hour the IP was seen that day (ISO UTC, from `datetimeHour`); shown as an ECT hour range (P5). |

Key: (day, site_id, kind, ip). Only the top 20 IPs per site, per day and per kind are stored (up to 40).
An IP with more than one security action that day keeps the one with most events.
`action` is required for `security` rows and empty for `traffic` rows (CHECK in the migration).

### dataset_availability (`monitor-cbt-statistics-db`)
| Field | Type | Required | Sensitive | Description |
|---|---|---|---|---|
| scope | text | yes | no | `zone` or `account`. |
| tag | text | yes | no | Zone ID or account ID. |
| dataset | text | yes | no | GraphQL dataset name (e.g. `httpRequestsAdaptiveGroups`). |
| enabled | integer | yes | no | 1 if available to the token on that plan, 0 otherwise. |
| not_older_than_s | integer | no | no | How far back it can be queried, in seconds. |
| max_duration_s | integer | no | no | Widest time range per query, in seconds. |
| checked_at | text | yes | no | When it was checked (ISO UTC). |

Key: (scope, tag, dataset). Refreshed on every daily run.

### audit_event (`monitor-cbt-audit-db`)
| Field | Type | Required | Sensitive | Description |
|---|---|---|---|---|
| id | integer | yes | no | Auto-increment id. |
| at | text | yes | no | Date and time (ISO UTC). |
| email | text | yes | **yes (personal data)** | Who did it, from the Access JWT. |
| action | text | yes | no | `view` or `export`. |
| target | text | yes | no | Screen or site id. |
| format | text | no | no | `xlsx`, `pdf` (exports only). |

## Sensitivity and retention
| Data | Sensitive? | Retention | On expiry |
|---|---|---|---|
| Usage, traffic and countries | No (confidential per client) | No limit for now; reviewed against D1 storage | — |
| Visitor IPs (`ip_daily.ip`) | **Yes, personal data** | 13 months | Deleted by the daily task |
| Email in the audit log (`audit_event.email`) | **Yes, personal data** | No automatic deletion for now | Reviewed as usage grows |

Size estimate (after T3, 3 sites): about 300 rows per day (usage 27, traffic 3, countries ~150,
IPs up to 120), roughly 30 KB per day or 11 MB per year; to be checked with real data after T12. D1 Free plan limit: 500 MB per
database (checked on 2026-10-28 at developers.cloudflare.com/d1/platform/limits).

Pending legal question (see `docs/LEGAL.md`): the legal basis for storing visitor IPs would be
legitimate interest in security under Ecuador's personal data protection law (LOPDP); to be
confirmed with a legal advisor, together with whether the clients' privacy policies mention it.

## Writes (T6)
- Each day of an account (`saveAccountDay`) or of a site (`saveSiteDay`) is written in one D1 `batch()`:
  it runs as a transaction (all or nothing) and counts as one query against the 50 per invocation on Free.
- Processing a day again replaces it (R30): usage, countries and IPs of that day are deleted and inserted
  again inside the batch, so rows that disappeared in the new run do not stay; traffic is upserted.
- The write keeps only the top 20 IPs per kind, ordered by requests and then by IP (R29).

## GraphQL sources (T3 discovery, 2026-10-29)
Checked with the `settings` node and one real read per account and zone. All datasets below are
enabled on the Free plan for the 3 accounts and 3 zones.

| Data | Dataset | Fields | History | Max range per query |
|---|---|---|---|---|
| Workers requests | `workersInvocationsAdaptive` | `sum.requests` by `scriptName` | 90 days | 32 days |
| D1 rows read / written | `d1AnalyticsAdaptiveGroups` | `sum.rowsRead`, `sum.rowsWritten` by `databaseId` | 90 days | 32 days |
| D1 storage | `d1StorageAdaptiveGroups` | `max.databaseSizeBytes` by `databaseId` | 90 days | 32 days |
| R2 operations | `r2OperationsAdaptiveGroups` | `sum.requests` by `actionType` (mapped to Class A/B) | 90 days | 32 days |
| R2 storage | `r2StorageAdaptiveGroups` | `max.payloadSize`, `max.metadataSize`, `max.objectCount` by `bucketName` | 90 days | 32 days |
| Requests, visits, bytes, countries | `httpRequestsAdaptiveGroups` | `count`, `sum.visits`, `sum.edgeResponseBytes`, `clientCountryName`; filters `requestSource`, `clientRequestHTTPHost` | 31 days | 30 days |
| Top IPs by traffic | `httpRequestsAdaptiveGroups` | `count` by `clientIP`, `clientCountryName`; then `datetimeHour` for the top 20 | 31 days | 30 days |
| Top IPs by security | `httpRequestsAdaptiveGroups` | `count` by `clientIP`, `securityAction` (`securityAction_neq: "unknown"`); `block` → "Bloqueada", any `*challenge*` → "Desafiada", others (log, skip…) ignored | 31 days | 30 days |
| Page views | `httpRequests1dGroups` | `sum.pageViews` | 365 days | 365 days |

- `firewallEventsAdaptiveGroups` is **disabled** on Free; `firewallEventsAdaptive` (raw events) is enabled
  but not used, because grouped requests give the same counts and are not cut at 10,000 rows.
- Adaptive datasets are sampled (`avg.sampleInterval`); counts are estimates under high traffic.
- "History" is counted back from the query time, so recovery covers 30 complete days (P6).
- History in D1 starts on the first run of the daily task: the past that Cloudflare still keeps is not copied (P9).
- Account datasets keep 90 days, more than the 30-day backfill.

## Backups and restore
Data older than the Cloudflare API retention cannot be fetched again: if it is lost from D1, it is
lost for good. Two layers:
1. **Automatic: D1 Time Travel.** Either database can be restored to any point in the last 7 days
   (Free plan). Used when a bug corrupts data and it is noticed quickly. The owner runs
   `npx wrangler d1 time-travel restore <database> --timestamp=<time>` (remote action, requires
   authorization). Restoring statistics never touches the audit database, and vice versa.
2. **Monthly manual export.** The owner runs `npx wrangler d1 export <database> --remote --output=<file>.sql`
   for both databases and stores the files **outside the repo**, in an encrypted folder on their
   computer or personal cloud (the files contain IPs and emails). Restoring from an export means
   importing it into a new or emptied database with `npx wrangler d1 execute <database> --remote --file=<file>.sql`.

Future idea: automate the export from the scheduled task into R2.
