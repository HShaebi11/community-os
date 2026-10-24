# Map

- What this is and why it exists: [`docs/PRODUCT.md`](PRODUCT.md)
- Product & build spec: [`docs/PRODUCT-SPEC.md`](PRODUCT-SPEC.md)
- **`/v1` API reference (curl-able):** [`docs/API.md`](API.md)
- **Phase A (build this, nothing else):** [`docs/PHASE-A.md`](PHASE-A.md) — Linear: [Start here](https://linear.app/interfaces-co/document/start-here-f280990e049f)
- Hackathon tracks / partners / data kit: [`docs/hackathon-london-2026.md`](hackathon-london-2026.md) (context only; not the build)

## Layout

- [`apps/api`](../apps/api) — Cloudflare Worker (Hono). HTTP API is the product (`/v1`). Better Auth at `/api/auth/*`.
- [`apps/app`](../apps/app) — the product: marketing site, auth, onboarding, `/w/[slug]` desk, account. Next 16 on `:3002`.
- [`apps/web`](../apps/web) — legacy Next.js desk and public pages (`:3000`, dev-auth bearer). API client only.
- [`apps/mcp`](../apps/mcp) — MCP adapter over the same `/v1` routes. No `send_message`.
- [`packages/core`](../packages/core) — import, memory, proposals, RSVP, gatekeeper, autopilot.
- [`packages/whatsapp-import`](../packages/whatsapp-import) — zip/txt parser.
- [`packages/db`](../packages/db) — Drizzle schema on Neon project `community-os` in **The Interfaces Company** (`community_os` schema). Better Auth tables live here too.

## Run

```sh
npm install
npm run db:push
npm run backfill -w @community-os/db   # workspaces → Better Auth orgs/members, idempotent
npm run validate
npm run dev:app
```

Auth: Better Auth cookies (`/api/auth/*` — password, magic link, Google), `cos_` API tokens (`/v1/tokens`) for agents/curl, and `POST /v1/auth/dev` when `ALLOW_DEV_AUTH=true`. Workspaces are Better Auth organizations — the `member` table is the source of truth for membership; `workspace_leads` is legacy. Dev email (magic links, invites, resets) lands in `GET /v1/dev/outbox` unless `RESEND_API_KEY` is set. Data: Neon + Drizzle when `DATABASE_URL` is set; otherwise in-memory.

Local: API on `:5173`, app on `:3002` (rewrites `/v1` + `/api/auth` to the API). Product routes: `/`, `/sign-in`, `/sign-up`, `/onboarding`, `/desk` (resolver), `/w/[slug]/**`, `/account`, `/invite/[id]`; public pages `/c`, `/e`, `/m`. `npm run dev` still brings up `apps/web` on `:3000` (`/desk` there uses dev auth).

Slice 0 done check: `POST /v1/auth/dev` → `POST /v1/workspaces` → `POST /v1/workspaces/:id/imports` → `GET /v1/workspaces/:id/members`.

Slice 1 done check: `POST /v1/workspaces/:id/memory` → `GET /v1/members/:id` (citations) → `GET /v1/workspaces/:id/briefing` → `GET /v1/demands/:id`.

Slice 2 done check: `POST /v1/workspaces/:id/proposals` → `GET /v1/proposals/:id` (pack) → `POST /v1/proposals/:id/approve`.

Slice 3 done check: `POST /v1/proposals/:id/go-live` → `GET /v1/public/communities/:slug` + `GET /v1/public/events/:slug` → `POST /v1/public/events/:slug/rsvp` → `GET /v1/events/:id/guests`. Public JSON has no messages; opted-in `/v1/public/members/:slug` 200, others 404. Human pages: `/c/:slug`, `/e/:slug`, `/m/:slug` on the Next app.

Slice 4 done check: `/desk` is a lead client of `/v1` (sign-in → import → memory → search → proposal → guests). MCP tools `search_memory`, `get_member`, `list_demand`, `create_proposal`, `get_event`, `draft_message` hit the same routes. No `send_message`.

Slice 5 done check: sign up at `:3002/sign-up` → onboarding → `/w/[slug]` briefing → team invite accepted by a second account → `cos_` token from Settings → Agent access works as bearer on `:5173/v1/workspaces`.
