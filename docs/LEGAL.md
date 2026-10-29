# Legal and Ownership — monitor-cbt
<!-- UNIVERSAL: este documento recuerda los temas legales; no los resuelve. Las decisiones legales las toma el usuario con su asesor. -->

## Code ownership
- The code belongs to **COBTEC (CBT)**: proprietary, private, no open-source license.
- Written from scratch for this project, starting from the owner's SDD + EARS template. It does not
  copy code from the SOMA usage panel; it only reuses the idea.
- No assignment to clients: clients receive reports, not the software.
- Delegated administration of the SOMA and BORAEI Cloudflare accounts, and everything it entails,
  rests on a **verbal agreement** with each client (see open legal questions).

## Accounts to transfer
monitor-cbt is COBTEC's own internal tool and is not meant to be handed over. If COBTEC or the
service were sold, the transfer would include:
- The COBTEC Cloudflare account (Worker, D1 databases, Access, zone `cobtec.net`).
- The `cobtec.net` domain at GoDaddy.
- The GitHub and GitLab repositories.
- The analytics token is **not** transferred: it is revoked and the new owner creates their own.
- The client accounts (SOMA, BORAEI) do not belong to COBTEC: each client would have to delegate
  access to the new owner.

## Personal data
- Applicable law: Ecuador's Organic Law on Personal Data Protection (LOPDP, 2021).
- Likely roles (to be confirmed by the legal advisor): each client is the **controller** of its site
  visitors' data; COBTEC is the **processor**, handling it on the client's behalf while administering
  its Cloudflare account.
- Legal basis for storing visitor IPs: legitimate interest in security (detecting and blocking attacks).
  Visitors cannot be asked for consent: they never interact with monitor-cbt.
- App users (today only the owner): their email is processed for access and audit.
- Transfers: a client's data goes only to that client. Excel and PDF reports sent to a client include
  that client's top 20 visitor IPs, with a note that they are personal data. Data is never sold or
  given to third parties. Cloudflare already processes it as each client's provider.
- In a sale of COBTEC: IPs and the audit log are handed over only if the law and the client agreements
  allow it; otherwise they are deleted.

## Third-party licenses
<!-- Licenses are confirmed against each package's package.json when installed. -->
| Component | License | Commercial use | Notes |
|---|---|---|---|
| React, Vite, Hono, Vitest | MIT | Yes | |
| wrangler, `@cloudflare/vitest-pool-workers` | MIT / Apache-2.0 | Yes | |
| IBM Plex Sans, IBM Plex Mono | OFL-1.1 | Yes | Bundled with the app. |
| CBT logo | Own | Yes | From the CBT design system. |
| Excel and PDF libraries | To be chosen | To be checked | Chosen in the export spec. |

## Open legal questions
<!-- Consultas pendientes con el asesor legal y su estado. -->
1. Put the verbal delegated-administration agreement with SOMA and BORAEI in writing (a confirmation email from each client may be enough). Status: pending.
2. Confirm with a legal advisor the roles (controller / processor) and legitimate interest as the legal basis for storing visitor IPs under the LOPDP. Status: pending.
3. Check whether the clients' site privacy policies mention security monitoring. Status: pending.
4. If the ® symbol is wanted for CBT, register the trademark with SENADI. Status: optional.
