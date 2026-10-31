# AGENTS.md — monitor-cbt

## Project
monitor-cbt is a private web dashboard that shows Cloudflare resource usage
(Workers, D1, R2 and zone traffic) for the websites COBTEC manages under delegated administration,
plus COBTEC's own account. Data comes only from the Cloudflare GraphQL Analytics API
(`POST https://api.cloudflare.com/client/v4/graphql`), plus the token verify endpoint
(`GET /client/v4/user/tokens/verify`) to read the token's expiration, through a read-only user
token that never reaches the browser. A daily scheduled task stores snapshots in D1 to keep history beyond what the
API retains. Access is restricted by email one-time PIN (Cloudflare Access). For now only the owner
uses it; clients receive Excel reports on request.
- Code lives in `web/`; all `npm` and `npx wrangler` commands run from `web/`. Documentation (`docs/`, `specs/`) lives at the repository root.
- Production: the Worker's `workers.dev` URL protected by Access; https://monitor.cobtec.net is a GoDaddy redirect to it. `cobtec.net` DNS stays at GoDaddy (family Outlook.com email). No staging environment: local and production only.

| Site | Account | Account ID | Zone |
|---|---|---|---|
| COBTEC (CBT) | own | 212a78d4cea6e1047658a98ba757cd2b | cobtec.net (DNS at GoDaddy: account usage only, no zone traffic) |
| SOMA | delegated | b74a9056b9ae179a543449713d41020d | somabwc.com |
| BORAEI | delegated | 31767db4f7f58a6651b7a284e211be81 | boraei.com |
| MOHAMED-BORAEI | delegated | 31767db4f7f58a6651b7a284e211be81 | mohamedboraei.com (served at www; mohamed-boraei.com only redirects to it, verified 2026-10-29) |

## Stack
- Cloudflare Workers (Free plan), TypeScript, wrangler.
- API and scheduled task: Hono on the Worker (`fetch` + `scheduled` handlers).
- UI: React built with Vite, served as Workers Static Assets from the same Worker. Final visual design will come from the CBT design system.
- Storage: Cloudflare D1, two databases: `monitor-cbt-statistics-db` (daily snapshots) and `monitor-cbt-audit-db` (audit log).
- Access: Cloudflare Access (Zero Trust) with email one-time PIN in front of the Worker's `workers.dev` URL.
- Tests: Vitest with `@cloudflare/vitest-pool-workers`.
- Node.js 22 LTS (>= 22.23.4, security release of 2026-10-21) and npm >= 11.21.1.

## Commands
- `npm run dev`: local Worker + UI.
- `npm run typecheck`: TypeScript check.
- `npm test`: Vitest.
- `npm run build`: build the UI and the Worker (removes the `.dev.vars` copy from `dist/`).
- `npm run cf-typegen`: regenerate `worker-configuration.d.ts`.
- `npm run deploy`: deploy to production (only with user authorization).

## Non-negotiable rules (details in docs/constitution.md)
<!-- UNIVERSAL: no modificar sin que el usuario lo pida. -->
- Speak with the user in Spanish. Code, file and directory names, and commits: in English.
- Git: NEVER commit, push, merge, rebase, branch checkout, or reset: give the user the exact command. Any other command: show it and wait for authorization.
- Do not create, modify, or delete files without explicit user approval.
- Nothing against remote services (deploys, remote databases, secrets, DNS) without authorization.
- Secrets always outside the repo: `.env` and any file holding secrets must be listed in `.gitignore` (only a `.env.example` without real values is committed).
- On Windows + WSL, work only inside the WSL project folder. Commands such as `Get-ChildItem`, `C:\` paths or PowerShell mean the tool is running outside WSL: stop and tell the user.
- When starting a session on any machine (after `git pull`), verify with `date +%z` that the timezone is `-0500` (America/Guayaquil) before any commit. If it is not, notify the user and give them the command to fix it (`sudo timedatectl set-timezone America/Guayaquil`).
- The Cloudflare token is read-only (Account Analytics Read + Zone Analytics Read). Never request,
  create or use a token with write permissions on any account, especially the delegated client accounts.
- The token always has an expiration date: 6 months recommended, never more than 1 year. The dashboard
  shows how many days it has left.
- monitor-cbt never changes anything in client accounts (DNS, Workers, D1, R2): it only reads analytics.
- One client's data is never shown or sent to another client (reports and future client access are per site).

## Workflow (SDD, details in docs/PROCESS.md)
<!-- UNIVERSAL -->
1. Start by reading MEMORY.md (status and next step) and the active spec in `specs/`. Then evidence the work in Notion (Code Projects → Monitor-CBT → Registro de actividades): add a row for the session with its start time, and complete any earlier work or open session still missing from the log (never invent hours: ask the owner).
2. Show the plan before writing code; when facing decisions, give 2-3 options with pros, cons, and a recommendation.
3. Work in small tasks (`tasks.md`): each ends with typecheck + tests, and user testing locally if it touches the UI. Add each commit's hash to the session row in Notion.
4. When closing the session: update `tasks.md`, `MEMORY.md`, and affected documents, and translate them into English. In Notion, complete the session row (end time, pauses, summary) and update the project row.

## Document Language
<!-- UNIVERSAL -->
During a session, documents may be in Spanish (draft). Upon closing, they are translated to English in the same file.
If a document is in Spanish, it is the most recent draft.

## Testing
- Every EARS requirement has at least one automated test.
- The Cloudflare GraphQL API is never called from tests: responses are mocked with dummy fixtures.
- D1 is tested with the local Miniflare database provided by the Vitest pool.
- Anything that touches the UI is also tested by the user locally before committing.
- Run with `npm test` (and `npm run typecheck`) from `web/`.
- Cloudflare Access cannot be reproduced locally: tests use dummy Access JWTs to verify that the
  Worker rejects requests without a valid one; in local dev (`npm run dev`) the Access check is
  bypassed only when an explicit local flag is set in `.dev.vars`, never in production.
- The scheduled task is tested by invoking the `scheduled` handler directly with mocked GraphQL responses.
