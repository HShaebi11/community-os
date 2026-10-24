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
in-memory store with dev auth enabled — fine for trying the loop below, nothing
persists. With `DATABASE_URL` (pooled Postgres) it uses the Drizzle store and
Better Auth; set `ALLOW_DEV_AUTH=true` to keep `POST /v1/auth/dev` available.
Other env vars (`APP_ORIGINS`, `BETTER_AUTH_*`, `RESEND_API_KEY`,
`GOOGLE_CLIENT_*`) are listed in [`apps/api/.dev.vars.example`](../apps/api/.dev.vars.example)
and the [README](../README.md#setup).

```sh
curl -s http://localhost:5173/v1/health
# {"ok":true,"product":"community-os"}
```

## Conventions

- JSON in, JSON out. Errors are `{ "error": "<message>" }` with status
  `401` (unauthenticated), `403` (authenticated but not a lead / untrusted
  origin / token managing tokens), `404` (hidden or missing), or `400` for
  domain errors thrown by the kernel (`"approve the proposal before going
  live"`, `"name and email required"`, …).
- `?filename=` on imports and `?q=` on search are the only query params.
  There is **no pagination, filtering, or sorting** on any list route.
- `X-Public-Origin` request header overrides the origin used when the API
  builds absolute URLs (QR codes, outreach/promo links). Falls back to
  `Origin`, then the request origin. Set it when the API sits behind a proxy
  or is called by an agent that knows the public hostname.
- CORS reflects the request `Origin`, allows methods
  `GET, POST, PATCH, DELETE, OPTIONS` and headers
  `Content-Type, Authorization, X-Public-Origin`.
- "Lead" below means `store.isLead(workspaceId, userId)` — the workspace
  creator becomes `owner`; other leads are added via Better Auth
  organizations (`/api/auth/organization/*`). Non-leads get `403`.

## Auth

Three credential kinds. All three reach `GET /v1/me`.

```sh
curl -s $BASE/v1/me -H "authorization: Bearer $TOKEN"
# {"userId":"…","email":"lead@example.com","name":null,"authKind":"session"}
```

| Kind | How you get it | Header | Notes |
| --- | --- | --- | --- |
| `cos_` API token | `POST /v1/tokens` (or app → Settings → Agent access) | `Authorization: Bearer cos_…` | For agents, MCP, curl. Shown once at mint; list/revoke never expose it. **Cannot** call `POST`/`DELETE /v1/tokens` (403 `tokens cannot manage tokens`). |
| Session token | `POST /v1/auth/dev` | `Authorization: Bearer <token>` | Local/dev only — exists when `ALLOW_DEV_AUTH=true` or there is no database; otherwise the route 404s. |
| Cookie session | Better Auth `/api/auth/*` (browser) | `Cookie` | Used by the app. Non-GET requests must send an `Origin` in `APP_ORIGINS` (any loopback origin also passes when dev auth is on) or they get `403 untrusted origin`. |

Better Auth mounts at `/api/auth/*` (not `/v1`): email+password, magic link,
Google when configured, and the organization endpoints the app uses for team
invites and roles. Those routes are Better Auth's contract, not this doc's.

Supporting routes:

| Route | Auth | Returns |
| --- | --- | --- |
| `GET /v1/health` | public | `{ ok, product }` |
| `GET /v1/auth/providers` | public | `{ password: true, magicLink: true, google, email: "resend"\|"log", devAuth }` |
| `POST /v1/auth/dev` `{ email }` | public (dev only) | `{ token, userId, email }` — creates the user if needed |
| `GET /v1/dev/outbox` | public (dev only) | last 50 unsent emails `{ kind, to, link, subject, sentAt }` — where magic links/invites land without `RESEND_API_KEY` |
| `GET /v1/me` | any | `{ userId, email, name, authKind }` |

### Agent tokens

```sh
curl -s -X POST $BASE/v1/tokens -H "$AUTH" -H 'content-type: application/json' \
  -d '{"name":"mcp"}'
# 201 { "id", "name", "prefix": "cos_ab12", "token": "cos_…", "createdAt" }
# `token` is returned exactly once. Store it.

curl -s $BASE/v1/tokens -H "$AUTH"          # [{ id, userId, name, prefix, createdAt, lastUsedAt, revokedAt }] — active tokens only: revoked ones are omitted (no revocation history) and no secret material is returned
curl -s -X DELETE $BASE/v1/tokens/$TOKEN_ID -H "$AUTH"   # {"ok":true} — 404 if not yours/gone
```

`POST`/`DELETE /v1/tokens` require a session or cookie credential; a `cos_`
token gets 403. `GET /v1/tokens` works with any credential.

## The kernel loop

The product spine: import a chat → build cited memory → propose from demand →
go live → public RSVP → guest list. Runs verbatim against a local API
(`jq` required). Fixture: [`fixtures/whatsapp-sample/_chat.txt`](../fixtures/whatsapp-sample/_chat.txt).

```sh
BASE=http://localhost:5173

# 1. Dev sign-in → bearer token
TOKEN=$(curl -s $BASE/v1/auth/dev -H 'content-type: application/json' \
  -d '{"email":"lead@example.com"}' | jq -r .token)
AUTH="authorization: Bearer $TOKEN"

# 2. Create a workspace (you become its owner/lead)
WS=$(curl -s -X POST $BASE/v1/workspaces -H "$AUTH" -H 'content-type: application/json' \
  -d '{"name":"Weird Stuff"}' | jq -r .id)

# 3. Import a WhatsApp export (.txt transcript or .zip with media)
curl -s "$BASE/v1/workspaces/$WS/imports?filename=_chat.txt" \
  -H "$AUTH" --data-binary @fixtures/whatsapp-sample/_chat.txt \
  | jq '{inserted, skipped, members: (.members | length)}'

# 4. Refresh memory — fills member do/want/offer, citations, demands, resources
curl -s -X POST $BASE/v1/workspaces/$WS/memory -H "$AUTH" \
  | jq '{members: (.members|length), demands: (.demands|length), resources: (.resources|length)}'

# 5. Read a cited member card
MEMBER=$(curl -s $BASE/v1/workspaces/$WS/members -H "$AUTH" \
  | jq -r '[.[] | select(.do or .want or .offer)][0].id')
curl -s $BASE/v1/members/$MEMBER -H "$AUTH" | jq '{displayName, do, offer, citations}'

# 6. Pick a demand, open it (title + one-liner + citations)
DEMAND=$(curl -s $BASE/v1/workspaces/$WS/demands -H "$AUTH" | jq -r '.[0].id')
curl -s $BASE/v1/demands/$DEMAND -H "$AUTH" | jq '{topic, title, oneLiner, citations}'

# 7. Optional: register a venue so the proposal can match one
curl -s -X POST $BASE/v1/workspaces/$WS/venues -H "$AUTH" -H 'content-type: application/json' \
  -d '{"name":"Expedite HQ","area":"Hammersmith","capacity":80}'

# 8. Demand → proposal pack (speakers, venue, explanation, citations)
PROPOSAL=$(curl -s -X POST $BASE/v1/workspaces/$WS/proposals -H "$AUTH" \
  -H 'content-type: application/json' -d "{\"demandId\":\"$DEMAND\"}" | jq -r .id)
curl -s $BASE/v1/proposals/$PROPOSAL -H "$AUTH" | jq '{status, explanation, speakers: [.speakers[].displayName], venue}'

# 9. Approve → draft outreach → go live (creates the public event)
curl -s -X POST $BASE/v1/proposals/$PROPOSAL/approve  -H "$AUTH" | jq .status      # "approved"
curl -s -X POST $BASE/v1/proposals/$PROPOSAL/outreach -H "$AUTH" | jq .outreachDraft
EVENT=$(curl -s -X POST $BASE/v1/proposals/$PROPOSAL/go-live -H "$AUTH")
SLUG=$(jq -r .slug <<<"$EVENT"); EVENT_ID=$(jq -r .id <<<"$EVENT")

# 10. Public side — no auth
curl -s $BASE/v1/public/events/$SLUG | jq '{title, venue, speakers, startsAt}'
curl -s -X POST $BASE/v1/public/events/$SLUG/rsvp -H 'content-type: application/json' \
  -d '{"name":"Guest","email":"guest@example.com"}' | jq .email

# 11. Back inside: the guest list (lead only)
curl -s $BASE/v1/events/$EVENT_ID/guests -H "$AUTH" | jq '.[].email'
```

That is the whole loop. `apps/api/src/kernel-loop.test.ts` encodes the same
path as CI (`npm test -w api`).

## Workspaces

| Route | Auth | Body → Returns |
| --- | --- | --- |
| `POST /v1/workspaces` | any | `{ name, joinUrl? }` → `201` Workspace `{ id, name, slug, joinUrl, createdBy, createdAt }`. Caller becomes `owner`. |
| `GET /v1/workspaces` | any | → `(Workspace & { role: "owner"\|"admin"\|"member" })[]` — workspaces the caller belongs to |
| `GET /v1/workspaces/by-slug/:slug` | any | → same entry shape as list. `404` if the caller isn't a member — does not confirm existence to outsiders. |
| `GET /v1/workspaces/:id` | lead | → Workspace |
| `PATCH /v1/workspaces/:id` | lead | `{ name?, joinUrl? }` → updated Workspace |

## Evidence — imports, messages, files, timeline

Chat history is append-only evidence. Import is deduplicated by
`sourceMessageId`, so re-posting the same export returns `skipped` counts.

| Route | Auth | Body → Returns |
| --- | --- | --- |
| `POST /v1/workspaces/:id/imports?filename=` | lead | **Raw bytes** (not JSON): a WhatsApp `.txt` transcript or an export `.zip` (transcript + media). Filename decides parsing; `.txt` and text-looking bytes are treated as transcripts, anything else is unzipped — inside a zip the transcript is the last `.txt` entry whose name contains `chat`, or the first `.txt` entry if none does; `400 "No chat.txt in WhatsApp export"` only when the archive contains no `.txt` at all. → `{ inserted, skipped, members: Member[] }`. Zip media lands as `memory://` file records. |
| `POST /v1/ingest/discord` | lead of `communityId` | `{ communityId, id, content, timestamp, author: { id, username } }` → `{ inserted, skipped, member }`. One message per call. |
| `GET /v1/workspaces/:id/messages` | lead | → `Message[]` `{ id, communityId, sourceId, sourceMessageId, authorRaw, memberId, body, sentAt, isNoise }` |
| `GET /v1/workspaces/:id/files` | lead | → `FileRecord[]` `{ id, communityId, messageId, name, storagePath, mime }` |
| `GET /v1/workspaces/:id/timeline` | lead | → `TimelineEvent[]` `{ id, communityId, kind, payload, createdAt }`. Kinds emitted today: `import`, `memory`, `proposal`, `published`, `rsvp`, `page_view`. |
| `GET /v1/workspaces/:id/export` | lead | → `{ version, exportedAt, workspace, sources, members, demands, proposals, venues, sponsors, resources, files, events, guests, citations, timeline, applications, blocklist, artifacts, messages }` — the full archive, sent as an `attachment` download. `messages` carries ids + metadata (`sourceMessageId`, `authorRaw`, `memberId`, `sentAt`, `isNoise`) with **no bodies**; quoted text lives in `citations`. |

## Memory — cited truth

`POST /v1/workspaces/:id/memory` re-reads all messages and rebuilds member
cards, citations, resources and demand. Safe to re-run: citations are deduped
and **fields a lead has edited are locked** (`leadLockedFields`) — memory
refresh never overwrites a lead edit.

| Route | Auth | Returns |
| --- | --- | --- |
| `POST /v1/workspaces/:id/memory` | lead | `{ members: Member[], demands: Demand[], resources: Resource[] }` — full current state |
| `GET /v1/workspaces/:id/members` | lead | `Member[]` `{ id, communityId, displayName, aliases, do, want, offer, notes, publicOptIn, publicSlug, lastActive, leadLockedFields }` |
| `GET /v1/members/:memberId` | lead of that member's workspace | Member + `citations: Citation[]` `{ id, objectType: "member", objectId, messageId, quote }` — every extracted field traces back to a quoted message |
| `PATCH /v1/members/:memberId` | lead | `{ do?, want?, offer?, notes?, displayName?, publicOptIn?, publicSlug? }` → updated Member. Lead-set fields join `leadLockedFields`. Setting `publicOptIn: true` assigns a `publicSlug` and returns the refreshed member. |
| `GET /v1/workspaces/:id/briefing` | lead | `{ people, messages, topDemands: Demand[](≤5, with title + oneLiner filled in), resources, nextEvents: EventRecord[] }` |
| `GET /v1/workspaces/:id/demands` | lead | `Demand[]` `{ id, communityId, topic, title, oneLiner, memberIds, messageIds, updatedAt }` (`title`/`oneLiner` are `null` until the demand has been opened once) |
| `GET /v1/demands/:demandId` | lead of that demand's workspace | Demand with `title` + `oneLiner` generated and persisted, plus `citations` (`objectType: "demand"`) |
| `GET /v1/workspaces/:id/resources` | lead | `Resource[]` `{ id, communityId, url, title, messageId }` — URLs found in chat |
| `GET /v1/search?q=` | any | `[ { type: "member", workspaceId, member } \| { type: "demand", workspaceId, demand } ]` — substring match over member `displayName/do/want/offer` and demand `topic`, across the caller's workspaces only |

## Venues & sponsors

Records that feed proposal matching. `claim` lets a person attach themselves
to the record (`userId`) — e.g. "this venue is mine".

| Route | Auth | Body → Returns |
| --- | --- | --- |
| `POST /v1/workspaces/:id/venues` | lead | `{ name, area?, capacity?, contact? }` → `201` Venue |
| `GET /v1/workspaces/:id/venues` | lead | `Venue[]` `{ id, communityId, name, area, capacity, contact, userId }` |
| `POST /v1/venues/:venueId/claim` | any | → Venue with `userId` = caller (404 if unknown) |
| `POST /v1/workspaces/:id/sponsors` | lead | `{ name, notes? }` → `201` Sponsor |
| `GET /v1/workspaces/:id/sponsors` | lead | `Sponsor[]` `{ id, communityId, name, notes, userId }` |
| `POST /v1/sponsors/:sponsorId/claim` | any | → Sponsor with `userId` = caller (404 if unknown) |

## Proposals → events

A proposal is generated from a demand: up to 3 speaker matches, the smallest
venue that fits, an `explanation` string that embeds cited demand quotes.
Status moves only forward: `draft → approved → live`.

| Route | Auth | Body → Returns |
| --- | --- | --- |
| `POST /v1/workspaces/:id/proposals` | lead | `{ demandId }` → `201` **pack**: Proposal `{ id, communityId, demandId, venueId, speakerIds, status, explanation, outreachDraft }` + `{ speakers: Member[], venue: Venue\|null, citations: Citation[] }` |
| `GET /v1/workspaces/:id/proposals` | lead | `Proposal[]` — bare records, no pack |
| `GET /v1/proposals/:proposalId` | lead | the pack (same shape as create) |
| `POST /v1/proposals/:proposalId/approve` | lead | → pack with `status: "approved"`. `400` unless currently `draft` |
| `POST /v1/proposals/:proposalId/outreach` | lead | → pack with `outreachDraft` filled (idempotent — returns the existing draft). **Draft only; nothing is sent.** |
| `POST /v1/proposals/:proposalId/go-live` | lead | → `EventRecord` `{ id, communityId, proposalId, slug, title, startsAt: null, qrSvg, publishedAt }`. `400` unless `approved`. The public page slug and QR are minted here using `X-Public-Origin`/`Origin`. |

| Route | Auth | Returns |
| --- | --- | --- |
| `GET /v1/workspaces/:id/events` | lead | `EventRecord[]` |
| `GET /v1/events/:eventId/chain` | lead | `{ event, proposal, demand, messages }` — the full provenance chain **including raw chat messages**. Lead-only by design. |
| `GET /v1/events/:eventId/guests` | lead | `Guest[]` `{ id, eventId, communityId, memberId, name, email, source: "native" }` |
| `POST /v1/events/:eventId/autopilot` | lead | `AutopilotArtifact[]` — generates three artifacts at once: `run_sheet`, `post`, `newsletter`, each `{ id, eventId, communityId, kind, body }`. Regenerates (adds new copies) on every call. |

## The front door — public, no auth

Opted-in surface only. Public responses never contain message bodies, member
emails, `want`, notes, or ids of members who haven't opted in.

| Route | Returns |
| --- | --- |
| `GET /v1/public/communities/:slug` | `{ name, slug, joinUrl, qrSvg, events: [{ slug, title }] }`. `joinUrl` is published verbatim — set it on the workspace if you want a join link on the public page. `404` unknown slug. |
| `GET /v1/public/events/:slug` | `{ slug, title, explanation, qrSvg, startsAt, publishedAt, community: { name, slug }, venue: { name, area } \| null, speakers: [{ name, slug }] }`. `explanation` is the proposal's cited-quotes string — it is public by design. `speaker.slug` is `null` unless the member opted in. Each call also records a `page_view` timeline event. `404` unknown slug. |
| `POST /v1/public/events/:slug/rsvp` `{ name, email }` | `201` Guest. **Upserts by email** — re-posting updates name/member link rather than duplicating. Links the guest to a member on display-name or email-in-notes match. `400` on missing/invalid name/email **or** unknown slug. |
| `GET /v1/public/members/:slug` | `{ name, slug, do, offer }` — only for members with `publicOptIn` and a `publicSlug`; everyone else `404`s. No `want`, no contact details. |

## Gatekeeper — applications & blocklist

| Route | Auth | Body → Returns |
| --- | --- | --- |
| `POST /v1/workspaces/:id/applications` | lead | `{ applicant, answers }` → `Application` `{ id, communityId, applicant, answers, score, decision: "pending"\|"accept"\|"ask"\|"decline", reason }`. Scored at submit; a confirmed-blocklist applicant returns `score: 0, decision: "decline"`. |
| `GET /v1/workspaces/:id/applications` | lead | `Application[]` |
| `POST /v1/workspaces/:id/blocklist` | lead | `{ applicant, evidence, confirmed? }` → `BlocklistEntry` `{ id, communityId, hash, evidence, reporter, confirmed }`. Stores **sha256 of the lowercased applicant string**, never the raw identifier. |

## What does not exist

Deliberate omissions and honest gaps. If a client needs one of these, it does
not exist yet — don't fake it client-side.

- **No `send_message` / posting back to chat — anywhere.** Not in `/v1`, not
  in MCP (`draft_message` only calls `/outreach`). The system drafts; a human
  sends.
- **No export *import*** — `GET /v1/workspaces/:id/export` archives a
  workspace out, but there is no route that loads an export back in.
- **No event editing.** `EventRecord.startsAt` exists but no route sets it;
  there is no `PATCH`/`DELETE` on events, proposals, demands, venues,
  sponsors, or guests. Workspaces do support `PATCH` (name, `joinUrl`) —
  see above — but the only `DELETE` on the whole API is `DELETE
  /v1/tokens/:id`.
- **No way to read autopilot artifacts back.** `saveArtifact`/`listArtifacts`
  exist in the store but only the `POST .../autopilot` response returns them.
- **No citations route** — citations arrive embedded on member/demand/proposal
  responses.
- **No application decision route** — `updateApplication` exists in the store
  but is not routed; the decision is fixed at submit time.
- **No blocklist listing or removal route.**
- **No sources or import-history route** — `listSources` is internal.
- **No Slack or "native" ingest routes** — `SourceKind` includes them; only
  WhatsApp import and Discord ingest are wired.
- **No `/v1` team management** — workspace membership and roles live under
  Better Auth `/api/auth/organization/*`.
- **No member-facing or public read of messages, demands, or guest lists** —
  raw evidence is lead-only; the public surface is the four
  `/v1/public/*` routes above.
- **No pagination, filtering, or sorting** on any list.
- **No RSVP cancellation.**

## Clients of this API

- `apps/app` — the product UI (`/w/[slug]` desk, onboarding, settings).
- `apps/web` — legacy desk; dev-auth bearer.
- `apps/mcp` — MCP adapter. Tool → route: `search_memory` → `GET /v1/search`,
  `get_member` → `GET /v1/members/:id`, `list_demand` →
  `GET /v1/workspaces/:id/demands`, `create_proposal` →
  `POST /v1/workspaces/:id/proposals`, `get_event` →
  `GET /v1/public/events/:slug`, `draft_message` →
  `POST /v1/proposals/:id/outreach`.

---

*Related: [`docs/MAP.md`](MAP.md) (repo map), [`README.md`](../README.md)
(quick start), [`docs/PHASE-A.md`](PHASE-A.md) (what we're building and why).
Linear: [COS-9](https://linear.app/interfaces-co/issue/COS-9).*
