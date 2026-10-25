# `/v1` API reference

Every route that exists on the Community OS worker, what it takes, and what it
returns. Source of truth: [`apps/api/src/app.ts`](../apps/api/src/app.ts).
If this doc and the worker disagree, the worker is right — file it.

This is a reference for technical users and agents. It documents what is
**deployed**, not what is planned. Missing pieces are listed under
[What does not exist](#what-does-not-exist) — do not assume an endpoint exists
because it "should".

## Running it

```sh
npm install
npm run dev -w api          # http://localhost:5173
```

The worker needs no env vars to start: without `DATABASE_URL` it runs on an
in-memory store — fine for trying the loop below, nothing persists. With
`DATABASE_URL` (any Postgres; Neon pooled works) it uses the Drizzle store.
See [`apps/api/.dev.vars.example`](../apps/api/.dev.vars.example) and the
[README](../README.md).

```sh
curl -s http://localhost:5173/v1/health
# {"ok":true,"product":"community-os"}
```

## Conventions

- **No authentication.** Every route on this deployment is open to anyone who
  can reach it. There are no accounts, tokens, sessions, or roles — the model
  is one trusted operator per deployment. Run the API on a machine or network
  you trust; put an access layer in front of it if you expose it further.
- JSON in, JSON out. Errors are `{ "error": "<message>" }` with status
  `404` (missing), or `400` for domain errors thrown by the kernel
  (`"approve the proposal before going live"`, `"name and email required"`, …).
- `?filename=` on imports and `?q=` on search are the only query params.
  There is **no pagination, filtering, or sorting** on any list route.
- `X-Public-Origin` request header overrides the origin used when the API
  builds absolute URLs (QR codes, outreach/promo links). Falls back to
  `Origin`, then the request origin. Set it when the API sits behind a proxy
  or is called by an agent that knows the public hostname.
- CORS reflects the request `Origin`, allows methods
  `GET, POST, PATCH, DELETE, OPTIONS` and headers
  `Content-Type, Authorization, X-Public-Origin`.

## The kernel loop

The product spine: import a chat → build cited memory → propose from demand →
go live → public RSVP → guest list. Runs verbatim against a local API
(`jq` required). Fixture: [`fixtures/whatsapp-sample/_chat.txt`](../fixtures/whatsapp-sample/_chat.txt).

```sh
BASE=http://localhost:5173

# 1. Create a workspace
WS=$(curl -s -X POST $BASE/v1/workspaces -H 'content-type: application/json' \
  -d '{"name":"Weird Stuff"}' | jq -r .id)

# 2. Import a WhatsApp export (.txt transcript or .zip with media)
curl -s "$BASE/v1/workspaces/$WS/imports?filename=_chat.txt" \
  --data-binary @fixtures/whatsapp-sample/_chat.txt \
  | jq '{inserted, skipped, members: (.members | length)}'

# 3. Refresh memory — fills member do/want/offer, citations, demands, resources
curl -s -X POST $BASE/v1/workspaces/$WS/memory \
  | jq '{members: (.members|length), demands: (.demands|length), resources: (.resources|length)}'

# 4. Read a cited member card
MEMBER=$(curl -s $BASE/v1/workspaces/$WS/members \
  | jq -r '[.[] | select(.do or .want or .offer)][0].id')
curl -s $BASE/v1/members/$MEMBER | jq '{displayName, do, offer, citations}'

# 5. Pick a demand, open it (title + one-liner + citations)
DEMAND=$(curl -s $BASE/v1/workspaces/$WS/demands | jq -r '.[0].id')
curl -s $BASE/v1/demands/$DEMAND | jq '{topic, title, oneLiner, citations}'

# 6. Optional: register a venue so the proposal can match one
curl -s -X POST $BASE/v1/workspaces/$WS/venues -H 'content-type: application/json' \
  -d '{"name":"Expedite HQ","area":"Hammersmith","capacity":80}'

# 7. Demand → proposal pack (speakers, venue, explanation, citations)
PROPOSAL=$(curl -s -X POST $BASE/v1/workspaces/$WS/proposals \
  -H 'content-type: application/json' -d "{\"demandId\":\"$DEMAND\"}" | jq -r .id)
curl -s $BASE/v1/proposals/$PROPOSAL | jq '{status, explanation, speakers: [.speakers[].displayName], venue}'

# 8. Approve → draft outreach → go live (creates the public event)
curl -s -X POST $BASE/v1/proposals/$PROPOSAL/approve  | jq .status      # "approved"
curl -s -X POST $BASE/v1/proposals/$PROPOSAL/outreach | jq .outreachDraft
EVENT=$(curl -s -X POST $BASE/v1/proposals/$PROPOSAL/go-live)
SLUG=$(jq -r .slug <<<"$EVENT"); EVENT_ID=$(jq -r .id <<<"$EVENT")

# 9. Public side — the front door the world sees
curl -s $BASE/v1/public/events/$SLUG | jq '{title, venue, speakers, startsAt}'
curl -s -X POST $BASE/v1/public/events/$SLUG/rsvp -H 'content-type: application/json' \
  -d '{"name":"Guest","email":"guest@example.com"}' | jq .email

# 10. Back inside: the guest list
curl -s $BASE/v1/events/$EVENT_ID/guests | jq '.[].email'
```

That is the whole loop. `apps/api/src/kernel-loop.test.ts` encodes the same
path as CI (`npm test -w api`).

## Workspaces

One workspace per community/chat. `role` is always `"owner"` — kept in the
shape so clients stay forward-compatible with a multi-user edition.

| Route | Body → Returns |
| --- | --- |
| `POST /v1/workspaces` | `{ name, joinUrl? }` → `201` Workspace `{ id, name, slug, joinUrl, createdBy, createdAt }` |
| `GET /v1/workspaces` | → `(Workspace & { role: "owner" })[]` — every workspace on the deployment |
| `GET /v1/workspaces/by-slug/:slug` | → workspace + `role`. `404` unknown slug |
| `GET /v1/workspaces/:id` | → Workspace, `404` if missing |
| `PATCH /v1/workspaces/:id` | `{ name?, joinUrl? }` → updated Workspace |

## Evidence — imports, messages, files, timeline

Chat history is append-only evidence. Import is deduplicated by
`sourceMessageId`, so re-posting the same export returns `skipped` counts.

| Route | Body → Returns |
| --- | --- |
| `POST /v1/workspaces/:id/imports?filename=` | **Raw bytes** (not JSON): a WhatsApp `.txt` transcript or an export `.zip` (transcript + media). Filename decides parsing; `.txt` and text-looking bytes are treated as transcripts, anything else is unzipped — inside a zip the transcript is the last `.txt` entry whose name contains `chat`, or the first `.txt` entry if none does; `400 "No chat.txt in WhatsApp export"` only when the archive contains no `.txt` at all. → `{ inserted, skipped, members: Member[] }`. Zip media lands as `memory://` file records. |
| `POST /v1/ingest` | Normalized batch ingest — what channel adapters push: `{ communityId, source: { kind, name }, messages: [{ id, author, body, sentAt }] }` → `{ inserted, skipped, members }`. Dedupes on `sourceMessageId`; resolves members by display name. `404` unknown `communityId`. See `docs/CHANNELS.md`. |
| `POST /v1/ingest/discord` | Compat single-message shape: `{ communityId, id, content, timestamp, author: { id, username } }` → `{ inserted, skipped, member }`. `404` unknown `communityId`. |
| `GET /v1/workspaces/:id/messages` | → `Message[]` `{ id, communityId, sourceId, sourceMessageId, authorRaw, memberId, body, sentAt, isNoise }` |
| `GET /v1/workspaces/:id/files` | → `FileRecord[]` `{ id, communityId, messageId, name, storagePath, mime }` |
| `GET /v1/workspaces/:id/timeline` | → `TimelineEvent[]` `{ id, communityId, kind, payload, createdAt }`. Kinds emitted today: `import`, `memory`, `proposal`, `published`, `rsvp`, `page_view`. |
| `GET /v1/workspaces/:id/export` | → `{ version, exportedAt, workspace, sources, members, demands, proposals, venues, sponsors, resources, files, events, guests, citations, timeline, applications, blocklist, artifacts, webhooks, messages }` — the full archive, sent as an `attachment` download. `messages` carries ids + metadata (`sourceMessageId`, `authorRaw`, `memberId`, `sentAt`, `isNoise`) with **no bodies**; quoted text lives in `citations`. `webhooks` includes subscription secrets — the archive is operator data |

## Memory — cited truth

`POST /v1/workspaces/:id/memory` re-reads all messages and rebuilds member
cards, citations, resources and demand. Safe to re-run: citations are deduped
and **fields a lead has edited are locked** (`leadLockedFields`) — memory
refresh never overwrites a lead edit.

| Route | Returns |
| --- | --- |
| `POST /v1/workspaces/:id/memory` | `{ members: Member[], demands: Demand[], resources: Resource[] }` — full current state |
| `GET /v1/workspaces/:id/members` | `Member[]` `{ id, communityId, displayName, aliases, do, want, offer, notes, publicOptIn, publicSlug, lastActive, leadLockedFields }` |
| `GET /v1/members/:memberId` | Member + `citations: Citation[]` `{ id, objectType: "member", objectId, messageId, quote }` — every extracted field traces back to a quoted message. `404` unknown id |
| `PATCH /v1/members/:memberId` | `{ do?, want?, offer?, notes?, displayName?, publicOptIn?, publicSlug? }` → updated Member. Manually-set fields join `leadLockedFields`. Setting `publicOptIn: true` assigns a `publicSlug` and returns the refreshed member |
| `GET /v1/workspaces/:id/briefing` | `{ people, messages, topDemands: Demand[](≤5, with title + oneLiner filled in), resources, nextEvents: EventRecord[] }` |
| `GET /v1/workspaces/:id/demands` | `Demand[]` `{ id, communityId, topic, title, oneLiner, memberIds, messageIds, updatedAt }` (`title`/`oneLiner` are `null` until the demand has been opened once) |
| `GET /v1/demands/:demandId` | Demand with `title` + `oneLiner` generated and persisted, plus `citations` (`objectType: "demand"`). `404` unknown id |
| `GET /v1/workspaces/:id/resources` | `Resource[]` `{ id, communityId, url, title, messageId }` — URLs found in chat |
| `GET /v1/search?q=` | `[ { type: "member", workspaceId, member } \| { type: "demand", workspaceId, demand } ]` — substring match over member `displayName/do/want/offer` and demand `topic`, across all workspaces on the deployment |

## Venues & sponsors

Records that feed proposal matching.

| Route | Body → Returns |
| --- | --- |
| `POST /v1/workspaces/:id/venues` | `{ name, area?, capacity?, contact? }` → `201` Venue |
| `GET /v1/workspaces/:id/venues` | `Venue[]` `{ id, communityId, name, area, capacity, contact }` |
| `POST /v1/workspaces/:id/sponsors` | `{ name, notes? }` → `201` Sponsor |
| `GET /v1/workspaces/:id/sponsors` | `Sponsor[]` `{ id, communityId, name, notes }` |

## Proposals → events

A proposal is generated from a demand: up to 3 speaker matches, the smallest
venue that fits, an `explanation` string that embeds cited demand quotes.
Status moves only forward: `draft → approved → live`.

| Route | Body → Returns |
| --- | --- |
| `POST /v1/workspaces/:id/proposals` | `{ demandId }` → `201` **pack**: Proposal `{ id, communityId, demandId, venueId, speakerIds, status, explanation, outreachDraft }` + `{ speakers: Member[], venue: Venue\|null, citations: Citation[] }` |
| `GET /v1/workspaces/:id/proposals` | `Proposal[]` — bare records, no pack |
| `GET /v1/proposals/:proposalId` | the pack (same shape as create). `404` unknown id |
| `POST /v1/proposals/:proposalId/approve` | → pack with `status: "approved"`. `400` unless currently `draft` |
| `POST /v1/proposals/:proposalId/outreach` | → pack with `outreachDraft` filled (idempotent — returns the existing draft). **Draft only; nothing is sent.** |
| `POST /v1/proposals/:proposalId/go-live` | → `EventRecord` `{ id, communityId, proposalId, slug, title, startsAt: null, qrSvg, publishedAt }`. `400` unless `approved`. The public page slug and QR are minted here using `X-Public-Origin`/`Origin`. |

| Route | Returns |
| --- | --- |
| `GET /v1/workspaces/:id/events` | `EventRecord[]` |
| `GET /v1/events/:eventId/chain` | `{ event, proposal, demand, messages }` — the full provenance chain **including raw chat messages** |
| `GET /v1/events/:eventId/guests` | `Guest[]` `{ id, eventId, communityId, memberId, name, email, source: "native" }` |
| `POST /v1/events/:eventId/autopilot` | `AutopilotArtifact[]` — generates three artifacts at once: `run_sheet`, `post`, `newsletter`, each `{ id, eventId, communityId, kind, body }`. Regenerates (adds new copies) on every call |

## The front door — public pages

Opted-in surface only. Public responses never contain message bodies, member
emails, `want`, notes, or ids of members who haven't opted in. These were
always unauthenticated — they're the pages your community sees.

| Route | Returns |
| --- | --- |
| `GET /v1/public/communities/:slug` | `{ name, slug, joinUrl, qrSvg, events: [{ slug, title }] }`. `joinUrl` is published verbatim — set it on the workspace if you want a join link on the public page. `404` unknown slug |
| `GET /v1/public/events/:slug` | `{ slug, title, explanation, qrSvg, startsAt, publishedAt, community: { name, slug }, venue: { name, area } \| null, speakers: [{ name, slug }] }`. `explanation` is the proposal's cited-quotes string — it is public by design. `speaker.slug` is `null` unless the member opted in. Each call also records a `page_view` timeline event. `404` unknown slug |
| `POST /v1/public/events/:slug/rsvp` `{ name, email }` | `201` Guest. **Upserts by email** — re-posting updates name/member link rather than duplicating. Links the guest to a member on display-name or email-in-notes match. `400` on missing/invalid name/email **or** unknown slug |
| `GET /v1/public/members/:slug` | `{ name, slug, do, offer }` — only for members with `publicOptIn` and a `publicSlug`; everyone else `404`s. No `want`, no contact details |

## Gatekeeper — applications & blocklist

| Route | Body → Returns |
| --- | --- |
| `POST /v1/workspaces/:id/applications` | `{ applicant, answers }` → `Application` `{ id, communityId, applicant, answers, score, decision: "pending"\|"accept"\|"ask"\|"decline", reason }`. Scored at submit; a confirmed-blocklist applicant returns `score: 0, decision: "decline"` |
| `GET /v1/workspaces/:id/applications` | `Application[]` |
| `POST /v1/workspaces/:id/blocklist` | `{ applicant, evidence, confirmed? }` → `BlocklistEntry` `{ id, communityId, hash, evidence, reporter, confirmed }`. Stores **sha256 of the lowercased applicant string**, never the raw identifier |

## Webhooks — outbound events

Subscribe a URL to workspace events; the API `POST`s a signed JSON payload
after each action below. This is the standard way to connect external tools —
automation platforms, Discord bots, custom scripts.

| Route | Body → Returns |
| --- | --- |
| `POST /v1/workspaces/:id/webhooks` | `{ url, kinds? }` → `201` `{ id, communityId, url, secret, kinds, createdAt }`. `secret` (`whsec_…`) is returned **once** here. `kinds` empty or omitted = all events. `400` on a non-http(s) URL |
| `GET /v1/workspaces/:id/webhooks` | Subscriptions **without** secrets |
| `DELETE /v1/webhooks/:id` | `{ "ok": true }`, `404` unknown |

**Event kinds** (what fires them): `import` (WhatsApp import + Discord
ingest), `memory`, `proposal` (create, approve, outreach — `data.status`
differentiates), `published` (go-live), `rsvp`, `application`.

**Delivery** — `POST` to the subscribed URL:

```json
{ "id": "…", "kind": "rsvp", "workspaceId": "…", "occurredAt": "…", "data": { … } }
```

Headers: `content-type: application/json`, `x-communityos-event: <kind>`,
`x-communityos-signature: sha256=<hex>` — HMAC-SHA256 of the raw body keyed
with the subscription secret. Verify before trusting a payload:

```ts
import { verifyWebhookSignature } from "@community-os/sdk";
const ok = await verifyWebhookSignature(rawBody, req.headers["x-communityos-signature"], secret);
```

Delivery is **best-effort**: no retries, no delivery log. On Workers the POST
runs via `waitUntil`; on Node it floats as a background promise. A failing
webhook never affects the API response.

## What does not exist

Deliberate omissions and honest gaps. If a client needs one of these, it does
not exist yet — don't fake it client-side.

- **No accounts, sessions, tokens, or access control — anywhere.** The open
  build is single-operator. If you need multi-user auth, that's a hosted
  edition: see the README's "open core / hosted layer" note.
- **No `send_message` / posting back to chat — anywhere.** Not in `/v1`, not
  in MCP (`draft_message` only calls `/outreach`). The system drafts; a human
  sends.
- **No export *import*** — `GET /v1/workspaces/:id/export` archives a
  workspace out, but there is no route that loads an export back in.
- **No event editing.** `EventRecord.startsAt` exists but no route sets it;
  there is no `PATCH`/`DELETE` on events, proposals, demands, venues,
  sponsors, or guests. Workspaces do support `PATCH` (name, `joinUrl`).
- **No way to read autopilot artifacts back.** `saveArtifact`/`listArtifacts`
  exist in the store but only the `POST .../autopilot` response returns them.
- **No citations route** — citations arrive embedded on member/demand/proposal
  responses.
- **No application decision route** — `updateApplication` exists in the store
  but is not routed; the decision is fixed at submit time.
- **No blocklist listing or removal route.**
- **No sources or import-history route** — `listSources` is internal.
- **No per-platform ingest parsing server-side** — `POST /v1/ingest` accepts
  already-normalized messages for any `SourceKind` (slack/native included);
  platform-specific parsing lives in import adapters and channel packages
  (`docs/CHANNELS.md`), not the API.
- **No member-facing or public read of messages, demands, or guest lists** —
  raw evidence stays on the operator surface; the public surface is the four
  `/v1/public/*` routes above.
- **No webhook retries or delivery log** — delivery is best-effort.
- **No pagination, filtering, or sorting** on any list.
- **No RSVP cancellation.**

## Clients of this API

- `@community-os/sdk` — installable TypeScript package with two transports:
  `new CommunityOS({ baseUrl })` is a typed client for every route here, and
  `CommunityOS.memory()` runs the same method surface in-process on an
  embedded kernel (no server). `docs/openapi.yaml` for codegen in other
  languages.
- `apps/app` — the product UI (`/w/[slug]` desk, onboarding, settings, public
  pages, marketing site).
- `apps/mcp` — MCP adapter. Tool → route: `search_memory` → `GET /v1/search`,
  `get_member` → `GET /v1/members/:id`, `list_demand` →
  `GET /v1/workspaces/:id/demands`, `create_proposal` →
  `POST /v1/workspaces/:id/proposals`, `get_event` →
  `GET /v1/public/events/:slug`, `draft_message` →
  `POST /v1/proposals/:id/outreach`. Reachable three ways: stdio
  (`npm start -w @community-os/mcp`), Streamable HTTP on this Worker at
  `POST /mcp?workspace=<workspaceId>`, and Cloudflare Code Mode at
  `POST /mcp/code` — a single `code` tool that runs model-written JavaScript
  in a Dynamic Worker sandbox where the six functions are
  `codemode.<name>(args)` and outbound fetch is blocked.

---

*Related: [`docs/MAP.md`](MAP.md) (repo map), [`README.md`](../README.md)
(quick start + self-hosting), [`docs/PHASE-A.md`](PHASE-A.md) (what we're
building and why).*
