# Constitution — monitor-cbt
Non-negotiable principles. Every spec, plan, and code change must respect them. If a task conflicts with one, it stops and the user is consulted.

<!-- Las secciones marcadas UNIVERSAL son iguales en todos los proyectos: no modificar sin que el usuario lo pida. Las marcadas PROYECTO se llenan con la entrevista. -->

## 1. Data protection
<!-- UNIVERSAL -->
- Only the data a screen needs is sent to the browser or client.
- No real personal data in the repo, tests, logs, or public links. Test data is dummy data.
<!-- PROYECTO -->
- Usage metrics of Cloudflare resources (requests, rows, storage): low sensitivity.
- Traffic per site (visits, countries): commercially confidential for each client.
- Visitor IP addresses with country and last-seen time: personal data. Kept for security visibility
  (detecting and blocking attackers); only the top N per site per day, deleted after 13 months.
- Most sensitive asset: the Cloudflare analytics token (it reads analytics of three accounts),
  followed by the stored IP list.
- Audit: Cloudflare Access records who signed in and when, but keeps those logs only 24 hours on
  the Free plan, so the durable record is the app's own: it records in D1 every data view
  (who, when, which site or screen) and every export (who, when, which site, which format).
  The audit log does not need to be tamper-proof (single user today, the app never modifies
  analytics data). It has no automatic deletion for now; its retention is reviewed as usage grows,
  against the D1 storage limits in `docs/SERVICES_AND_COSTS.md`.

## 2. Security by default
<!-- UNIVERSAL -->
- When in doubt, close: if configuration is missing or verification fails, access is denied (fail closed).
- Permissions are verified on the server on every route; hiding a button is not security.
- Everything that comes from the browser or client is untrusted and validated on the server.
- Secrets only in the platform's secret store or in local files ignored by git; never in the repo.
<!-- PROYECTO -->
- Identity: Cloudflare Access with email one-time PIN, protecting the whole hostname from the root.
  Only emails listed in the Access policy can sign in; there is no public page.
- The Worker validates the Access JWT (signature and audience) on every `/api/*` request and takes
  the email from it; without a valid JWT it denies access (fail closed).
- The only entry point is the Worker's `workers.dev` URL, protected by Access; preview URLs are disabled
  and there are no other routes or domains: no entry point bypasses Access.
- Second barrier: the Worker keeps its own allowlist of emails with their role, in configuration.
  An email not in that list is rejected even if the Access policy let it in.
- Roles: one role today, **owner** (sees all sites, exports, sees the audit log). A future **client**
  role would see only its own site; it is out of scope until its own spec.

## 3. User decides
<!-- UNIVERSAL -->
- No file is created, modified, or deleted without approval. No remote action (deploy, migrations, secrets, DNS) without authorization.
- Git commands that write history or remotes are executed by the user.
- Texts chosen by the user for the interface are respected as-is.

## 4. Safe and verifiable changes
<!-- UNIVERSAL -->
- Every requirement (EARS) has its automated test. Nothing is considered complete without green typecheck and tests.
- Staging before production, when the project has staging. `main` = production; published via merge `--no-ff`.
- Database migrations already applied are never edited: any structure change is a new migration.
<!-- PROYECTO -->
- No staging environment: changes go from local to production. A deploy happens only after green
  typecheck and tests, and user testing locally.
- Plan limits kept in configuration change only after checking the provider's official pricing page;
  the check date is recorded next to each limit.
- GraphQL queries are covered by tests with fixtures copied from real responses (with dummy data).
  If Cloudflare changes a dataset or a field, the fixture and the query are updated in the same change.

## 5. Simplicity
<!-- UNIVERSAL -->
- New code resembles existing code (names, style, comment density).
- No new dependencies without justification.
- Respect the limits of the plans in use. Current figures and consumption are in `docs/SERVICES_AND_COSTS.md`; any change nearing a limit must be noted in its spec.

## 6. Language
<!-- UNIVERSAL -->
- The project language is English: code, file and directory names, commits, and documentation.
- Only exception in documents: during a session they may be drafted in Spanish as a temporary draft. Upon closing, they are translated to English in the same file and Spanish disappears from the repo.
- Conversation with the user is in Spanish.
<!-- PROYECTO -->
- The UI is in Spanish (Ecuador), addressing the user as "tú", short sentences, no exclamation marks or emojis.
- Local formats: decimal comma (`1.234,5`) and dates in `es-EC`. All dates and times are shown in
  Ecuador mainland time: time zone `America/Guayaquil`, UTC−05:00, no daylight saving time,
  labeled `ECT` (e.g. `17:45 ECT`).
- A statistics "day" is Cloudflare's UTC day for everything (traffic, countries, IPs and plan usage),
  so it matches Cloudflare's daily limit reset: it runs from 19:00 ECT to 19:00 ECT. The UI states it.
- Exports (Excel, PDF) use the same language, formats and time zone.

## 7. Transferable project
<!-- UNIVERSAL -->
- "Done" includes updated documentation: the project must be operable and maintainable without depending on any specific person or agent.

## 8. Project-specific principles
<!-- PROYECTO -->
- Read-only towards Cloudflare: monitor-cbt never modifies anything in any account (no DNS, Workers,
  D1 or R2 of clients). Its only writes go to its own D1 database.
- Within the Free plan: the project must work on free plans. If a change would require a paid plan,
  work stops and the user is consulted.
- States readable without color: every warning (usage, token) is shown with a word or icon in
  addition to color.
