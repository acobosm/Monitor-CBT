# Workflow — SDD (spec-anchored)
<!-- UNIVERSAL: este archivo es igual en todos los proyectos. No se llena; se respeta. -->
Specs are kept alive: they guide the code and are updated before it whenever something changes.

## Structure
- `AGENTS.md`: project essentials and rules. Read at the start.
- `MEMORY.md`: current status and next step. Rewritten when closing each session.
- `docs/constitution.md`: non-negotiable principles. `docs/`: full system documentation.
- `specs/NNN-name/`: one directory per feature, with `spec.md`, `plan.md`, and `tasks.md` (template in `specs/000-template/`).

## Feature Lifecycle
1. **Spec** (`spec.md`): objective, scope, out of scope, and requirements in EARS format, each with an id (R1, R2…).
2. **Clarification**: at the end of `spec.md`, "Clarifications" section with open questions (P1, P2…), their options, and a recommendation. User response and date are recorded.
3. **Plan** (`plan.md`): files to create or change, design, data and migrations, risks, and how it will be tested.
4. **Tasks** (`tasks.md`): small tasks (T1, T2…), each with the requirements it covers and its status.
5. **Implementation**: one task at a time. Each ends with green typecheck and tests, and user testing locally if it touches the UI.
6. **Validation**: each requirement has at least one automated test verifying it.
7. **Maintenance**: a subsequent change updates the spec first (new or modified requirement), then plan and tasks, and then code.

## EARS Requirements (templates)
Keywords are always written in English and uppercase.

| Type | Template |
|---|---|
| Always | The system SHALL … |
| Event | WHEN <event>, the system SHALL … |
| State | WHILE <state>, the system SHALL … |
| Unwanted | IF <unwanted condition>, THEN the system SHALL … |
| Optional | WHERE <feature>, the system SHALL … |

One sentence = one verifiable behavior.
Example: IF an admin attempts to assign the super-admin role, THEN the system SHALL reject the change and display "Solo un super-admin puede crear, cambiar o quitar super-admins."

## Task States (`tasks.md`)
`[ ]` pending · `[~]` in progress · `[x]` done (green tests) · `[✓]` user-tested and committed (with commit id).

## Session Start
1. `git pull` and verify timezone (`date +%z` = `-0500`).
2. Read `AGENTS.md`, `MEMORY.md`, and active spec.
3. Continue from the first unfinished task in `tasks.md`.

## Session Close
1. Update `tasks.md`, `MEMORY.md`, and affected documents.
2. Translate documents left in Spanish into English. Write Spanish drafts without double readings: an ambiguity becomes a translation error, and then a code error.
3. Provide the user with the suggested commit (message in English).
4. If a CLI login was used during the session (e.g. `wrangler login` for Cloudflare), remind the user to log out (`npx wrangler logout`) and verify that no session remains (`npx wrangler whoami`). If an API token was used, confirm it was not saved in the terminal or in repo files.

## Inter-agent Work (Claude ↔ Gemini ↔ others)
- All required context lives in the repo: no agent depends on its private memory.
- If quota runs out mid-session, the next agent starts from `tasks.md` and `MEMORY.md`. A document in Spanish is the most recent draft.
- Work from one agent is reviewed by another before committing.
- Before proposing or reviewing a tool's configuration (permissions, config files, CLI flags), check the installed version (e.g. `<tool> --version`) and consult the documentation for that exact version; do not rely on memory or on docs for another version.
