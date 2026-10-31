# Services and Costs — monitor-cbt
Inventory of every account and service the project depends on. Limits must be checked on the provider's official pricing page and dated.

## Accounts
| Service | Account (owner) | Who has access | Notes |
|---|---|---|---|
| Cloudflare: COBTEC account (212a78d4cea6e1047658a98ba757cd2b) | COBTEC (owner) | Owner | Worker, D1 databases, Access, zone `cobtec.net`. |
| Cloudflare: SOMA account (b74a9056b9ae179a543449713d41020d) | Client SOMA | Owner, by delegated administration | This app only reads analytics. |
| Cloudflare: BORAEI account (31767db4f7f58a6651b7a284e211be81) | Client BORAEI (the Boraei brothers) | Owner, by delegated administration | This app only reads analytics. |
| GoDaddy | COBTEC (owner) | Owner | Registrar and DNS of `cobtec.net` (expires 2027-01-28). DNS stays at GoDaddy. Hosts the 301 redirect `monitor.cobtec.net` → workers.dev URL. |
| Outlook.com (Microsoft) | Owner's personal account (Microsoft 365 Family) | Owner and family | Personalized addresses @cobtec.net for the family (MX `…pamx1.hotmail.com`, SPF, `autodiscover`, `_outlook`, `_domainconnect` at GoDaddy). The feature was retired for new setups on 2023-11-30 and an address cannot be re-added once removed; it is tied to GoDaddy DNS. Do not move or edit those records. |
| GitHub and GitLab | Owner | Owner | Private repositories: `ghp` = github.com/acobosm/Monitor-CBT, `glp` = gitlab.com/acobosm1/cbt-development/monitor-cbt. Pushed with personal tokens (with expiration) kept in memory 8 h by the git credential cache. |
| Bitwarden | Owner | Owner | Stores the analytics and deploy tokens. |

## Plans, limits and current usage
"Current usage" is what the monitor's own COBTEC account shows on the dashboard: a first measurement taken on 2026-10-31 with the day in progress, not a typical day.

| Service | Plan | Relevant limits (checked on: date) | Current usage | Monthly cost |
|---|---|---|---|---|
| Workers | Free | 100,000 requests/day (reset 00:00 UTC); 10 ms CPU per invocation, cron included; 50 subrequests per invocation; 5 cron triggers per account (2026-10-28, rechecked 2026-10-29) | 13 requests/day | $0 |
| D1 | Free | 5 M rows read/day; 100,000 rows written/day (reset 00:00 UTC); 5 GB total; 500 MB per database; 10 databases; Time Travel 7 days; 50 queries per invocation, a `batch()` counts as one; 100 bound parameters per query (2026-10-28, rechecked 2026-10-29) | 339 rows read/day; 515 rows written/day; 106.5 KB in 2 databases | $0 |
| R2 | Free | 10 GB-month (average of the daily peak); 1 M Class A ops/month; 10 M Class B ops/month; deletes are free. Not used by this app; measured in the monitored accounts. Class lists copied into `web/src/logic/usage.ts` (2026-10-28, rechecked 2026-10-29) | Not used by this app | $0 |
| GraphQL Analytics API | Included | 300 queries per 5 minutes; adaptive datasets keep at least 31 days on every plan; up to 10 zones per query (2026-10-28) | About 10 queries per daily run, plus 3 per dashboard read of usage (calculated from the code) | $0 |
| Zero Trust (Access) | Free | 50 users; sign-in logs kept up to 24 hours. One-time PIN and Access on `workers.dev` work on Free (checked in production, 2026-10-30) | 1 user | $0 |

Sources: developers.cloudflare.com (workers/platform/limits, d1/platform/pricing, d1/platform/limits,
r2/pricing, analytics/graphql-api/limits) and cloudflare.com/plans/sase-zero-trust.

Risk noted for spec 001: the 10 ms CPU limit for the daily cron (split it into several runs if needed).

