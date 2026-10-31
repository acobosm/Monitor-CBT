# MEMORY.md — Project Status
_Last updated: 2026-10-30_

<!-- UNIVERSAL: este archivo es una foto del estado actual, no una bitácora. Se reescribe al cerrar cada sesión y se mantiene corto (unas 30 líneas). La historia vive en git y en las specs. -->

## Where we are
- Working branch: `001-usage-and-traffic-tables`. `main` = production.
- Remotes: `ghp` = https://github.com/acobosm/Monitor-CBT.git, `glp` = https://gitlab.com/acobosm1/cbt-development/monitor-cbt.git (private).
- Project phase: spec 001 in progress; T1–T11 done (token, skeleton, discovery, day and token logic, Access and audit, statistics database, plan usage, traffic, daily task, API, table UI).
- Last confirmed commit: `e5decbd` (T11, 2026-10-30; on `001-usage-and-traffic-tables`; `main` at `415d550`).
- Active spec: `specs/001-usage-and-traffic-tables/` (spec approved 2026-10-29; plan and tasks approved).

## Next step
1. Finish T12: confirm `monitor.cobtec.net` redirects to https://monitor-cbt.acobos.workers.dev and that the first daily run (01:00 UTC) stored 2026-10-30 in production. Everything else in T12 is done.
2. Task T13: documentation; then the owner merges the branch into `main`.

## Known pending tasks
- Analytics token `monitor-cbt-analytics-readonly` valid 2026-10-29 to 2026-12-31 23:59 ECT (owner's common date for all tokens): renew from 2026-12-01 following `docs/SERVICES_AND_COSTS.md`. When creating tokens, the TTL start date must be today (one was created with start = end day).
- Deploy token `monitor-cbt-deploy` (COBTEC account only, Workers Scripts Edit + D1 Edit, in Bitwarden) expires 2026-11-30: use it as the `CLOUDFLARE_API_TOKEN` variable in a normal terminal; renew or recreate it for later deploys.
- `cobtec.net` DNS stays at GoDaddy (decided 2026-10-29): the family's Outlook.com personalized addresses depend on it and cannot be re-added if lost. The monitor uses the workers.dev URL + Access, with a GoDaddy redirect from `monitor.cobtec.net`. Domain expires 2027-01-28: renew in time.
- Legal: put the verbal delegated-administration agreements with SOMA and BORAEI in writing; confirm LOPDP roles and legitimate interest for IPs with an advisor; check the clients' privacy policies (`docs/LEGAL.md`).
- Move to Node 24 LTS before April 2027.
- Spec 003 (charts): the owner wants a daily chart per usage metric with a line at the limit (asked 2026-10-29); D1 history is stored from the first day, so it will have data.
- Final UI: add an (i) with a hover message explaining "Peticiones de Worker" (Worker runs, counted against the limit) versus "Peticiones al sitio" (all visitor requests to the zone) (asked 2026-10-30).
- Final UI: on a phone-width window, wide tables scroll sideways to reach the last column (owner accepts it for now).
- SOMA visits differ slightly from SOMA's own monitor (+1 on 2026-10-25, +2 on 2026-10-28; other days equal). Not explained yet: check whether that monitor filters by host ("Visitas de producción").
- Design: the CBT design system and the "CBT Monitoreo" prototype are a visual reference for spec 003; the landing animation conflicts with the design system's "no animation" rule.
- Future spec "Seal of Guarantee": anchor daily hashes of statistics, audit and client reports on a blockchain (Rust or Solidity). Data stays private in D1; only hashes go on-chain. It proves the data was not altered after sealing, not that it is correct. Compare OpenTimestamps, EAS, Solana, Soroban and ICP. **Verify ICP first**: canisters in Rust, reverse gas model with cycles; check whether cycles must be bought (cost per month for this load) or can be obtained free, and current developer credits, in official sources.
