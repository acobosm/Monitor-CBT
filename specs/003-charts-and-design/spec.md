# 003 — Charts and CBT design
Status: approved (2026-10-31) · Branch: `003-charts-and-design`

## Objective
Give the dashboard the final CBT look, with the animated landing of the "CBT Monitoreo" prototype, and add charts so the owner can see usage and visits over time without reading tables.

## Scope
Delivered in phases, each tested by the owner locally:
1. Visual base: CBT logo, colors and type from the CBT design system, light and dark themes, side menu, cards and restyled tables.
2. Landing and home: dark landing with the logo, the prototype's animated node network and the module selector; general panel summarizing all sites.
3. Plan usage: cards with a usage bar per account, in addition to the current table, and the (i) explaining "Peticiones de Worker" versus "Peticiones al sitio".
4. Charts: daily visits per site, and one daily chart per usage metric with a line at the limit.
5. Phone: every screen adapts to phone width; a wide table keeps its own sideways scroll.

## Out of Scope
- The prototype's email and PIN screens: Cloudflare Access handles the sign-in before this app loads.
- Latency, DNS and certificate checks.
- Export buttons and files (spec 002).
- The prototype's sample clients and figures: only real data is shown.
- Google Fonts: IBM Plex stays bundled with the app.

## Requirements
<!-- UNIVERSAL: requisitos EARS, uno por línea, cada uno verificable con una prueba. Palabras clave en inglés y mayúsculas:
     El sistema SHALL … · WHEN <evento>, … SHALL … · WHILE <estado>, … SHALL … · IF <condición no deseada>, THEN … SHALL … · WHERE <característica>, … SHALL …
     Los textos que verá el usuario final van entre comillas, tal cual se mostrarán. -->
### Phase 1: visual base
- R1. The system SHALL show the CBT logo in the side menu, in its regular version on the light theme and its inverse version on the dark theme.
- R2. The system SHALL use the colors, spacing and radii of the CBT design system on every screen.
- R3. The system SHALL use IBM Plex Sans for the interface and IBM Plex Mono for figures, IPs and table values, with the fonts bundled in the app.
- R4. WHEN the app opens with no theme remembered in that browser, the system SHALL use the device's theme (light or dark).
- R5. WHEN the user presses "Cambiar tema", the system SHALL switch the theme and remember it in that browser.
- R6. The system SHALL show a side menu with "Consumo de planes", one link per site and "Salir", marking the current page.
- R7. The system SHALL keep showing the same data, texts and notices as spec 001, including the token notice and the footer "Powered by CBT · © 2026".

### Phase 2: landing and general panel
Access protects the whole hostname, so the landing appears after the sign-in, not before it as in the prototype.
- R8. The system SHALL show a dark landing with the logo, the title "Consumo de tus planes y visitas de tus clientes, en un solo panel" and the text "Mira cuánto usas de cada plan gratuito, cuántas visitas recibe cada cliente y desde qué países llegan."
- R9. The system SHALL show on the landing the animated node network of the prototype. (P1)
- R10. WHILE the device asks for reduced motion, the system SHALL show the node network still.
- R11. The system SHALL show on the landing the module selector with the option "Cloudflare - Consumo y Tráfico", which leads to the general panel.
- R12. The system SHALL add "Panel general" to the side menu.
- R13. The system SHALL show at the top of the general panel a summary with yesterday's visits of all sites, labeled "Visitas ayer", the number of sites, labeled "Sitios", and how many have resources near the limit, labeled "Con recursos cerca del límite". "Yesterday" is the last complete day (19:00 to 19:00 ECT).
- R14. The system SHALL show one card per site with its name, domain, yesterday's visits, the comparison with its daily average, the 30-day total, a small chart and the button "Ver detalle".
- R15. IF the account of a site has a metric at "Cerca del límite" or worse, THEN the system SHALL show that word on the site's card; sites sharing an account show it on each card.
- R16. IF a figure of a site is missing, THEN the system SHALL show "Sin dato" in it, never a 0 that looks real.

