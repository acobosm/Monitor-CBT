# MEMORY.md — Project Status
_Last updated: 2026-11-04_

<!-- UNIVERSAL: este archivo es una foto del estado actual, no una bitácora. Se reescribe al cerrar cada sesión y se mantiene corto (unas 30 líneas). La historia vive en git y en las specs. -->

## Where we are
- Remotes: `ghp` = https://github.com/acobosm/Monitor-CBT.git, `glp` = https://gitlab.com/acobosm1/cbt-development/monitor-cbt.git (private).
- Specs 001 and 003 complete. Spec 003 (charts and CBT design) deployed with the code of `1888fad` and checked by the owner in production, also on a real phone (2026-11-04). Production: https://monitor-cbt.acobos.workers.dev behind Access, reached through `monitor.cobtec.net`.
- Branch `003-charts-and-design` not merged into `main` yet (`main` is at `a7da12c`, end of spec 001).

## Next step
1. Merge `003-charts-and-design` into `main` (the owner runs the git commands).
2. Write spec 002 (export: Excel reports per site for clients) in `specs/002-.../`, starting from `specs/000-template/`.

## Known pending tasks
- Deploy token `monitor-cbt-deploy` (COBTEC account only, Workers Scripts Edit + D1 Edit, in Bitwarden) expires 2026-11-30: the owner was to check in the Cloudflare panel whether it is still active and delete it if not needed; recreate one for later deploys and use it as the `CLOUDFLARE_API_TOKEN` variable (loaded with `read -s`) in a normal terminal.
- Analytics token `monitor-cbt-analytics-readonly` valid 2026-10-29 to 2026-12-31 23:59 ECT (owner's common date for all tokens): renew from 2026-12-01 following `docs/SERVICES_AND_COSTS.md`. When creating tokens, the TTL start date must be today (one was created with start = end day).
- `cobtec.net` DNS stays at GoDaddy (decided 2026-10-29): the family's Outlook.com personalized addresses depend on it and cannot be re-added if lost. The monitor uses the workers.dev URL + Access, with a GoDaddy redirect from `monitor.cobtec.net`. Domain expires 2027-01-28: renew in time.
- Legal: put the verbal delegated-administration agreements with SOMA and BORAEI in writing; confirm LOPDP roles and legitimate interest for IPs with an advisor; check the clients' privacy policies (`docs/LEGAL.md`).
- Worker requests are estimates when Cloudflare samples them (exact only at interval 1); see P11 and `docs/DATA_MODEL.md`.
- Move to Node 24 LTS before April 2027.
- SOMA visits differ slightly from SOMA's own monitor (+1 on 2026-10-25, +2 on 2026-10-28; other days equal). Not explained yet: check whether that monitor filters by host ("Visitas de producción").
- Usage charts draw every account with no filter: fine with 3 accounts, a client filter is needed when clients grow (`docs/TECH_DEBT.md`).
- Design artifacts: prototype "CBT Monitoreo" https://claude.ai/artifact/R9vTbc1smDZGtDHLPL1QD9 (rules over the design system where they differ), design system https://claude.ai/artifact/Po6aoP9yPy4ArpRrFmxDSq .
- Future spec "Seal of Guarantee": anchor daily hashes of statistics, audit and client reports on a blockchain (Rust or Solidity). Data stays private in D1; only hashes go on-chain. It proves the data was not altered after sealing, not that it is correct. Compare OpenTimestamps, EAS, Solana, Soroban and ICP. **Verify ICP first**: canisters in Rust, reverse gas model with cycles; check whether cycles must be bought (cost per month for this load) or can be obtained free, and current developer credits, in official sources.
