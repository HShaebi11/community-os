# Security

## Threat model, briefly

The open core has **no authentication by design** — one trusted operator per
deployment. Every `/v1` route is open to anyone who can reach the API. This is
intentional, not an oversight: self-hosted installs are expected to sit on a
trusted machine or behind an access layer (VPN, Cloudflare Access, an
authenticating reverse proxy).

The four `/v1/public/*` routes are the internet-facing surface. They must only
ever expose published events and opted-in member data — never message bodies,
guest emails, member `want`/notes, or identifiers of non-opted-in members.
**A leak of non-public data through a public route is a security bug; please
report it.**

Chat exports contain real people's words and often phone numbers. Treat
databases, exports (`GET /v1/workspaces/:id/export`), and webhook payloads as
sensitive at rest and in transit.

## Reporting

Please do not open a public issue for vulnerabilities. Report privately via
**GitHub Security Advisories** on this repository (the "Report a
vulnerability" button on the Security tab). Include reproduction steps and the
affected route. We aim to acknowledge within a few days.

Out of scope for the open core: absence of authentication itself (by design),
self-XSS, and issues that only affect a hosted third-party deployment.
