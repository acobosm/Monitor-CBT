# MEMORY.md — Project Status
_Last updated: 2026-10-29_

<!-- UNIVERSAL: este archivo es una foto del estado actual, no una bitácora. Se reescribe al cerrar cada sesión y se mantiene corto (unas 30 líneas). La historia vive en git y en las specs. -->

## Where we are
- Working branch: `001-usage-and-traffic-tables` (git not initialized yet). `main` = production.
- Project phase: documentation prepared from the SDD + EARS template; no code yet.
- Last confirmed commit: none yet.
- Active spec: `specs/001-usage-and-traffic-tables/` (spec approved 2026-10-29; plan and tasks approved).

## Next step
1. The owner initializes git, creates the private GitHub and GitLab repositories, and makes the first
   commit of the documentation (the agent gives the exact commands).
2. Task T1: the agent writes the token guide; the owner creates `monitor-cbt-analytics-readonly`
   and stores it in Bitwarden and `web/.dev.vars`.

## Known pending tasks
- Move `cobtec.net` DNS from GoDaddy to Cloudflare (copy the Outlook MX and email TXT/CNAME records as DNS only). Required before T12.
- Verify that Access one-time PIN is included in the Zero Trust Free plan (before T12).
- Legal: put the verbal delegated-administration agreements with SOMA and BORAEI in writing; confirm LOPDP roles and legitimate interest for IPs with an advisor; check the clients' privacy policies (`docs/LEGAL.md`).
- Move to Node 24 LTS before April 2027.
- Design: the CBT design system and the "CBT Monitoreo" prototype are a visual reference for spec 003; the landing animation conflicts with the design system's "no animation" rule.
