# Community OS

The operating system for a community: import the chat, remember the people, publish a native event page, own the RSVP.

MIT. The product is the HTTP API. The app, public pages, and MCP are clients.

## Quick start

```sh
npm install
npm run validate
npm run dev:app   # API on :5173 + product app on :3002
```

Sign up at `http://localhost:3002/sign-up`, then onboarding walks you through community → chat import → memory → co-lead invites. The desk lives at `/w/{slug}`; `/c/{slug}`, `/e/{slug}` and `/m/{slug}` are the public face. The API stays on `:5173`; Next rewrites `/v1` and `/api/auth` to it.

## Auth

Three ways to authenticate against `/v1`:

1. **Cookie session** — Better Auth (`/api/auth/*`): email+password, magic link, and Google when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set. Used by the app; non-GET cookie requests are CSRF-checked against `APP_ORIGINS`.
2. **`cos_` API tokens** — mint in Settings → Agent access (or `POST /v1/tokens`). `Authorization: Bearer cos_…` works on every `/v1` route for curl, MCP and agents. Shown once, revocable, can't mint or revoke other tokens.
3. **Dev auth** — `POST /v1/auth/dev {email}` returns a session bearer token. Only when `ALLOW_DEV_AUTH=true` (or when there is no database). Intended for local curl and legacy clients like `apps/web`.

In local dev, magic links, invites and reset links are logged and listed in the dev outbox (`GET /v1/dev/outbox`, dev auth only). With `RESEND_API_KEY` they're emailed for real.

## Setup

Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and fill in:

- `DATABASE_URL` — pooled Neon URL (required for anything persistent)
- `BETTER_AUTH_SECRET` — session signing secret
- `BETTER_AUTH_URL` — app origin, e.g. `http://localhost:3002`
- `APP_ORIGINS` — comma-separated allowed origins, e.g. `http://localhost:3002,http://localhost:3000`
- `ALLOW_DEV_AUTH` — `true` for local curl / `apps/web` compatibility
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional, enables Google sign-in
- `RESEND_API_KEY` / `EMAIL_FROM` — optional, real email delivery

Then:

```sh
npm run db:push              # push schema (Better Auth org tables, api_tokens, …)
npm run backfill -w @community-os/db   # existing workspaces → organizations + members (idempotent)
```

Without `DATABASE_URL`, the API runs on an in-memory store for local tests.

## Stack

Cloudflare Workers + Hono for the API. Next.js 16 + shadcn for the app and public pages. **Neon** Postgres + **Drizzle** + **Better Auth** (workspaces are organizations).

Database: [community-os](https://console.neon.tech/app/projects/delicate-mud-18770479) in **The Interfaces Company** (`aws-eu-west-2`). Schema: `community_os`.

## MCP

```sh
COMMUNITY_OS_API_URL=http://localhost:5173 \
COMMUNITY_OS_TOKEN=cos_... \
COMMUNITY_OS_WORKSPACE_ID=... \
npm start -w @community-os/mcp
```

Tools: `search_memory`, `get_member`, `list_demand`, `create_proposal`, `get_event`, `draft_message`. There is no send-to-chat tool.

## Curl quick start

```sh
TOKEN=$(curl -s http://localhost:5173/v1/auth/dev -H 'content-type: application/json' \
  -d '{"email":"lead@example.com"}' | jq -r .token)
WS=$(curl -s http://localhost:5173/v1/workspaces -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Weird Stuff"}' | jq -r .id)
curl -s http://localhost:5173/v1/workspaces/$WS/imports?filename=_chat.txt \
  -H "authorization: Bearer $TOKEN" --data-binary @fixtures/whatsapp-sample/_chat.txt
curl -s http://localhost:5173/v1/workspaces/$WS/members -H "authorization: Bearer $TOKEN"
```
