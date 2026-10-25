# Changelog

## Unreleased — open core

First fully open-source build. Community OS is now self-hostable end to end
with no accounts and no hosted-service dependency.

- Removed all authentication: Better Auth, `cos_` API tokens, dev auth,
  sessions, org/invite/team surfaces. One deployment = one trusted operator.
- The `/v1` API is fully open; `/v1/public/*` remains the opted-in public
  surface.
- MCP works with no tokens: stdio, remote (`/mcp`), and Code Mode (`/mcp/code`).
- Added webhooks: per-workspace outbound event subscriptions
  (`POST /v1/workspaces/:id/webhooks`) delivering signed payloads for
  `import`, `memory`, `proposal`, `published`, and `rsvp` events.
- Added `@community-os/sdk`: typed TypeScript client for `/v1`, and
  `docs/openapi.yaml` for codegen in other languages.
- Self-host without Cloudflare: `apps/api` also runs as a plain Node server
  (`npm run start:node -w api`); `docker compose up` brings up
  Postgres + API + app.
- Deleted `apps/web` (legacy duplicate desk) and `supabase/` (stale
  migrations). Both remain in git history.
- Docs: rewritten README with self-hosting guide, `docs/API.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `ROADMAP.md`.

*History note: the account/team/token implementation this release removed is
in git history and intentionally recoverable — a hosted edition is a layer on
top of this core, not a rewrite.*
