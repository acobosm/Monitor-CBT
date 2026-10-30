# 001 — Usage and traffic tables
Status: approved (2026-10-29) · Branch: `001-usage-and-traffic-tables`

## Objective
Let the owner see, in plain tables at the Worker's `workers.dev` URL (reached through `monitor.cobtec.net`), the Free plan usage of the 3 Cloudflare
accounts and the traffic of the 3 sites whose zones are in Cloudflare (visits, countries, top IPs and suspicious IPs), with a daily
history stored in D1 and a warning about the analytics token's expiration.

## Scope
1. Guide to create the analytics token, and a discovery query that confirms which data the API
   offers for each zone.
2. Base Worker (Hono + React), Access JWT and `ALLOWED_EMAILS` validation, published at `workers.dev` with Access and preview URLs disabled.
3. `web/config/sites.json` (3 sites with a zone; COBTEC as an account only) and `web/config/limits.json` (Free limits with their check date).
4. Usage per account: Workers requests; D1 rows read, rows written, storage (account total and largest
   database) and number of databases; R2 Class A and
   Class B operations and storage. For each: % used against the limit, threshold warning and
   projected days until the limit is reached.
5. Traffic per site: requests, visits, page views, bytes, countries, top 20 IPs by traffic and top 20
   IPs by security events.
6. Remaining days of the token, with a warning.
7. Daily task into D1 (history starts on the first run), recovery of days that fail afterwards (up to 30 days back) and deletion of IPs older than 13 months.
8. Audit of data views in `monitor-cbt-audit-db`.
9. UI: home page with the module selector "Cloudflare - Consumo y Tráfico" and a dashboard made of
   tables, with the footer "Powered by CBT · © 2026".

## Out of Scope
- Excel and PDF export (spec 002).
- Charts and the CBT visual design (cards, themes) (spec 003).
- Client role, email alerts, automated backups to R2.
- Traffic of `cobtec.net`: its DNS stays at GoDaddy (family Outlook.com email); only the COBTEC account usage is shown.
- A Custom Domain for the Worker.
- The redirecting zone `mohamed-boraei.com` (it only redirects to `www.mohamedboraei.com`).
- Latency, DNS and certificate checks shown in the prototype.

## Requirements
<!-- UNIVERSAL: requisitos EARS, uno por línea, cada uno verificable con una prueba. Palabras clave en inglés y mayúsculas:
     El sistema SHALL … · WHEN <evento>, … SHALL … · WHILE <estado>, … SHALL … · IF <condición no deseada>, THEN … SHALL … · WHERE <característica>, … SHALL …
     Los textos que verá el usuario final van entre comillas, tal cual se mostrarán. -->

### Access and security
- R1. WHEN a request to `/api/*` arrives without a valid Access JWT (signature, audience and expiry), the system SHALL respond 403 with no data.
- R2. IF the email in the JWT is not in `ALLOWED_EMAILS`, THEN the system SHALL respond 403 and display "Tu correo no tiene acceso a este panel."
- R3. IF the Access configuration (team domain, AUD) or `ALLOWED_EMAILS` is missing, THEN the system SHALL deny all access (fail closed).
- R4. WHERE the local bypass flag is set, the system SHALL accept requests without a JWT only when they come from `localhost`, and SHALL ignore the flag for any other host.
- R5. The system SHALL never include the Cloudflare token in any response or UI file.
- R6. WHEN an authorized user requests data, the system SHALL record in `monitor-cbt-audit-db` the user's email, the date and time, and the screen or site requested.
- R7. IF the audit record cannot be written, THEN the system SHALL still return the requested data and SHALL log the error in the Worker logs. (P1)

### Analytics token
- R8. WHEN the dashboard opens, the system SHALL show the token's remaining days, read from `tokens/verify`, as "Token vence en N días".
- R9. WHILE the token has between 8 and 30 days left, the system SHALL show the notice in amber with the word "Por vencer".
- R10. WHILE the token has 7 days or fewer left, the system SHALL show the notice in red with "Renuévalo ya".
- R11. IF the token is missing, invalid or expired, THEN the system SHALL display "No pudimos leer los datos de Cloudflare: el token no es válido o venció." and SHALL keep showing the D1 history.
- R12. IF `tokens/verify` does not respond, THEN the system SHALL display "No pudimos verificar el token." without hiding the rest of the dashboard.
- R13. IF the token has no expiration date or expires more than 1 year from today, THEN the system SHALL display in red "El token no cumple la regla de caducidad (máximo 1 año)."

