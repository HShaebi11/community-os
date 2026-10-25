# Map

- What this is and why it exists: [`docs/PRODUCT.md`](PRODUCT.md)
- Product & build spec: [`docs/PRODUCT-SPEC.md`](PRODUCT-SPEC.md)
- **`/v1` API reference (curl-able):** [`docs/API.md`](API.md)
- **Phase A (build this, nothing else):** [`docs/PHASE-A.md`](PHASE-A.md)
- **Hosted edition recipe:** [`docs/HOSTED.md`](HOSTED.md) — how a paid product layers on top of this open core
- Hackathon tracks / partners / data kit: [`docs/hackathon-london-2026.md`](hackathon-london-2026.md) (context only; not the build)

## Layout

- [`apps/api`](../apps/api) — Cloudflare Worker (Hono). The HTTP API is the product (`/v1`). No auth — open core, single-operator deployment.
- [`apps/app`](../apps/app) — the product: marketing site, onboarding, `/w/[slug]` desk, settings, public pages. Next 16 on `:3002`.
- [`apps/mcp`](../apps/mcp) — MCP adapter over the same `/v1` routes. No `send_message`.
- [`packages/core`](../packages/core) — import, memory, proposals, RSVP, gatekeeper, autopilot.
- [`packages/whatsapp-import`](../packages/whatsapp-import) — zip/txt parser.
- [`packages/db`](../packages/db) — Drizzle schema for Postgres (Neon works well), `community_os` schema.
- [`packages/sdk`](../packages/sdk) — typed TypeScript client (`@community-os/sdk`) + webhook signature verification.
- [`docs/openapi.yaml`](../docs/openapi.yaml) — OpenAPI 3.1 spec for client codegen.

## Run

```sh
npm install
npm run db:push        # only needed with DATABASE_URL / persistent storage
npm run validate
npm run dev:app        # API on :5173 + app on :3002
```

Auth: none. Every `/v1` route is open — the model is one trusted operator per
deployment. Data: Postgres + Drizzle when `DATABASE_URL` is set; otherwise
in-memory.

Local: API on `:5173`, app on `:3002` (rewrites `/v1` + `/mcp` to the API).
Product routes: `/`, `/onboarding`, `/desk` (picker/resolver), `/w/[slug]/**`;
public pages `/c`, `/e`, `/m`.

Slice 0 done check: `POST /v1/workspaces` → `POST /v1/workspaces/:id/imports` → `GET /v1/workspaces/:id/members`.

Slice 1 done check: `POST /v1/workspaces/:id/memory` → `GET /v1/members/:id` (citations) → `GET /v1/workspaces/:id/briefing` → `GET /v1/demands/:id`.

Slice 2 done check: `POST /v1/workspaces/:id/proposals` → `GET /v1/proposals/:id` (pack) → `POST /v1/proposals/:id/approve`.

Slice 3 done check: `POST /v1/proposals/:id/go-live` → `GET /v1/public/communities/:slug` + `GET /v1/public/events/:slug` → `POST /v1/public/events/:slug/rsvp` → `GET /v1/events/:id/guests`. Public JSON has no messages; opted-in `/v1/public/members/:slug` 200, others 404. Human pages: `/c/:slug`, `/e/:slug`, `/m/:slug` on the Next app.

Slice 4 done check: `/desk` is a client of `/v1` (import → memory → search → proposal → guests). MCP tools `search_memory`, `get_member`, `list_demand`, `create_proposal`, `get_event`, `draft_message` hit the same routes. No `send_message`.

Slice 5 done check: open `:3002` → onboarding → `/w/[slug]` briefing → settings → point an MCP client at `/mcp?workspace=<id>` — no tokens anywhere.
