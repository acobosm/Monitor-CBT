# Services and Costs — monitor-cbt
Inventory of every account and service the project depends on. Limits must be checked on the provider's official pricing page and dated.

## Accounts
| Service | Account (owner) | Who has access | Notes |
|---|---|---|---|
| Cloudflare: COBTEC account (212a78d4cea6e1047658a98ba757cd2b) | COBTEC (owner) | Owner | Worker, D1 databases, Access, zone `cobtec.net`. |
| Cloudflare: SOMA account (b74a9056b9ae179a543449713d41020d) | Client SOMA | Owner, by delegated administration | This app only reads analytics. |
| Cloudflare: BORAEI account (31767db4f7f58a6651b7a284e211be81) | Client BORAEI (the Boraei brothers) | Owner, by delegated administration | This app only reads analytics. |
| GoDaddy | COBTEC (owner) | Owner | Registrar of `cobtec.net`. DNS moves to Cloudflare; email stays where it is. |
| Outlook.com (Microsoft) | Owner's personal account | Owner | Email for `cobtec.net` (MX record). When moving DNS to Cloudflare, copy the MX record and any email-related TXT/CNAME records exactly as in GoDaddy, as DNS only. |
| GitHub and GitLab | Owner | Owner | Private repositories, not created yet. |
| Bitwarden | Owner | Owner | Stores the analytics token. |

## Plans, limits and current usage
| Service | Plan | Relevant limits (checked on: date) | Current usage | Monthly cost |
|---|---|---|---|---|
| Workers | Free | 100,000 requests/day (reset 00:00 UTC); 10 ms CPU per invocation, cron included; 50 subrequests per invocation; 5 cron triggers per account (2026-10-28) | Pending (spec 001) | $0 |
| D1 | Free | 5 M rows read/day; 100,000 rows written/day (reset 00:00 UTC); 5 GB total; 500 MB per database; 10 databases; Time Travel 7 days (2026-10-28) | Pending (spec 001) | $0 |
| R2 | Free | 10 GB-month; 1 M Class A ops/month; 10 M Class B ops/month. Not used by this app; measured in the monitored accounts (2026-10-28) | Not used | $0 |
| GraphQL Analytics API | Included | 300 queries per 5 minutes; adaptive datasets keep at least 31 days on every plan; up to 10 zones per query (2026-10-28) | Pending (spec 001) | $0 |
| Zero Trust (Access) | Free | 50 users; sign-in logs kept up to 24 hours. One-time PIN availability on Free not stated in the docs: verify in the dashboard (2026-10-28) | 1 user | $0 |

Sources: developers.cloudflare.com (workers/platform/limits, d1/platform/pricing, d1/platform/limits,
r2/pricing, analytics/graphql-api/limits) and cloudflare.com/plans/sase-zero-trust.

Risks noted for spec 001: the 10 ms CPU limit for the daily cron (split it into several runs if
needed); one-time PIN availability on Access Free.

## Credentials
<!-- UNIVERSAL: nunca escribir aquí secretos, contraseñas ni tokens; solo dónde se guardan y quién puede rotarlos. -->
| Secret | Stored in | Rotation |
|---|---|---|
| `CLOUDFLARE_ANALYTICS_TOKEN` | Worker secret, `web/.dev.vars`, Bitwarden | Expiration of 6 months recommended, 1 year maximum. Create the new token, load it with `npx wrangler secret put`, revoke the old one, check the remaining days in the dashboard. |
| `ALLOWED_EMAILS` | Worker secret, `web/.dev.vars` | When people are added or removed (together with the Access policy). |
| wrangler session (`wrangler login`) | Only on the owner's computer, temporary | At the end of every work session: `npx wrangler logout`. |

Not secrets (kept in `wrangler.jsonc`): the Access team domain and the Access application "AUD" tag,
which the Worker needs to validate the JWT.

Planned analytics token (step-by-step creation guide to be written in spec 001, after confirming the
permissions cover every metric, IPs included):
- Name: `monitor-cbt-analytics-readonly` (user API token).
- Permissions: `Account | Account Analytics | Read` on the 3 accounts; `Zone | Analytics | Read` on the 4 zones.
- No IP filtering; expiration 6 months.