### Plan usage
- R14. The system SHALL show, per account, a table with product, metric, usage, limit, % used, period (daily, monthly or total) and state, including the D1 rows "Base más grande" (against the per-database limit) and "Cantidad de bases" (against the databases per account). (P8)
- R15. The system SHALL take limits and thresholds from `web/config/limits.json` and SHALL show below the table "Límites verificados el <fecha>".
- R16. WHILE a metric is at or above 70 % of its limit, the system SHALL show its state in amber as "Cerca del límite"; at or above 90 %, in red as "Límite crítico"; at or above 100 %, in red as "Límite superado". (P2; default thresholds, configurable in `limits.json`)
- R17. WHERE a metric is daily, the system SHALL show its peak of the last 7 days and the note "Se reinicia a las 19:00 ECT".
- R18. WHERE a metric is monthly or storage, the system SHALL show the projection "Al ritmo actual llegas al límite en N días" or, if the limit is not reached this month, "Sin riesgo este mes".
- R19. IF a metric has no limit in `limits.json`, THEN the system SHALL show "Límite no configurado" instead of the percentage.
- R20. The system SHALL classify R2 operations into Class A and Class B according to the official R2 pricing page; operations not listed there SHALL count as Class A and be listed under the table as "Operaciones de R2 sin clasificar (contadas como Clase A): …". (P7)

### Traffic per site
- R21. The system SHALL show, per site, a daily table of the last 30 days with requests, visits, page views and bytes.
- R22. The system SHALL label the current day's row "Hoy (parcial)".
- R23. The system SHALL show above the tables the note "Cada día va de 19:00 a 19:00 ECT."
- R24. The system SHALL show a countries table for the selected day, with requests and % of the total; the last complete day is selected by default and any day in the history can be chosen.
- R25. The system SHALL show the top 20 IPs by traffic for the selected day, with IP, country, requests and the last hour it was seen (ECT, e.g. "14:00–15:00"). (P5)
- R26. The system SHALL show the top 20 IPs by security events for the selected day, with IP, country, number of events, action ("Bloqueada" or "Desafiada") and the last hour it was seen (ECT). (P5)
- R27. IF Cloudflare does not offer a data item for that zone on the Free plan (per the discovery query), THEN the system SHALL display "Cloudflare no entrega este dato en el plan gratuito." instead of the table.

### Daily task and history
- R28. WHEN the daily task runs (01:00 UTC, 20:00 ECT; P3), the system SHALL fetch the previous UTC day for every account and zone and store it in `monitor-cbt-statistics-db`.
- R29. The system SHALL store only the top 20 IPs per site, per day and per kind (traffic, security).
- R30. IF a day is processed twice, THEN the system SHALL replace that day's rows without duplicating them.
- R31. WHEN the daily task runs, the system SHALL detect missing days within the last 30 days that come after the first stored day, and fill them in; days before the first stored day are not fetched. (P6, P9)
- R32. WHEN the daily task runs, the system SHALL delete IPs older than 13 months.
- R33. IF reading one account or zone fails, THEN the system SHALL continue with the others and log the error; that day stays missing for the backfill.
- R34. WHEN the dashboard opens, the system SHALL read the current day from the API without storing it, because it is partial.
- R35. IF the API does not respond when the dashboard opens, THEN the system SHALL display "No pudimos leer los datos recientes de Cloudflare. Se muestra el historial guardado hasta el <fecha>."
- R42. IF the API does not respond and no history is stored, THEN the system SHALL display "No pudimos leer los datos recientes de Cloudflare. Aún no hay historial guardado." (P10)

### UI and discovery
- R36. The system SHALL show on the home page a module selector with a single option, "Cloudflare - Consumo y Tráfico", which leads to the dashboard.
- R37. The system SHALL show in the dashboard a menu with "Consumo de planes" and one entry per site with a zone: SOMA, BORAEI, MOHAMED-BORAEI.
- R38. The system SHALL show on every page the footer "Powered by CBT · © 2026".
- R39. The system SHALL show numbers in `es-EC` format and times in ECT.
- R40. The system SHALL offer a "Salir" button that ends the Access session.
- R41. WHEN the daily task runs, the system SHALL query the `settings` node of every zone and account and store which data items are available and how far back, so R27 knows what to show. (P4)

