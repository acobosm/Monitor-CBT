# Tasks — 001 Usage and traffic tables
Spec: `spec.md` · Plan: `plan.md`
Status: `[ ]` pending · `[~]` in progress · `[x]` done (green tests) · `[✓]` user-tested and committed (with commit id).
<!-- UNIVERSAL: tareas chicas, que se terminan, prueban y commitean en una sesión corta. Cada una indica los requisitos que cubre. Al terminar una tarea se agrega debajo una nota "Done <fecha>: …" con lo verificado y lo que cambió respecto al plan. -->

- [ ] **T1. Analytics token.** Write the token guide in `docs/SERVICES_AND_COSTS.md`; the owner creates `monitor-cbt-analytics-readonly` and stores it in Bitwarden and `web/.dev.vars`. (Definition of Done)
- [ ] **T2. Skeleton.** `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `wrangler.jsonc`, `.dev.vars.example`, minimal Worker that responds. (—)
- [ ] **T3. Discovery.** `settings` query plus one real test read per zone and account; record what the Free plan offers (IPs included) and adjust `docs/DATA_MODEL.md`. (R27, R41 partly)
- [ ] **T4. Day and token logic.** Pure modules `src/logic/days.ts`, `src/logic/token.ts` with tests. (R8–R10, R13, R30–R32)
- [ ] **T5. Access and audit.** `src/access.ts`, `src/db/audit.ts`, `migrations/audit/0001_init.sql`. (R1–R4, R6, R7)
- [ ] **T6. Statistics database.** `migrations/statistics/0001_init.sql`, `src/db/statistics.ts` with replace-on-conflict writes. (R29, R30)
- [ ] **T7. Plan usage.** `src/cloudflare/graphql.ts`, account queries, `src/logic/usage.ts` (%, thresholds, projection, R2 Class A/B), `config/limits.json`. (R14–R20)
- [ ] **T8. Traffic.** Zone queries, `src/logic/traffic.ts` (countries, top traffic IPs, top security IPs), `config/sites.json`. (R21–R26)
- [ ] **T9. Daily task.** `src/cron.ts`: batched queries (50-subrequest limit), backfill, IP purge, daily discovery. (R28, R31–R33, R41)
- [ ] **T10. API.** `src/routes/api.ts`, `src/cloudflare/token.ts`: routes, input validation, token, error notices, cached current day. (R5, R11, R12, R34, R35)
- [ ] **T11. Table UI.** Home, menu, usage, sites, token notice, "Salir", footer, bundled fonts; user tests locally. (R36–R40 and the display part of the rest)
- [ ] **T12. Production.** Requires `cobtec.net` DNS in Cloudflare. Configure Access (check one-time PIN on Free, 24 h session), create remote D1 databases, secrets, remote migrations, deploy; all with user authorization; owner tests the sign-in. (R40, Definition of Done)

## Closing
- [ ] **T13. Documentation.** Update the documents affected by this spec, including real usage figures. (Definition of Done)
