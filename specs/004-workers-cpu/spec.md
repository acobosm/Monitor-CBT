# 004 — Workers CPU per request
Status: approved (2026-11-24) · Branch: `004-workers-cpu`

## Objective
Show, per site, the CPU time per request of its Workers and the requests Cloudflare cuts for exceeding resources, so the owner can decide with real Cloudflare data whether a site can stay on Workers Free. First use: compare the version of mohamedboraei.com that builds the page on every visit with the one that caches it.

## Scope
- Daily task: store per day, account and script the requests, errors, requests cut (`exceededResources`), CPU p50/p99/p999 and wall time p50/p99, in milliseconds. The read goes inside the existing per-account query, with no new subrequests.
- `web/config/sites.json`: each site lists the scripts whose CPU belongs to it. Staging scripts and `__unknown__` not assigned to a site are shown only at account level.
- "Consumo de planes": a card "Workers · CPU por petición (ms)" with p50 and p99 and a dashed reference line at 10 ms, and a card "Workers · Peticiones cortadas por límite de recursos" with the daily count.
- Each site's page: columns CPU p50, CPU p99 and Cortadas in the "Tráfico diario" table. Only "Cortadas" is highlighted, when it is above 0.
- Recovery of missing days up to 29 days back, as for Worker requests (P11 of spec 001).
- Optional, last task: the current day per hour on each site's page, read live and not stored.

## Out of Scope
- Email or push alerts.
- Changing the limits, thresholds or charts of other metrics.
- Moving any site to Workers Paid or changing anything in client accounts (monitor-cbt only reads analytics).
- Per-request traces or logs (Workers Observability).

## GraphQL source (discovery of 2026-11-24, last 7 days, 3 accounts)
- Dataset `workersInvocationsAdaptive`: enabled on Free in the 3 accounts, 90 days of history, at most 32 days per query.
- Fields confirmed by real reads: `sum { requests errors }`, `quantiles { cpuTimeP50 cpuTimeP99 cpuTimeP999 wallTimeP50 wallTimeP99 }` (microseconds), `avg { sampleInterval }`, `dimensions { scriptName status datetimeHour }`.
- `status` values seen: `success`, `clientDisconnected`, `exceededResources`.
- Scripts seen: COBTEC `monitor-cbt`, `chores-app-staging`; SOMA `soma-web`, `soma-web-staging`; BORAEI `mohamed-boraei`, `__unknown__` (1,205 requests, 103 of them `exceededResources`). `boraei-com-website` serves static assets only: asset requests run no code and do not appear in the dataset.
- CPU p99 over the week was 29 to 273 ms in every script, with no request cut except those of `__unknown__`: Cloudflare tolerates single requests above 10 ms on Free, so the p99 alone does not show danger (P1).

## Requirements
### Collection and storage
- R1. WHEN the daily task processes a day of an account, the system SHALL read from `workersInvocationsAdaptive`, per script, the requests, errors, CPU p50, p99 and p999, and wall time p50 and p99.
- R2. WHEN the daily task processes a day of an account, the system SHALL read per script the requests whose `status` is `exceededResources`.
- R3. The system SHALL read these figures inside the existing per-account query, one part per day, with no new subrequests.
- R4. The system SHALL store CPU and wall times in milliseconds, dividing the microseconds returned by Cloudflare by 1,000 and keeping the decimals.
- R5. The system SHALL store one row per day, account and script, including staging scripts and `__unknown__`.
- R6. WHEN the daily task recovers missing days, the system SHALL recover these figures up to 29 days back, like Worker requests.
- R7. IF the read fails, THEN the system SHALL log the error only through `describeError`, never with the token or the raw response.

### Scripts of each site
- R8. `web/config/sites.json` SHALL list the scripts of each site: SOMA `soma-web`; BORAEI none; MOHAMED-BORAEI `mohamed-boraei` and `__unknown__` (P2).
- R9. A site's page SHALL never show figures of scripts not listed for that site.