## Credentials
<!-- UNIVERSAL: nunca escribir aquí secretos, contraseñas ni tokens; solo dónde se guardan y quién puede rotarlos. -->
| Secret | Stored in | Rotation |
|---|---|---|
| `CLOUDFLARE_ANALYTICS_TOKEN` | Worker secret, `web/.dev.vars`, Bitwarden | Expiration of 6 months recommended, 1 year maximum. Create the new token, load it with `npx wrangler secret put`, revoke the old one, check the remaining days in the dashboard. |
| `ALLOWED_EMAILS` | Worker secret, `web/.dev.vars` | When people are added or removed (together with the Access policy). |
| `monitor-cbt-deploy` (COBTEC account only: Workers Scripts Edit, D1 Edit) | Bitwarden; used as the `CLOUDFLARE_API_TOKEN` variable in a normal terminal, never saved in the repo | Expires 2026-11-30: renew or recreate it for later deploys. |
| wrangler session (`wrangler login`) | Not used for deploys, because it also reaches the client accounts. If ever used: only on the owner's computer, temporary | At the end of every work session: `npx wrangler logout`. |

Not secrets (kept in `wrangler.jsonc`): the Access team domain and the Access application "AUD" tag,
which the Worker needs to validate the JWT.

## Analytics token guide
Token `monitor-cbt-analytics-readonly`: a user API token, read-only, for the GraphQL Analytics API and
`tokens/verify`. Its value is never written in the repository, in chats with assistants, in commits or
in screenshots.

### 1. Create
1. dash.cloudflare.com → My Profile → API Tokens → Create Token → Custom token → Get started.
2. Name: `monitor-cbt-analytics-readonly`.
3. Permissions (only these two):
   - `Account | Account Analytics | Read`
   - `Zone | Analytics | Read`
4. Account Resources: Include → each of the 3 accounts one by one (COBTEC, SOMA, BORAEI). Never "All accounts".
5. Zone Resources: Include → Specific zone → each of the 3 zones in Cloudflare (`somabwc.com`,
   `boraei.com`, `mohamedboraei.com`). `cobtec.net` is added by editing the token only if its DNS ever
   moves to Cloudflare.
6. Client IP Address Filtering: empty (the Worker leaves from changing Cloudflare IPs).
7. TTL: start today, end on the owner's common token expiration date (all the owner's API tokens expire
   on the same day; first token: 2026-10-29 to 2026-12-31 23:59 ECT = 2027-01-01T04:59:59Z). About 6
   months recommended, never more than 1 year. **Start date = today**: if it is left on a later day, GraphQL
   answers `401 Authentication error` until then, while `tokens/verify` still says `active`.
8. Continue to summary: check that only the 2 Read permissions, 3 accounts and 3 zones appear, and
   no "Edit" permission. Then Create Token and copy the value (it is shown only once).

### 2. Delegated accounts
SOMA and BORAEI appear in Account Resources only if the owner's user is a member of those accounts with
a role that can read Analytics. If one is missing, ask the client to adjust the owner's role in their
account. Never use a different or broader token to work around it.

### 3. Store
- Bitwarden item `monitor-cbt-analytics-readonly`: the value, expiration date, permissions, accounts and zones.
- `web/.dev.vars` (listed in `.gitignore`): `CLOUDFLARE_ANALYTICS_TOKEN=<value>`.
- Worker secret (with authorization): `npx wrangler secret put CLOUDFLARE_ANALYTICS_TOKEN`
  from `web/`; it asks for the value without echoing it.

### 4. Verify without exposing it
Run from `web/`; it prints only the status and the expiration date (share only that output):

```bash
TOKEN=$(grep '^CLOUDFLARE_ANALYTICS_TOKEN=' .dev.vars | cut -d= -f2-)
curl -s -H "Authorization: Bearer $TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify \
  | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["success"], (r.get("result") or {}).get("status"), (r.get("result") or {}).get("not_before"), (r.get("result") or {}).get("expires_on"), [e.get("message") for e in r.get("errors", [])])'
unset TOKEN
```

Expected: `True active <start date> <expiration date> []`, with the start date not in the future.

### 5. Renew (about 30 days before expiration, or when the dashboard shows "Por vencer")
1. Create a new token with the same settings, named `monitor-cbt-analytics-readonly-YYYY-MM`.
2. Update Bitwarden, `web/.dev.vars` and the Worker secret.
3. Verify it (step 4) and check that the dashboard loads data.
4. Only then revoke the old token (API Tokens → ⋯ → Delete).
5. Update the expiration date in `MEMORY.md`.

### 6. Revoke immediately if it leaks
1. Delete it in API Tokens.
2. Create a new one (step 1) and store it (step 3).
3. Review the audit log of each of the 3 accounts (Manage Account → Audit Log) for unexpected activity.
4. Record what happened, when, and what was done in `docs/TECH_DEBT.md` or the active spec.
