# Community OS

[![CI](https://github.com/HShaebi11/community-os/actions/workflows/ci.yml/badge.svg)](https://github.com/HShaebi11/community-os/actions/workflows/ci.yml)

The operating system for a community: import the chat, remember the people,
publish a native event page, own the RSVP.

MIT. Fully open source — no accounts, no login, no hosted-service dependency.
The product is the HTTP API; the app, public pages, and MCP are clients of it.

## What it does

Your community keeps living in WhatsApp/Discord. Community OS is the brain
behind it and the front door the world sees:

- **Import** a WhatsApp export (`.txt` or `.zip` with media) or ingest Discord
  messages — append-only, deduplicated evidence.
- **Memory** — every member gets a card (what they do, want, offer) where each
  field cites the message it came from. Demand is extracted ("people want an
  AI workshop").
- **Proposals** — turn a demand into a pack: matched speakers, a fitting
  venue, a cited explanation. Approve → draft outreach → go live.
- **Events & RSVP** — native public event pages with QR codes; guests stay in
  the same system as members.
- **MCP** — Cursor/agents use the same API via six tools
  (`search_memory`, `get_member`, `list_demand`, `create_proposal`,
  `get_event`, `draft_message`). Deliberately no `send_message` — the system
  drafts, a human sends.
- **Integrations** — a typed SDK (`@community-os/sdk`), an OpenAPI spec
  (`docs/openapi.yaml`) for codegen in any language, and **webhooks**:
  per-workspace subscriptions that POST signed events (`import`, `memory`,
  `proposal`, `published`, `rsvp`, `application`) to any URL.

## Quick start (local, no database)

```sh
npm install
npm run validate        # tests + typecheck across all packages
npm run dev:app         # API on :5173 + product app on :3002
```

Open `http://localhost:3002` — onboarding walks you through creating a
community → importing a chat export → building memory. The desk lives at
`/w/{slug}`; `/c/{slug}`, `/e/{slug}` and `/m/{slug}` are the public face.
Without `DATABASE_URL` the API runs on an in-memory store — everything works,
nothing persists between restarts. Try it with the bundled fixture
[`fixtures/whatsapp-sample/_chat.txt`](fixtures/whatsapp-sample/_chat.txt).

## Self-hosting

Community OS is two deployables plus a Postgres database:

| Piece | What | Where it runs |
| --- | --- | --- |
| `apps/api` | Hono API serving `/v1` + `/mcp` | Cloudflare Worker (`npm run dev -w api`, `cf deploy`) **or** plain Node (`npm run start:node -w api`) — same app, two transports |
| `apps/app` | Next.js 16 app — desk, onboarding, public pages, marketing | `npm run dev -w @community-os/app`, or any Next host (Vercel, `next build && next start`, Docker) |
| Postgres | Drizzle schema `community_os` | Neon, Supabase, RDS, a local `postgres` container — anything Postgres |

### 1. Database (optional but recommended)

Provision any Postgres and set `DATABASE_URL` (a pooled connection string;
`DATABASE_URL_UNPOOLED` is used for migrations if provided). Then:

```sh
cp apps/api/.dev.vars.example apps/api/.dev.vars   # fill in DATABASE_URL
npm run db:push                                    # creates the schema
```

That's the only env var. See
[`apps/api/.dev.vars.example`](apps/api/.dev.vars.example).

**Upgrading an existing database:** the SQL migrations in
[`packages/db/drizzle`](packages/db/drizzle) reconcile pre-constraint
duplicates (public slugs, normalized member names, guest emails) before
creating the unique indexes — the earliest claimant keeps the name, and
duplicates keep their rows under deterministic suffixes. `db:push` runs
`drizzle-kit push`, which applies DDL only and skips those data fixes; if a
push fails creating a unique index, run the `UPDATE`/`DELETE` statements at
the top of the newest `drizzle/*.sql` files by hand, then push again.

### 2. API

Two transports, same Hono app:

```sh
npm run dev -w api          # Cloudflare Worker locally: http://localhost:5173
npm run start:node -w api   # plain Node server (any VPS/container): PORT=5173 HOST=0.0.0.0
```

For Cloudflare production, deploy `apps/api` as a Worker with `DATABASE_URL`
as a secret (see `apps/api/cloudflare.config.ts`); Code Mode (`/mcp/code`)
requires the Workers loader and is Worker-only. For a VPS, `start:node` works
with any Postgres via `DATABASE_URL`.

**Important:** the API is unauthenticated by design — anyone who can reach it
can operate it. Keep it on a private network/VPN, or put an access layer in
front of it (Cloudflare Access, an mTLS tunnel, a reverse proxy with auth).
Public event/community pages only ever expose opted-in data, but the operator
routes return raw evidence.

### 3. App

```sh
npm run dev -w @community-os/app    # http://localhost:3002
```

The app proxies `/v1` and `/mcp` to the API via `apps/app/next.config.ts` —
set `API_PROXY_TARGET` (default `http://localhost:5173`) for a remote API,
then `next build && next start` or deploy to any Next.js host.

### Docker compose — everything in one command

```sh
docker compose up --build          # postgres + api(:5173) + app(:3002)

# push the schema once (from the host, repo checked out):
DATABASE_URL=postgres://cos:cos@localhost:5432/community_os npm run db:push
```

Or the minimal local recipe (in-memory API, throwaway Postgres):

```sh
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16
DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres npm run db:push
# then npm run dev:app
```

## MCP

The same six tools, three ways to reach them — all calls hit `/v1`, never a
second API. There is no send-to-chat tool.

**Remote (Streamable HTTP)** — the API Worker serves MCP at `/mcp`. No auth
needed:

```json
{
  "mcpServers": {
    "community-os": {
      "url": "http://localhost:5173/mcp?workspace=<workspaceId>"
    }
  }
}
```

**Code Mode** — `/mcp/code` wraps the tools in Cloudflare Code Mode: one
`code` tool runs model-written JavaScript in a Dynamic Worker sandbox as
`await codemode.search_memory(...)` etc. The sandbox cannot fetch outside the
workspace functions.

**Local (stdio)** — same tools over stdio:

```sh
COMMUNITY_OS_API_URL=http://localhost:5173 \
COMMUNITY_OS_WORKSPACE_ID=<workspaceId> \
npm start -w @community-os/mcp
```

## Curl quick start

Full route reference: [`docs/API.md`](docs/API.md). Machine-readable:
[`docs/openapi.yaml`](docs/openapi.yaml).

```sh
WS=$(curl -s -X POST http://localhost:5173/v1/workspaces \
  -H 'content-type: application/json' -d '{"name":"Weird Stuff"}' | jq -r .id)
curl -s "http://localhost:5173/v1/workspaces/$WS/imports?filename=_chat.txt" \
  --data-binary @fixtures/whatsapp-sample/_chat.txt
curl -s http://localhost:5173/v1/workspaces/$WS/members
```

Or in TypeScript — `@community-os/sdk` is a real package (`npm i`): remote
client for a deployed API, or the whole kernel embedded in-process:

```ts
import { CommunityOS } from "@community-os/sdk";

const cos = new CommunityOS({ baseUrl: "http://localhost:5173" }); // remote
// const cos = CommunityOS.memory();                             // embedded — no server needed

const ws = await cos.createWorkspace({ name: "Weird Stuff" });
await cos.importChat(ws.id, chatTranscript, "_chat.txt");
const { members } = await cos.refreshMemory(ws.id);
```

## Stack

Cloudflare Workers + Hono API · Next.js 16 + shadcn-style UI · Postgres +
Drizzle · MCP SDK + Code Mode · Vitest.

## Architecture: open core, hosted layer

This repo is the **open core** — deliberately no auth. A future hosted
edition is a thin layer on top that re-adds accounts at the edge (middleware +
store seam), never inside the kernel. `packages/core` knows nothing about
users; `createdBy` on a workspace is just a string. The shape is preserved so
a hosted fork can plug in: API surface → optional auth middleware → kernel.

## Docs

- [`docs/API.md`](docs/API.md) — every `/v1` route, curl-able
- [`docs/MAP.md`](docs/MAP.md) — repo map
- [`docs/PRODUCT.md`](docs/PRODUCT.md) — what this is and why it exists
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to work on it

## License

MIT.
