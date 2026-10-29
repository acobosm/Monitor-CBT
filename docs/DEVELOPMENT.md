# Development Guide — monitor-cbt

## Repository Structure
| Path | Usage |
|---|---|
| `AGENTS.md`, `MEMORY.md` | Agent instructions and current project status. |
| `docs/` | System documentation. |
| `specs/` | One directory per feature (SDD): `spec.md`, `plan.md`, `tasks.md`. |
| `web/` | All the code. `npm` and `wrangler` commands run here. |
| `web/src/` | The Worker: API (Hono), daily task, GraphQL client, Access validation. |
| `web/ui/` | React UI (the CBT design goes here). |
| `web/config/` | `sites.json` (monitored sites) and `limits.json` (plan limits). |
| `web/migrations/statistics/` | Migrations of `monitor-cbt-statistics-db`. |
| `web/migrations/audit/` | Migrations of `monitor-cbt-audit-db`. |
| `web/test/` | Tests and fixtures (sample API responses with dummy data). |

## Requirements
- Node.js >= 22.23.4 (22 LTS line). Move to Node 24 LTS before April 2027, when the 22 line reaches end of life.
- npm. wrangler is a project dependency, used with `npx wrangler` (no global install).
- Access to the COBTEC Cloudflare account to deploy.
- The read-only analytics token, kept in the owner's password manager.
- No pinned dependency versions for now; any pinned version is listed here with its reason.

## Initial Local Setup
1. `cd web && npm install`
2. Copy `web/.dev.vars.example` to `web/.dev.vars` (ignored by git) and set `CLOUDFLARE_ANALYTICS_TOKEN`,
   `ALLOWED_EMAILS` and the local Access bypass flag.
3. Apply local migrations: `npx wrangler d1 migrations apply monitor-cbt-statistics-db --local` and
   `npx wrangler d1 migrations apply monitor-cbt-audit-db --local`.
4. `npm run dev`. There is no seed data: locally the app reads the real API with the token and stores
   the results in the local D1 databases.

## Local Testing
| What | Locally | How |
|---|---|---|
| UI and API | Yes | `npm run dev` |
| Real Cloudflare API reads | Yes | With the token in `.dev.vars` |
| D1 databases | Yes | Local databases simulated by wrangler |
| Daily task | Yes | Triggered by hand with wrangler's scheduled-test mode, without waiting for 19:00 ECT |
| Cloudflare Access sign-in | **No** | Locally the bypass flag is used. JWT validation is covered by automated tests with dummy JWTs. The real sign-in is tested in production after the first deploy. |
| Automated tests | Yes | `npm test`, never calling Cloudflare (fixtures) |

## Environments and Deployment
Local and production only (no staging).

| | Production |
|---|---|
| App / Worker / Service | Worker `monitor-cbt` (COBTEC account) |
| Domain | `monitor.cobtec.net` (Worker Custom Domain; `workers.dev` and preview URLs disabled) |
| Databases | `monitor-cbt-statistics-db`, `monitor-cbt-audit-db` |
| Deploy command | From `web/`: remote migrations of each database first, then `npm run deploy`. Always with user authorization. |

- Order: migrations before code, so new code never meets a database without its tables.
- Prerequisite: `cobtec.net` must already be in Cloudflare (nameservers moved from GoDaddy, MX record
  copied as DNS only) before `monitor.cobtec.net` can be used.

## What can be changed without code
There is no admin panel.

| Change | How | Needs code? |
|---|---|---|
| Emails allowed to sign in, session duration | Access policy in the Cloudflare Zero Trust dashboard | No |
| Worker email allowlist | `npx wrangler secret put ALLOWED_EMAILS` | No (a command) |
| Renew the token | Create it in Cloudflare, then `npx wrangler secret put CLOUDFLARE_ANALYTICS_TOKEN` | No (a command) |
| Add or remove a site | Edit `web/config/sites.json`, commit and deploy | Yes (configuration change) |
| Plan limits or warning thresholds | Edit `web/config/limits.json`, commit and deploy | Yes (configuration change) |

A new email must be added in **both** places (Access policy and `ALLOWED_EMAILS`): that is the double barrier.

## Known Details
<!-- Detalles técnicos que un programador nuevo debe conocer (limitaciones, valores escritos en el código, rarezas de herramientas). Se va llenando durante el desarrollo. -->