### Phase 3: plan usage
- R17. The system SHALL show above "Consumo de planes" tables one card per account (COBTEC, SOMA and BORAEI), with one usage bar per metric that has a limit.
- R18. Each bar SHALL show the metric's name, usage, limit and percentage.
- R19. Each bar SHALL show its state in words ("Normal", "Cerca del límite", "Límite crítico", "Límite superado"), never by color alone.
- R20. IF usage exceeds the limit, THEN the system SHALL show the bar full at 100 % and keep the real percentage visible in the text.
- R21. IF a metric's figure is missing, THEN the system SHALL show "Sin dato" and an empty bar.
- R22. The system SHALL keep showing below the cards the full table of each account, with all its columns.
- R23. The system SHALL show an (i) icon next to "Peticiones de Worker" and next to "Peticiones al sitio"; its message SHALL open on mouse hover, keyboard focus or touch.
- R24. The (i) of "Peticiones de Worker" SHALL say "Veces que se ejecutó el Worker. Es la cifra que cuenta para el límite de <límite> al día.", taking the limit from `web/config/limits.json`.
- R25. The (i) of "Peticiones al sitio" SHALL say "Todas las peticiones de visitantes al sitio. No cuenta para el límite de Workers."

### Phase 4: charts
- R26. The system SHALL show on each site's page a line chart with the daily visits of the last 30 days.
- R27. The system SHALL mark the current day as "Hoy (parcial)" in the chart.
- R28. The system SHALL show in "Consumo de planes" one chart per metric that has a limit, with a dashed line labeled "Límite".
- R29. Daily metrics (Worker requests, D1 rows read and written) SHALL show each day's value.
- R30. Monthly metrics (R2 operations) SHALL show the month's running total, because their limit is monthly.
- R31. Storage metrics and the number of databases SHALL show each day's value.
- R32. WHEN the user hovers over or touches a point, the system SHALL show the day and its figure in `es-EC` format.
- R33. IF a day has no figure, THEN the system SHALL show a gap in the line, never a 0.
- R34. IF a chart has no data at all, THEN the system SHALL display "Aún no hay datos para esta gráfica."
- R35. WHEN a chart needs a day not stored in D1, the system SHALL read it from Cloudflare, up to 29 days back, without storing it. (P2)

### Phase 5: phone
- R36. WHILE the screen is at most 860 px wide, the system SHALL move the side menu to the top, with the logo and links in rows.
- R37. WHILE the screen is narrow, the system SHALL show cards and charts in a single column.
- R38. The system SHALL never scroll the page sideways, even at 360 px wide.
- R39. A wide table SHALL keep its own sideways scroll inside its frame, so every column stays reachable.
- R40. WHILE the screen is narrow, the landing SHALL show the logo, text and module selector complete in a single column, with the animation still active.
- R41. Links and buttons SHALL be at least 44 px tall on touch screens.

## Definition of Done
<!-- UNIVERSAL -->
- Automated tests for every requirement that can be tested automatically (list: R1–R41). Tests render to text and have no real layout or motion, so for R2, R3, R9 and R36–R41 they check the styles and markup, and the owner checks the real look in the browser.
- User testing locally for what touches the interface.
- Documentation affected by this spec updated.

## Clarifications
<!-- UNIVERSAL: preguntas abiertas con opciones y una recomendación. Se anota la respuesta del usuario con la fecha y en qué requisito se aplicó. -->
- **P1.** The CBT design system says "no animation except a 150 ms color change on hover", while the "CBT Monitoreo" prototype has an animated node network on its landing. Which one rules?
  A: a still drawing, following the design system. B: the animation of the prototype.
  **Answer:** B (2026-10-31). The prototype's dynamic design rules for this app; the owner approved the 5 phases with animation.
- **P2.** D1 only holds days since 2026-10-30. Where do charts get the days not stored yet?
  A (recommended): complete them from Cloudflare, up to 29 days back, without storing them; charts are full from the start, with more queries, and older days may be approximate. B: D1 only; simpler, but charts take a month to fill.
  **Answer:** A (2026-10-31). Applied in R35.
