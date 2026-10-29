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
- npm >= 11.21.1 (`npm install -g npm@11.21.1`): npm 10 crashes resolving the test plugin's peer
  dependencies (`Cannot read properties of null (reading 'edgesOut')`). Enforced by `engines` +
  `engine-strict`. wrangler is a project dependency, used with `npx wrangler` (no global install).
- Access to the COBTEC Cloudflare account to deploy.
- The read-only analytics token, kept in the owner's password manager.
- Every dependency is pinned to an exact version (`save-exact=true` in `web/.npmrc`). Rule: versions
  published at least 2 weeks earlier. Exception (2026-10-29): `wrangler` 4.154.0, `@cloudflare/vite-plugin`
  1.66.0 and `@cloudflare/vitest-plugin` 1.4.9 were 1-2 days old, taken because they fix known
  vulnerabilities (undici TLS bypass, sharp, zod) in 4.151.0 / 1.64.0.
- `vitest` stays on 4.x until the Cloudflare test plugin and the rest of the toolchain are checked with 5.x.

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
| Domain | `monitor-cbt.<subdomain>.workers.dev` protected by Access; `monitor.cobtec.net` is a GoDaddy 301 redirect (unmasked) to it; preview URLs disabled |
| Databases | `monitor-cbt-statistics-db`, `monitor-cbt-audit-db` |
| Deploy command | From `web/`: remote migrations of each database first, then `npm run deploy`. Always with user authorization. |

- Order: migrations before code, so new code never meets a database without its tables.
- `cobtec.net` DNS stays at GoDaddy (the family's Outlook.com addresses depend on it). Never use masked
  forwarding: it breaks the Access sign-in. A Custom Domain can be added later without code changes if the
  zone moves to Cloudflare or another domain is used.

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
- **Install scripts (npm 11):** dependency install scripts are blocked unless listed in `allowScripts`
  in `web/package.json`, pinned per version. Only `esbuild` and `workerd` are approved. After an update
  that changes their version, review and run `npm install-scripts approve esbuild workerd` and
  `npm rebuild esbuild workerd`; `npm install-scripts ls` must list nothing.
- **`.dev.vars` copy in the build:** `vite build` (Cloudflare Vite plugin) writes the local secrets to
  `dist/monitor_cbt/.dev.vars` for `vite preview`. The `build` script deletes it right after; do not use
  `vite preview`, and never run `vite build` directly.
- **Tests use dummy bindings:** `vitest.config.ts` overrides the token, `ALLOWED_EMAILS` and the Access settings
  with dummy values (a test checks it), and applies the audit migrations to a local D1 in `test/setup.ts`.
  Access JWTs in tests are signed with a key generated on the fly (`test/helpers/access-jwt.ts`); Cloudflare
  is never called.
- **Access settings:** `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are `vars` in `wrangler.jsonc`, empty until T12.
  While empty, every `/api/*` request gets 403 (fail closed, R3), also in production.
- **Local bypass:** `LOCAL_ACCESS_BYPASS` is a `var` with value `"false"`; only `web/.dev.vars` sets it to
  `"true"`, and it only applies to requests to `localhost` (R4). Local identity: `local@localhost`.
- **Required secrets:** `secrets.required` in `wrangler.jsonc` lists `CLOUDFLARE_ANALYTICS_TOKEN` and
  `ALLOWED_EMAILS`: deploy fails if they are not set, and `npm run dev` warns if `.dev.vars` lacks them.
  With `secrets` declared, wrangler only loads from `.dev.vars` the names declared as secrets or vars.
- **D1 placeholder IDs:** `AUDIT_DB` uses `00000000-0000-0000-0000-000000000000` and `STATS_DB`
  `00000000-0000-0000-0000-000000000001` until the remote databases are created in T12; local development and
  tests do not need the real IDs. Tests apply both migration folders in `test/setup.ts` and empty the
  statistics tables before each test.
- **Types:** `npm run cf-typegen` runs `wrangler types --strict-vars=false` so vars are typed as `string`.
- **Two tsconfigs:** `tsconfig.json` (Worker, tests, configs, Workers runtime types) and
  `tsconfig.ui.json` (UI, DOM types); browser and Workers types conflict in one project.
  `npm run typecheck` runs both.
- **Generated types:** `worker-configuration.d.ts` comes from `npm run cf-typegen` (`wrangler types`);
  rerun it after changing `wrangler.jsonc` or the variable names in `.dev.vars`. It holds names only, never values.
- **`index.html`** lives in `web/` (Vite root); UI code lives in `web/ui/`.
- **Discovery script:** `node scripts/discover.mjs <file.json>` (from `web/`) reads the `settings` node and one
  test day per account and zone. Read-only, never prints the token, redacts IPs. Its report holds client
  analytics: write it outside the repo (e.g. a temporary folder), never under `web/`.