## Definition of Done
<!-- UNIVERSAL -->
- Automated tests for every requirement that can be tested automatically (list: R1–R39, R41, R42; R40 is checked by hand in production).
- User testing locally for what touches the interface.
- Documentation affected by this spec updated.
- The token creation guide is written, and the owner created the new token `monitor-cbt-analytics-readonly` with it.
- The discovery results are recorded: what the Free plan offers for each zone and account, IPs included.
- First production deploy done, with Access on the `workers.dev` URL, preview URLs disabled and the `monitor.cobtec.net` redirect; the owner tested the real sign-in.
- The "Current usage" column of `docs/SERVICES_AND_COSTS.md` has real figures.

## Clarifications
<!-- UNIVERSAL: preguntas abiertas con opciones y una recomendación. Se anota la respuesta del usuario con la fecha y en qué requisito se aplicó. -->
- **P1.** If writing the audit record fails, what does the system do?
  A (recommended): return the data anyway and log the error. B: withhold the data until the audit works.
  **Answer:** A (2026-10-29). Applied in R7.
- **P2.** Usage warning thresholds?
  A (recommended): amber from 70 %, red from 90 %, "Límite superado" at 100 % (on Workers Free, 100 % means error 1027 for the client's site). B: amber from 80 %, red at 100 % (prototype).
  **Answer:** A (2026-10-29). Applied in R16.
- **P3.** At what time does the daily task run?
  A (recommended): 01:00 UTC (20:00 ECT), one hour of margin after the day closes. B: 00:15 UTC (19:15 ECT).
  **Answer:** A (2026-10-29). Applied in R28.
- **P4.** When is dataset discovery done?
  A (recommended): on every daily run, stored in D1. B: once, with a script run by the owner, stored in configuration.
  **Answer:** A (2026-10-29). Applied in R41; adds the `dataset_availability` table to `docs/DATA_MODEL.md`.
- **P5.** (From T3 discovery.) Grouped analytics give no exact last-request time per IP. What does "last seen" show?
  A (recommended): the last hour the IP was seen, with one extra grouped query per site; robust under attacks. B: exact time from raw firewall events; security only, and truncated above 10,000 events per day.
  **Answer:** A (2026-10-29). Applied in R25 and R26.
- **P6.** (From T3 discovery.) Zone datasets keep 31 days counted from the query time, so at 01:00 UTC the 31st day back is already partly gone. How many days does the backfill cover?
  A (recommended): 30 days, always complete. B: 31 days, the last one possibly incomplete.
  **Answer:** A (2026-10-29). Applied in R31 and scope item 7.
- **P7.** (From T7.) Real accounts report R2 operations the pricing page does not classify (e.g. `GetBucketNotificationConfiguration`, `GetBucketSippyConfiguration`). How are they counted?
  A (recommended): as Class A (lowest limit, so the warning is never late), listed under the table. B: as Class B (mostly reads). C: in no class, only listed.
  **Answer:** A (2026-10-29). Applied in R20.
- **P8.** (From T8.) D1 Free also limits each database to 500 MB and each account to 10 databases; SOMA already has 6 databases and the monitor adds 2 to COBTEC. Should the table show them?
  A (recommended): yes, rows "Base más grande" (500 MB, with its ID) and "Cantidad de bases" (10), with the same thresholds and projections. B: later.
  **Answer:** A (2026-10-29). Applied in scope item 4 and R14. The owner also asked for a daily chart per metric with the limit line: recorded for spec 003 (charts).
- **P9.** (From T9.) Cloudflare already keeps the last 31 days of traffic and 90 of usage when the monitor starts. Copying 30 days of traffic needs 2 queries per site and day (about 180), more than the 50 subrequests per run.
  A: an extra hourly cron that only copies the past (full month in about 12 hours). B: only the daily cron (over a week, some old days lost). C: do not copy the past; history starts on the first run and recovery only fills days that fail afterwards.
  **Answer:** C (2026-10-29). Applied in R31 and scope item 7. One cron only.
- **P10.** (From T10.) R35 names the date of the last stored day, but on the first day there is none, because the past is not copied (P9). What is displayed?
  A (recommended): "No pudimos leer los datos recientes de Cloudflare. Aún no hay historial guardado." B: only the first sentence.
  **Answer:** A (2026-10-30). Applied in R42.
