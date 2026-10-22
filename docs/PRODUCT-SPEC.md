# Product & build spec — Community OS

Working name: **Community OS** (the brain + the desk + the public face).  
Positioning: **Weird Stuff** — an end-to-end community product, not a single hackathon track.  
Licence target: **MIT**. Open source so another lead can run it next week.

---

## 1. What the product is

A **community operating system**.

It imports one community from the place it already lives (WhatsApp, Discord, or Slack), **saves everything**, and turns the mess into **memory**:

- **Community memory** — who we are, topics, resources, ideas, decisions, events  
- **Member memory** — each person: name, what they do, what they want, what they offer  

The **product is the API** (the brain). Humans and agents use it as **equal clients**: a web app for the lead, public pages for members, MCP/Code Mode for Cursor and Grok. No client gets a private back door; if a human can do it, an agent can do it through the same contracts (auth and permissions still apply).

The lead’s desk is just the first UI on that API. When a proposal is agreed, **go-live is an API call** that creates native event/community pages (QR, RSVP). Members may opt in to a public ID card.

It is **not** another chat app. Chat stays in WhatsApp/Discord/Slack. This product is the **brain and the official front door**.

**Native only:** no Luma (or other event-platform) integration in this spec. Guests, pages, and the conversion chain live entirely in our product. Leads can still paste our event URL into Luma themselves; we do not sync.

---

## 2. Who it is for

| Role | Access | Job |
|---|---|---|
| **Community lead** (primary) | Same API, via the desk client | Import, correct memory, approve proposals, publish events, see guests |
| **Member** | Public/read APIs + RSVP | Chat they already use; optional public profile |
| **Venue / sponsor** | Not users in v0 | Records the lead manages via API; become API users later |
| **Agents** (Cursor, Grok) | Same API, via MCP | Search, propose, draft — never silent-send |

v0 = **one community, one habitat, one lead**.

---

## 3. Problem (what hurts today)

Leads have years of chat and still cannot answer: who is here, what they want, who can speak, whether “we should do a workshop” became a real event, or who is actually coming.

The numbered hackathon tracks (Gatekeeper, Know Your Members, Event Autopilot, Venue DB, Front Desk) are **jobs on this pain**. This product is the **shared layer** so those jobs share one memory.

---

## 4. Principles

1. **One community, one channel first.** Multi-channel and multi-community come after the loop works.  
2. **Evidence is append-only.** Messages/files stay. Memory is structured rows *on top*, with citations.  
3. **Chat writes the draft; the lead owns the truth.** Lead edits are never overwritten by a model.  
4. **Public ≠ private.** The website/QR only shows opted-in / marked-public fields.  
5. **Native last mile.** Conversation → demand → proposal → **our event page** → **our RSVP**.  
6. **AI is janitor + copywriter**, on a schedule and a button — not the runtime. Quality = truth + citations, not token count.  
7. **Do not auto-message the group.** Drafts only; lead sends (or explicit confirm later).  
8. **API first.** The HTTP API is the source of behaviour. The desk, public site, and MCP are clients. Do not put business logic only in React.

---

## 5. End-to-end loop (v0 “done”)

1. Lead creates a workspace and names the community.  
2. Imports **one** habitat (WhatsApp export zip/txt **or** Discord export/bot).  
3. System stores messages/files, builds **member cards** and **community memory**.  
4. Desk shows briefing, people, resources, **demand** (“people want X”).  
5. Lead (or agent via MCP) opens a **proposal**: topic + speaker(s) from members + venue record.  
6. On go-live: **native event page** + community page + QR.  
7. People RSVP on that page → **guests** linked to members.  
8. Lead can walk the chain: event → proposal → demand → original messages.

That is the product. Everything else is a slice on this loop.

---

## 6. Features and how they work

### 6.1 Auth & workspace

Normal auth (Supabase). One workspace per community. `community_id` on every row.

**AI:** none.

### 6.2 Import

