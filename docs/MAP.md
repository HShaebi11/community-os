# Map

- What this is and why it exists: [`docs/PRODUCT.md`](PRODUCT.md)
- Product & build spec: [`docs/PRODUCT-SPEC.md`](PRODUCT-SPEC.md)
- Hackathon tracks / partners / data kit: [`docs/hackathon-london-2026.md`](hackathon-london-2026.md)

## Layout

- [`apps/api`](../apps/api) — Cloudflare Worker (Hono). HTTP API is the product (`/v1`).
- [`apps/web`](../apps/web) — Next.js + shadcn desk and public pages. API client only.
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

Local: API on `:5173`, Next.js on `:3000` (rewrites `/v1` to the API). Open the desk at `http://localhost:3000/desk`.

Slice 0 done check: `POST /v1/auth/dev` → `POST /v1/workspaces` → `POST /v1/workspaces/:id/imports` → `GET /v1/workspaces/:id/members`.

Slice 1 done check: `POST /v1/workspaces/:id/memory` → `GET /v1/members/:id` (citations) → `GET /v1/workspaces/:id/briefing` → `GET /v1/demands/:id`.

Slice 2 done check: `POST /v1/workspaces/:id/proposals` → `GET /v1/proposals/:id` (pack) → `POST /v1/proposals/:id/approve`.

Slice 3 done check: `POST /v1/proposals/:id/go-live` → `GET /v1/public/communities/:slug` + `GET /v1/public/events/:slug` → `POST /v1/public/events/:slug/rsvp` → `GET /v1/events/:id/guests`. Public JSON has no messages; opted-in `/v1/public/members/:slug` 200, others 404. Human pages: `/c/:slug`, `/e/:slug`, `/m/:slug` on the Next app.

Slice 4 done check: `/desk` is a lead client of `/v1` (sign-in → import → memory → search → proposal → guests). MCP tools `search_memory`, `get_member`, `list_demand`, `create_proposal`, `get_event`, `draft_message` hit the same routes. No `send_message`.
