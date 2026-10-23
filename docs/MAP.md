# Map

- What this is and why it exists: [`docs/PRODUCT.md`](PRODUCT.md)
- Product & build spec: [`docs/PRODUCT-SPEC.md`](PRODUCT-SPEC.md)
- Hackathon tracks / partners / data kit: [`docs/hackathon-london-2026.md`](hackathon-london-2026.md)

## Layout

- [`apps/api`](../apps/api) — Cloudflare Worker (Hono). HTTP API is the product. Also serves desk + public HTML clients.
- [`apps/web`](../apps/web) — HTML/JS desk and public pages (API clients only).
- [`apps/mcp`](../apps/mcp) — MCP adapter over the same `/v1` routes. No `send_message`.
- [`packages/core`](../packages/core) — import, memory, proposals, RSVP, gatekeeper, autopilot.
- [`packages/whatsapp-import`](../packages/whatsapp-import) — zip/txt parser.
- [`packages/db`](../packages/db) — Drizzle schema on Neon project `community-os` in **The Interfaces Company** (`community_os` schema). Better Auth tables live here too.

## Run

```sh
npm install
npm run db:push
npm run validate
npm run dev
```

Auth: Better Auth (`/api/auth/*`) plus `POST /v1/auth/dev` for local curl. Data: Neon + Drizzle when `DATABASE_URL` is set; otherwise in-memory.

Slice 0 done check: `POST /v1/auth/dev` → `POST /v1/workspaces` → `POST /v1/workspaces/:id/imports` → `GET /v1/workspaces/:id/members`.

Slice 1 done check: `POST /v1/workspaces/:id/memory` → `GET /v1/members/:id` (citations) → `GET /v1/workspaces/:id/briefing` → `GET /v1/demands/:id`.

Slice 2 done check: `POST /v1/workspaces/:id/proposals` → `GET /v1/proposals/:id` (pack) → `POST /v1/proposals/:id/approve`.