### "Consumo de planes"
- R10. The system SHALL show, for each account, a card "Workers · CPU por petición (ms)" with one line for p50 and one for p99 per script of that account, and a dashed line at 10 ms labeled "Límite por petición (Free)" (P4).
- R11. The system SHALL show, for each account, a card "Workers · Peticiones cortadas por límite de recursos" with the daily count of requests cut per script of that account (P4).
- R12. The system SHALL label the script `__unknown__` as "Sin script".
- R13. An (i) next to the CPU card title SHALL say "La mitad de las peticiones usa menos CPU que p50 y el 99 % menos que p99. Cloudflare tolera peticiones sueltas sobre 10 ms; la señal de peligro son las peticiones cortadas."

### Each site's page
- R14. The system SHALL add the columns "CPU p50 (ms)", "CPU p99 (ms)" and "Cortadas" to the "Tráfico diario" table.
- R15. WHERE a site has more than one script, the system SHALL show the highest p50 and the highest p99 among its scripts, and the sum of their requests cut.
- R16. IF "Cortadas" is above 0, THEN the system SHALL highlight that cell with the word "Cortadas" and the figure, never by color alone (P1).
- R17. The system SHALL show CPU p50 and p99 without highlight at any value (P1).
- R18. WHERE a site lists `__unknown__`, an (i) next to "Cortadas" SHALL say "Incluye peticiones que Cloudflare cortó sin asignarles script."
- R19. WHERE a site lists no scripts, the system SHALL show "Sin código en Workers (solo archivos estáticos)" instead of the three columns.
- R20. The system SHALL show milliseconds in `es-EC` format with one decimal.
- R21. IF a day has no CPU figure, THEN the system SHALL show "Sin dato", never a 0 that looks real.

### Optional: per hour
- R22. WHERE the hourly view is built, the system SHALL show on each site's page the CPU p50, p99 and requests cut per hour of the current day, read live from Cloudflare and not stored.

## Definition of Done
- Automated tests for every requirement that can be tested automatically (list: R1–R22), with dummy GraphQL fixtures: quantile parser, µs to ms conversion, sum of `exceededResources`, script-to-site mapping and the "Cortadas" highlight.
- User testing locally for what touches the interface.
- Documentation affected by this spec updated (`docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`).
- Deploy only with the owner's authorization: first the migration, then `npm run deploy` (`docs/DEVELOPMENT.md`).

## Clarifications
- **P1.** The p99 is above 10 ms in every script without requests cut. How is the danger highlighted?
  A (recommended): p99 without colors, the 10 ms line only as a reference, and "Cortadas" above 0 triggers the highlight. B: warning at 8 ms and limit at 10 ms on the p99, as first asked (today everything would be red). C: thresholds configurable in `limits.json`.
  **Answer:** A (2026-11-24). Applied in R10, R16 and R17.
- **P2.** The 103 requests cut in the BORAEI account have no script (`__unknown__`). Whose are they?
  The account has only `mohamed-boraei` and `boraei-com-website`, and the latter serves static assets only (checked by the owner in the Cloudflare panel on 2026-11-24). A (recommended): assign `__unknown__` to MOHAMED-BORAEI with an (i). B: show it only at account level as "Sin script".
  **Answer:** A (2026-11-24). Applied in R8 and R18. Valid while `mohamed-boraei` is the only Worker with code in that account: if another one is added, review this mapping.
- **P3.** Staging scripts (`soma-web-staging`, `chores-app-staging`): where are they shown?
  A (recommended): only at account level in "Consumo de planes". B: on the site's page too.
  **Answer:** A (2026-11-24). Applied in R8 and R9.
- **P4.** One CPU chart with every script would have about 10 lines. How is it drawn?
  A (recommended): one CPU chart and one "cortadas" chart per account (COBTEC, SOMA, BORAEI), each with its scripts. B: a single chart with all scripts. C: a single chart with only the scripts assigned to sites.
  **Answer:** A (2026-11-24). Applied in R10 and R11.
