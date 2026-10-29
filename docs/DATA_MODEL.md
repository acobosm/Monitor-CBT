# Data Model — monitor-cbt

## Data stores
| Store | Contents |
|---|---|
| D1 `monitor-cbt-statistics-db` | Daily history of plan usage, traffic per site, countries and top IPs. |
| D1 `monitor-cbt-audit-db` | Audit log: data views and exports. Kept separate so restoring statistics (Time Travel) never erases audit records, and so it can be backed up and exported on its own. |
| Config file in the repo `web/config/sites.json` | Monitored sites (id, name, account ID, zone). Changed by commit; rarely changes. |
| Config file in the repo (e.g. `web/config/limits.json`) | Free plan limits, each with the date it was checked on the provider's pricing page. Changed by commit, so changes have history. |
| Worker secret `ALLOWED_EMAILS` (and `web/.dev.vars` locally) | Allowed emails with their role. Not in the repo: emails are personal data. |
| Worker secret `CLOUDFLARE_ANALYTICS_TOKEN` (and `web/.dev.vars` locally) | Read-only Cloudflare analytics token. |

## Entities
<!-- Initial proposal: exact fields are confirmed in spec 001 after checking what the GraphQL API exposes on the Free plan. -->
All `day` fields are Cloudflare's UTC day (19:00 to 19:00 ECT), as `YYYY-MM-DD`.

### Site (config file `web/config/sites.json`, not a table)
| Field | Type | Required | Sensitive | Description |
|---|---|---|---|---|
| id | text | yes | no | Stable id: `cobtec`, `soma`, `boraei`, `mohamed-boraei`. |
| name | text | yes | no | Display name (COBTEC, SOMA, BORAEI, MOHAMED-BORAEI). |
| accountId | text | yes | no | Cloudflare account ID. |
| zone | text | yes | no | Zone name (e.g. `somabwc.com`). |
| host | text | no | no | Optional hostname filter for traffic (e.g. `www.mohamedboraei.com`). |

### usage_daily (`monitor-cbt-statistics-db`)
| Field | Type | Required | Sensitive | Description |
|---|---|---|---|---|
| day | text | yes | no | UTC day. |
| account_id | text | yes | no | Cloudflare account ID. |
| product | text | yes | no | `workers`, `d1` or `r2`. |
| metric | text | yes | no | E.g. `requests`, `rows_read`, `rows_written`, `storage_bytes`, `class_a_ops`, `class_b_ops`. |
| value | integer | yes | no | Value for that day. |
| fetched_at | text | yes | no | When it was read from the API (ISO UTC). |

Key: (day, account_id, product, metric).

### traffic_daily (`monitor-cbt-statistics-db`)
| Field | Type | Required | Sensitive | Description |
|---|---|---|---|---|
| day | text | yes | no | UTC day. |
| site_id | text | yes | no | Site id from `sites.json`. |
| requests | integer | yes | no | Requests. |
| visits | integer | no | no | Visits, if exposed on the Free plan. |
| page_views | integer | no | no | Page views, if exposed on the Free plan. |
| bytes | integer | no | no | Bytes served. |
| fetched_at | text | yes | no | When it was read from the API. |

Key: (day, site_id).

### country_daily (`monitor-cbt-statistics-db`)
| Field | Type | Required | Sensitive | Description |
|---|---|---|---|---|
| day | text | yes | no | UTC day. |
| site_id | text | yes | no | Site id. |
| country | text | yes | no | ISO 3166-1 alpha-2 code. |
| requests | integer | yes | no | Requests from that country. |

Key: (day, site_id, country).

### ip_daily (`monitor-cbt-statistics-db`)
| Field | Type | Required | Sensitive | Description |
|---|---|---|---|---|
| day | text | yes | no | UTC day. |
| site_id | text | yes | no | Site id. |
| kind | text | yes | no | `traffic` (top by request volume) or `security` (top by security events: blocked or challenged). |
| ip | text | yes | **yes (personal data)** | Visitor IP address. |
| country | text | no | no | ISO country code of the IP. |
| requests | integer | yes | no | Requests from that IP that day. |
| last_seen_at | text | no | no | Last request time that day (ISO UTC). |

Key: (day, site_id, kind, ip). Only the top 20 IPs per site, per day and per kind are stored (up to 40).

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

Size estimate (to be verified in spec 001): about 390 rows per day (usage ~24, traffic 4,
countries ~200, IPs up to 160), roughly 40 KB per day or 15 MB per year. D1 Free plan limit: 500 MB per
database (checked on 2026-10-28 at developers.cloudflare.com/d1/platform/limits).

Pending legal question (see `docs/LEGAL.md`): the legal basis for storing visitor IPs would be
legitimate interest in security under Ecuador's personal data protection law (LOPDP); to be
confirmed with a legal advisor, together with whether the clients' privacy policies mention it.

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
