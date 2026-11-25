# Tasks — 004 Workers CPU per request
Spec: `spec.md` · Plan: `plan.md`
Status: `[ ]` pending · `[~]` in progress · `[x]` done (green tests) · `[✓]` user-tested and committed (with commit id).
<!-- UNIVERSAL: tareas chicas, que se terminan, prueban y commitean en una sesión corta. Cada una indica los requisitos que cubre. Al terminar una tarea se agrega debajo una nota "Done <fecha>: …" con lo verificado y lo que cambió respecto al plan. -->

- [x] **T1. Storage.** Migration `0002_workers_cpu.sql`; `saveCpuDays`, `storedCpuDays` and `readCpu` in `web/src/db/statistics.ts`. (R5)
  Done 2026-11-25: typecheck and 295 tests green (6 new in `test/statistics.test.ts`, on the local Miniflare D1). The tests cover one row per script with `__unknown__` and empty quantiles, decimals kept, replacing a day, other accounts and days untouched, a processed day without invocations read as empty and a never-processed one as absent (R21), processed days per account (R6), and refusal of negative values. Change from the plan: the tables also check that times are not negative and that `sample_interval` is at least 1.
- [ ] **T2. Query and parser.** `c<day>` and `x<day>` parts in `accountUsageQuery`; parser in `web/src/logic/cpu.ts` with µs → ms and the `exceededResources` count. (R1–R4, R7)
- [ ] **T3. Daily task.** CPU days per account (missing ones of the last 29, plus yesterday) and their write. (R3, R6)
- [ ] **T4. Scripts per site.** `scripts` in `sites.json`; per-site figures (highest p50/p99, sum of cut) and the "Sin script" label. (R8, R9, R12, R15)
- [ ] **T5. API.** CPU per account in `/api/usage` and per day in the site API, today live. (R9, R21)
- [ ] **T6. "Consumo de planes".** Two cards per account, 10 ms line, (i) and the fourth series color. (R10–R13)
- [ ] **T7. Site page.** Three columns in "Tráfico diario", "Cortadas" highlight, (i) for `__unknown__`, BORAEI notice, `es-EC` format. (R14, R16–R21)
- [ ] **T8. Production.** Migration and deploy with the owner's authorization, and final check. (Definition of Done)
- [ ] **T9 (optional). Per hour.** CPU and cut requests per hour of the current day on each site's page, live. (R22)

## Closing
- [ ] **T10. Documentation.** `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`, `MEMORY.md`. (Definition of Done)
