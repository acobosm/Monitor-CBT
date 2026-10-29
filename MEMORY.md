# MEMORY.md — Project Status
_Last updated: 2026-10-29_

<!-- UNIVERSAL: este archivo es una foto del estado actual, no una bitácora. Se reescribe al cerrar cada sesión y se mantiene corto (unas 30 líneas). La historia vive en git y en las specs. -->

## Where we are
- Working branch: `001-usage-and-traffic-tables`. `main` = production.
- Remotes: `ghp` = https://github.com/acobosm/Monitor-CBT.git, `glp` = https://gitlab.com/acobosm1/cbt-development/monitor-cbt.git (private).
- Project phase: spec 001 in progress; T1–T8 done (token, skeleton, discovery, day and token logic, Access and audit, statistics database, plan usage, traffic).
- Last confirmed commit: `732e8d2` (T7, 2026-10-29, on `001-usage-and-traffic-tables`; `main` at `415d550`).
- Active spec: `specs/001-usage-and-traffic-tables/` (spec approved 2026-10-29; plan and tasks approved).

## Next step
1. Task T9: daily task (cron, capped backfill, IP purge, daily discovery).

## Known pending tasks
- Analytics token `monitor-cbt-analytics-readonly` valid 2026-10-29 to 2026-12-31 23:59 ECT (owner's common date for all tokens): renew from 2026-12-01 following `docs/SERVICES_AND_COSTS.md`. When creating tokens, the TTL start date must be today (one was created with start = end day).
- `cobtec.net` DNS stays at GoDaddy (decided 2026-10-29): the family's Outlook.com personalized addresses depend on it and cannot be re-added if lost. The monitor uses the workers.dev URL + Access, with a GoDaddy redirect from `monitor.cobtec.net`. Domain expires 2027-01-28: renew in time.
- Verify that Access one-time PIN and one-click Access on `workers.dev` work on the Zero Trust Free plan (before T12).
- Legal: put the verbal delegated-administration agreements with SOMA and BORAEI in writing; confirm LOPDP roles and legitimate interest for IPs with an advisor; check the clients' privacy policies (`docs/LEGAL.md`).
- Move to Node 24 LTS before April 2027.
- Spec 003 (charts): the owner wants a daily chart per usage metric with a line at the limit (asked 2026-10-29); D1 history is stored from the first day, so it will have data.
- Design: the CBT design system and the "CBT Monitoreo" prototype are a visual reference for spec 003; the landing animation conflicts with the design system's "no animation" rule.
- Future spec "Seal of Guarantee": anchor daily hashes of statistics, audit and client reports on a blockchain (Rust or Solidity). Data stays private in D1; only hashes go on-chain. It proves the data was not altered after sealing, not that it is correct. Compare OpenTimestamps, EAS, Solana, Soroban and ICP. **Verify ICP first**: canisters in Rust, reverse gas model with cycles; check whether cycles must be bought (cost per month for this load) or can be obtained free, and current developer credits, in official sources.
