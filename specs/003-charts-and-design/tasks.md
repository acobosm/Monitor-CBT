# Tasks — 003 Charts and CBT design
Spec: `spec.md` · Plan: `plan.md`
Status: `[ ]` pending · `[~]` in progress · `[x]` done (green tests) · `[✓]` user-tested and committed (with commit id).
<!-- UNIVERSAL: tareas chicas, que se terminan, prueban y commitean en una sesión corta. Cada una indica los requisitos que cubre. Al terminar una tarea se agrega debajo una nota "Done <fecha>: …" con lo verificado y lo que cambió respecto al plan. -->

- [x] **T1. Visual base.** Tokens, logos, themes and side menu. (R1–R7)
  Done 2026-10-31: typecheck and tests green; owner checked logo, menu, circuit background, themes, tables and notices locally. The day selector only had one stored day (30 Oct), so changing day is covered by tests but not yet seen by the owner. The owner's first attempt failed because of a stale local dev server, not this code.
- [ ] **T2. Landing.** Dark landing with the node network and the module selector. (R8–R11)
- [ ] **T3. Daily data.** Measure visits over a 29-day range; API with daily series, reading missing days from Cloudflare. (R35)
- [ ] **T4. General panel.** `/panel`, summary and site cards. (R12–R16)
- [ ] **T5. Usage cards.** Bars per account and the (i) messages. (R17–R25)
- [ ] **T6. Charts.** Visits per site and usage with the limit line. (R26–R34)
- [ ] **T7. Phone.** Narrow screens. (R36–R41)
- [ ] **T8. Production.** Deploy with the owner's authorization and final check. (Definition of Done)

## Closing
- [ ] **T9. Documentation.** Update the documents affected by this spec. (Definition of Done)
