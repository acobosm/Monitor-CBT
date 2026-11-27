# MEMORY.md — Project Status
_Last updated: 2026-11-27_

<!-- UNIVERSAL: este archivo es una foto del estado actual, no una bitácora. Se reescribe al cerrar cada sesión y se mantiene corto (unas 30 líneas). La historia vive en git y en las specs. -->

## Where we are
- Remotes: `ghp` = https://github.com/acobosm/Monitor-CBT.git, `glp` = https://gitlab.com/acobosm1/cbt-development/monitor-cbt.git (private).
- Specs 001 and 003 complete and merged. Production: https://monitor-cbt.acobos.workers.dev behind Access, reached through `monitor.cobtec.net`.
- Spec 004 (Workers CPU per request) on branch `004-workers-cpu`: T1–T8 done and deployed (version fa551d7d, 2026-11-27, checked by the owner in production); T10 (docs) done. Remote migration `0002_workers_cpu.sql` applied. Production fills the 29 CPU days by the run of the night of 2026-11-27.
- First finding: the mohamedboraei.com version that builds the page on every visit (deployed 2026-11-24) raised the p50 of `mohamed-boraei` from about 1 to about 9 ms and had 103 requests cut that day; SOMA stays at about 1 ms p50 and 0 cut.

## Next step
1. Merge `004-workers-cpu` into `main` (fast-forward) and push to both remotes. T9 (hourly view, optional) stays out unless the owner asks for it.
2. Then write spec 002 (export: Excel reports per site for clients) in `specs/002-.../`, starting from `specs/000-template/`.

## Known pending tasks
- **Deploy token `monitor-cbt-deploy`** (COBTEC account only, Workers Scripts Edit + D1 Edit, in Bitwarden) **expires 2026-11-30**: create a new one before the next deploy and use it as the `CLOUDFLARE_API_TOKEN` variable (loaded with `read -s`) in a normal terminal.
- boraei.com will get a CMS with D1: when its Worker runs code, add its script to `sites.json` (`boraei`), and review the `__unknown__` mapping to MOHAMED-BORAEI (P2 of spec 004), which holds only while `mohamed-boraei` is the only Worker with code in that account. Its CPU and D1 already show at account level without changes.
- Analytics token `monitor-cbt-analytics-readonly` valid 2026-10-29 to 2026-12-31 23:59 ECT (owner's common date for all tokens): renew from 2026-12-01 following `docs/SERVICES_AND_COSTS.md`. When creating tokens, the TTL start date must be today (one was created with start = end day).
- `cobtec.net` DNS stays at GoDaddy (decided 2026-10-29): the family's Outlook.com personalized addresses depend on it and cannot be re-added if lost. The monitor uses the workers.dev URL + Access, with a GoDaddy redirect from `monitor.cobtec.net`. Domain expires 2027-01-28: renew in time.
- Legal: put the verbal delegated-administration agreements with SOMA and BORAEI in writing; confirm LOPDP roles and legitimate interest for IPs with an advisor; check the clients' privacy policies (`docs/LEGAL.md`).
- Worker requests are estimates when Cloudflare samples them (exact only at interval 1); see P11 and `docs/DATA_MODEL.md`.
- Move to Node 24 LTS before April 2027.
- SOMA visits differ slightly from SOMA's own monitor (+1 on 2026-10-25, +2 on 2026-10-28; other days equal). Not explained yet: check whether that monitor filters by host ("Visitas de producción").
- Usage charts draw every account with no filter: fine with 3 accounts, a client filter is needed when clients grow (`docs/TECH_DEBT.md`).
- Design artifacts: prototype "CBT Monitoreo" https://claude.ai/artifact/R9vTbc1smDZGtDHLPL1QD9 (rules over the design system where they differ), design system https://claude.ai/artifact/Po6aoP9yPy4ArpRrFmxDSq .
- Future spec "Seal of Guarantee": anchor daily hashes of statistics, audit and client reports on a blockchain (Rust or Solidity). Data stays private in D1; only hashes go on-chain. It proves the data was not altered after sealing, not that it is correct. Compare OpenTimestamps, EAS, Solana, Soroban and ICP. **Verify ICP first**: canisters in Rust, reverse gas model with cycles; check whether cycles must be bought (cost per month for this load) or can be obtained free, and current developer credits, in official sources.