Parse WhatsApp export (chat.txt + media) or Discord JSON/bot history into `messages` and `files`. Idempotent on source id.

**AI:** none.

### 6.3 Live listen (v0.5)

Discord/Slack official bot appends the same `messages` table. WhatsApp stays **re-upload export** (no unofficial group bots).

**AI:** none on ingest.

### 6.4 Clean & organise

| Step | Method |
|---|---|
| Drop noise (joins, bots, “ok”) | Rules |
| Identity (same handle/id) | Rules + lead merge |
| Links/files → resources | Rules |
| Demand / offer / event-ish lines | Regex + optional cheap classifier |
| Member do / want / offer | **Batched LLM** on that member’s messages only, with quotes |

Never send the full dump to a frontier model.

### 6.5 Member memory

Card: name, aliases, do, want, offer, last active, lead notes, citations.  
Refresh only members who spoke since last job. Lead edits win.

**AI:** yes, batch, capped.

### 6.6 Community memory

Topics via embeddings/clusters. Weekly rollup, not per-message summaries. Resources pinned. Decisions when marked or extracted from high-signal threads.

**AI:** embeddings (once per chunk) + rare summaries.

### 6.7 Suggestions / demand

SQL rank: unique people + recency on `demands`. Title/one-liner generated **when the lead opens the card**.

**AI:** optional, lazy.

### 6.8 Proposals (event intelligence)

Match in **SQL/graph**: members with matching offer + topic; venue records by capacity/area. One LLM call to **explain** the pack with citations. Status: `draft → approved → live`.

**AI:** explanation + drafts only.

### 6.9 Draft outreach

Template + facts from the proposal. LLM fills tone **on click**. Lead copies/sends in the original chat.

**AI:** on demand, cached until the proposal changes.

### 6.10 Public face (native)

- `/c/{slug}` — community page: who we are, join link to **their** Discord/WhatsApp, next events, QR.  
- `/e/{slug}` — event page: what, who speaks (public cards only), where, RSVP.  
- `/m/{slug}` — member ID, **opt-in only**.

**AI:** none.

### 6.11 Guests & conversion

Native RSVP form → `guests` (`event_id`, `member_id` if matched, email/name).  
Funnel events: message → demand → proposal → published → rsvp → page view.

**AI:** none (email match); optional cheap fuzzy match later.

### 6.12 API, desk client, and MCP

**API (the product):** versioned HTTP JSON, one workspace per key/session. Resources match the data model (`/communities`, `/messages`, `/imports`, `/members`, `/demands`, `/proposals`, `/events`, `/guests`, `/resources`). Writes go through the same permission checks whether the caller is a browser or an agent.

**Desk (human client):** Next.js (or similar) talks only to this API. Recreated/iterated freely; it must not own import, matching, or publishing logic.

**Public site:** another client: read public community/event/member resources; `POST` RSVP.

**MCP:** a thin adapter over the **same** API (not a second implementation). Tools (v0): `search_memory`, `get_member`, `list_demand`, `create_proposal`, `get_event`, `draft_message`. No `send_message`. No raw dump of all messages.

Cloudflare **Code Mode** is post-v0: sandbox JS calls MCP/API tools in one run; approvals before side effects.

### 6.13 Later modules (same tables, not new products)

| Module | Track it maps to | When |
|---|---|---|
| Intros / speaker finder UI | Know Your Members | After member cards work |
| Autopilot (run sheet, posts, newsletter from `events`) | Event Autopilot | After native go-live |
| Venues as users + city graph | Open Venue DB | After venues-as-records |
| Inbound tickets, pricing, sponsors as users | Front Desk | After guests + events |
| Applications + hashed blocklist | Gatekeeper | Last (trust/legal) |

---

## 7. Data model (keep the chain)

```
Workspace
  Source            whatsapp | discord | slack | native
  Message / File    evidence (append-only)
  Citation          object_type + object_id + message_id + quote
  Member            do, want, offer, notes, public_opt_in
  Resource
  Demand            topic, member_ids, message_ids
  Venue             records in v0 (not a login)
  Sponsor           records in v0
  Proposal          demand_id, speakers[], venue_id, status
  Event             proposal_id, public slug, qr
  Guest             event_id, member_id?, source=native
  Timeline          funnel events for the lead
```

