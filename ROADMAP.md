# Roadmap

The open core is feature-complete for the kernel loop: import → cited memory →
demand → proposal → live event → RSVP → guests, with MCP and webhooks on top.
What follows is directional, not promised — issues and PRs are the real
roadmap.

## Integration surface (community-facing)

- **More ingest adapters** — `packages/whatsapp-import` is the reference
  implementation; the seam is `importWhatsApp`/`ingestDiscord` in
  `packages/core`. Slack, Telegram and Matrix export parsers are great first
  contributions.
- **SDK in more languages** — `@community-os/sdk` is TypeScript; the OpenAPI
  spec in `docs/openapi.yaml` exists so the community can codegen others.
- **Export → import** — the export route archives a workspace out; a route
  (or CLI command) that loads an archive back in is the migration story.

## Product depth

- Event editing (`PATCH` on events — `startsAt` exists but is unsettable),
  RSVP cancellation, application decision routes.
- Reading autopilot artifacts back; richer gatekeeper review.
- Public `.ics`/RSS feeds on community pages.

## Self-hosting

- Production Docker images and a helm-style reference deployment.
- Object-storage adapter for imported media (file records are `memory://`
  today — media bytes aren't persisted outside the zip).

## Deliberately not in the open core

- Accounts, roles, API tokens, multi-tenancy — that's a hosted layer on top
  of this code, not part of it (see README: "open core, hosted layer").
- Posting back to chat. Drafts only, always.
