# monitor-cbt
Private dashboard at monitor.cobtec.net that shows Cloudflare usage (Workers, D1, R2 and zone
traffic) for the websites COBTEC manages, using a read-only Cloudflare Analytics token.

## Requirements
- Node.js >= 22.23.4 and npm.
- Access to the COBTEC Cloudflare account (212a78d4cea6e1047658a98ba757cd2b) to deploy.
- A read-only Cloudflare analytics token (see `docs/SERVICES_AND_COSTS.md`). It is never stored in the repo.

## Getting started
<!-- To be confirmed when the code exists (spec 001). -->
1. `cd web && npm install`
2. Copy `web/.dev.vars.example` to `web/.dev.vars` and set `CLOUDFLARE_ANALYTICS_TOKEN`
   (from the password manager), `ALLOWED_EMAILS` and the local Access bypass flag. `web/.dev.vars` is ignored by git.
3. `npx wrangler d1 migrations apply monitor-cbt-statistics-db --local` and
   `npx wrangler d1 migrations apply monitor-cbt-audit-db --local`
4. `npm run dev`

## Documentation
<!-- UNIVERSAL -->
- `AGENTS.md`: project essentials and rules for any AI agent.
- `MEMORY.md`: current status and next step.
- `docs/constitution.md`: non-negotiable principles.
- `docs/PROCESS.md`: how work is done (spec-driven development with EARS requirements).
- `docs/DEVELOPMENT.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`: how the system is built.
- `docs/SERVICES_AND_COSTS.md`, `docs/LEGAL.md`: services, accounts, costs, ownership and data.
- `specs/`: one folder per feature (`spec.md`, `plan.md`, `tasks.md`).

## License and ownership
© 2026 COBTEC (CBT). All rights reserved. Proprietary and private; no open-source license.