**Conversion:** Event → Proposal → Demand → Messages. Guest → Event → Member.  
The event page is the public end of this chain, not a separate CMS.

---

## 8. AI policy (quality without a huge bill)

**Pay for:** member field extraction with quotes; match explanations; outreach/newsletter drafts; ask-the-brain RAG on retrieved cards; borderline moderation later.

**Do not pay for:** ingest, RSVP, QR, auth, ranking counts, every Discord “ok”, image/video models, live summarise-everything.

**Cost controls:** filter then model; smallest model for classify, stronger model for lead-facing prose on a **short** prompt; embed once; batch nightly; generate lazily; cache drafts; hard caps per workspace; never overwrite lead edits.

Quality is **cited truth**. Cutting wasteful AI does not mean a worse product if extraction + explanations stay strong.

---

## 9. Stack (v0) — API first

```
Discord / WhatsApp export
        ↓
  API  (auth, import, memory, proposals, publish, RSVP)
   ↑         ↑            ↑
 desk     public       MCP → Cursor / Grok / Code Mode
(human)   (human)              (agents)
```

| Layer | Choice |
|---|---|
| **Core product** | HTTP API (this repo’s backend). All rules, AI jobs, and the conversion chain live here. |
| **Data** | **Supabase** — Auth, Postgres, Storage, RLS |
| **Memory / search** | **Cognee** or **pgvector** |
| **Human clients** | Next.js desk + public pages — **API clients only** |
| **Agent client** | **MCP** wrapping the same API |
| **Chat in** | WhatsApp export parser; Discord official API for live listen |
| **Build tools** | Cursor / Grok as MCP clients, not as a second backend |

No Luma, Zero, or Ghost required for v0.

---

## 10. Build slices

Ship in this order. Do not parallelise five tracks.

| Slice | Ships | Done when |
|---|---|---|
| **0 Kernel API** | Auth, workspace, import, messages/files, members **as HTTP** | `curl` import → list members (no UI required) |
| **1 Memory API** | Extract do/want/offer, resources, demand, briefing endpoints | Another client could render cards |
| **2 Proposal API** | Match, explain, draft, status transitions | Approve a pack via API |
| **3 Native face** | Public read + RSVP API **and** first web client (pages + QR) | Full chain; UI is a client |
| **4 Desk + MCP** | Lead desk UI + MCP adapter on the same routes | Human and agent do the same jobs |
| **5 Live** | Discord listen into the API | New message updates members |
| **6 Apps** | Autopilot, venue/sponsor users, gatekeeper | Only after 0–4 are used |

---

## 11. Non-goals (v0)

- Luma / Meetup / Eventbrite integrations  
- Unofficial WhatsApp group bots  
- Member-facing social network or public directory of everyone  
- Auto-posting into the community  
- Cross-community search / London-wide venue wiki as the first screen  
- Replacing Discord/WhatsApp as the chat  

---

## 12. Privacy & trust

- Lead sees what they could already scroll to in a group they admin.  
- No publishing chat-derived wants without opt-in.  
- No private member dumps in the public GitHub repo.  
- RLS by `community_id`.  
- Export/delete workspace.

---

## 13. Weird Stuff demo (when we show it)

1. Name the community and the pain.  
2. Import a real export.  
3. Open two member cards (citations).  
4. Demand → proposal.  
5. Go live: event page + QR + a test RSVP appearing as a guest.  
6. Public repo + MIT.

---

## 14. Success

A lead would run **this community next week** from the desk instead of scrolling chat and a spreadsheet.  
Another community can clone the repo, add keys, import **their** export, and get the same loop.

---

## Related

- Hackathon capture (tracks, partners, data kit): [`docs/hackathon-london-2026.md`](hackathon-london-2026.md)
