# MEMORY.md — Project Status
_Last updated: 2026-10-31_

<!-- UNIVERSAL: este archivo es una foto del estado actual, no una bitácora. Se reescribe al cerrar cada sesión y se mantiene corto (unas 30 líneas). La historia vive en git y en las specs. -->

## Where we are
- Remotes: `ghp` = https://github.com/acobosm/Monitor-CBT.git, `glp` = https://gitlab.com/acobosm1/cbt-development/monitor-cbt.git (private).
- Working branch: `003-charts-and-design`. Spec 001 complete and merged. Production: https://monitor-cbt.acobos.workers.dev behind Access, reached through `monitor.cobtec.net`; deployed with `a2acfcb`.
- Last confirmed commit: `a7da12c` (T13 of spec 001, 2026-10-31; `main` at the same commit).
- Active spec: `specs/003-charts-and-design/` (spec and plan approved 2026-10-31). Spec 002 (export) comes after it, by the owner's choice.

## Next step
1. Continue spec 003 from the first unfinished task in its `tasks.md`.

## Known pending tasks
- Analytics token `monitor-cbt-analytics-readonly` valid 2026-10-29 to 2026-12-31 23:59 ECT (owner's common date for all tokens): renew from 2026-12-01 following `docs/SERVICES_AND_COSTS.md`. When creating tokens, the TTL start date must be today (one was created with start = end day).
- Deploy token `monitor-cbt-deploy` (COBTEC account only, Workers Scripts Edit + D1 Edit, in Bitwarden) expires 2026-11-30: use it as the `CLOUDFLARE_API_TOKEN` variable in a normal terminal; renew or recreate it for later deploys.
- `cobtec.net` DNS stays at GoDaddy (decided 2026-10-29): the family's Outlook.com personalized addresses depend on it and cannot be re-added if lost. The monitor uses the workers.dev URL + Access, with a GoDaddy redirect from `monitor.cobtec.net`. Domain expires 2027-01-28: renew in time.
- Legal: put the verbal delegated-administration agreements with SOMA and BORAEI in writing; confirm LOPDP roles and legitimate interest for IPs with an advisor; check the clients' privacy policies (`docs/LEGAL.md`).
- Worker requests are estimates when Cloudflare samples them (exact only at interval 1); see P11 and `docs/DATA_MODEL.md`.
- Move to Node 24 LTS before April 2027.
- Spec 003 (charts): the owner wants a daily chart per usage metric with a line at the limit (asked 2026-10-29); D1 history is stored from the first day, so it will have data.
- Final UI: add an (i) with a hover message explaining "Peticiones de Worker" (Worker runs, counted against the limit) versus "Peticiones al sitio" (all visitor requests to the zone) (asked 2026-10-30).
- Final UI: on a phone-width window, wide tables scroll sideways to reach the last column (owner accepts it for now).
- SOMA visits differ slightly from SOMA's own monitor (+1 on 2026-10-25, +2 on 2026-10-28; other days equal). Not explained yet: check whether that monitor filters by host ("Visitas de producción").
- Design: the "CBT Monitoreo" prototype rules over the design system where they differ, including the landing animation (spec 003, P1). Artifacts: prototype https://claude.ai/artifact/R9vTbc1smDZGtDHLPL1QD9 , design system https://claude.ai/artifact/Po6aoP9yPy4ArpRrFmxDSq .
- Future spec "Seal of Guarantee": anchor daily hashes of statistics, audit and client reports on a blockchain (Rust or Solidity). Data stays private in D1; only hashes go on-chain. It proves the data was not altered after sealing, not that it is correct. Compare OpenTimestamps, EAS, Solana, Soroban and ICP. **Verify ICP first**: canisters in Rust, reverse gas model with cycles; check whether cycles must be bought (cost per month for this load) or can be obtained free, and current developer credits, in official sources.
