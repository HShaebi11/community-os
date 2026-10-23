# Community OS

The operating system for a community: import the chat, remember the people, publish a native event page, own the RSVP.

MIT. The product is the HTTP API. The desk, public pages, and MCP are clients.

## Quick start

```sh
npm install
npm run validate
npm run dev
```

Then:

```sh
TOKEN=$(curl -s http://localhost:5173/v1/auth/dev -H 'content-type: application/json' \
  -d '{"email":"lead@example.com"}' | jq -r .token)
WS=$(curl -s http://localhost:5173/v1/workspaces -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Weird Stuff"}' | jq -r .id)
curl -s http://localhost:5173/v1/workspaces/$WS/imports?filename=_chat.txt \
  -H "authorization: Bearer $TOKEN" --data-binary @fixtures/whatsapp-sample/_chat.txt
curl -s http://localhost:5173/v1/workspaces/$WS/members -H "authorization: Bearer $TOKEN"
```

Open `http://localhost:3000/desk` for the lead UI (Next.js + shadcn). After go-live, `/c/{slug}` and `/e/{slug}` on the same origin are the public face. The API stays on `:5173`; Next rewrites `/v1` to it.

## Stack

Cloudflare Workers + Hono for the API. Next.js + shadcn for the desk and public pages. **Neon** (Lakebase Postgres) + **Drizzle** + **Better Auth**.

Database: [community-os](https://console.neon.tech/app/projects/delicate-mud-18770479) in **The Interfaces Company** (`aws-eu-west-2`). Schema: `community_os`.

Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` with `DATABASE_URL` (pooled Neon URL) and `BETTER_AUTH_SECRET`. Then `npm run db:push`. Never commit `.dev.vars`.

Without those vars, the API still runs on an in-memory store for local tests.

## MCP

```sh
COMMUNITY_OS_API_URL=http://localhost:5173 \
COMMUNITY_OS_TOKEN=... \
COMMUNITY_OS_WORKSPACE_ID=... \
npm start -w @community-os/mcp
```

Tools: `search_memory`, `get_member`, `list_demand`, `create_proposal`, `get_event`, `draft_message`. There is no send-to-chat tool.
