# @community-os/sdk

**Community OS is this package.** Not a client for it — the whole product,
as a library: WhatsApp/Discord ingest, cited member memory, demand
extraction, proposal packs, native event pages + RSVPs, applications,
blocklist, webhooks, export — with persistence left to you.

```bash
npm i @community-os/sdk
```

Requires Node 20+ (`node:sqlite` adapters need Node 22.5+).

## Pick your storage — or none

```ts
import { CommunityOS } from "@community-os/sdk";
import { SqliteStore } from "@community-os/store-sqlite"; // or your own Store

const cos = CommunityOS.memory();                        // scratch / tests
const cos = CommunityOS.store(new SqliteStore("./community.db")); // durable, zero services
const cos = CommunityOS.store(createDrizzleStore(db));   // Postgres (@community-os/db)
const cos = CommunityOS.store(myStore);                  // anything implementing Store
```

Storage is a contract (`Store`), not a product decision. SQLite, Postgres,
Turso, D1, files — implement ~40 methods and the entire community OS runs on
it. The two in-repo adapters: `SqliteStore` (embedded, zero deps) and
`createDrizzleStore` (Postgres via Drizzle).

## Serve it

The same instance exposes the real `/v1` HTTP API + MCP endpoint:

```ts
const cos = CommunityOS.store(new SqliteStore("./community.db"));
const { port, close } = await cos.serve({ port: 5173 }); // npm i @hono/node-server
```

That's the actual API — `apps/api` is just this wrapped for deployment
(Cloudflare Worker or `node`). Self-hosting can literally be a six-line
file.

## Remote mode

Point it at any deployed API instead:

```ts
const cos = new CommunityOS({ baseUrl: "http://localhost:5173" });
```

Same methods either way — embedded calls the kernel, remote calls the
routes, and the error semantics match (`ApiError` with `.status`).

## The loop

```ts
const ws = await cos.createWorkspace({ name: "Weird Stuff" });
await cos.importChat(ws.id, chatExportText, "_chat.txt"); // string, bytes, Blob, or .zip
const { members, demands } = await cos.refreshMemory(ws.id);
const pack = await cos.createProposal(ws.id, demands[0].id);
await cos.approveProposal(pack.id);
const event = await cos.goLive(pack.id);
await cos.rsvp(event.slug, { name: "Ada", email: "ada@test.dev" });
const backup = await cos.exportWorkspace(ws.id);          // everything, as JSON
```

## Ingest adapters

`importChat` defaults to WhatsApp parsing. In embedded mode pass any
`IngestAdapter` — `parse(bytes, filename) → { transcript, files }` — to teach
it Slack, Telegram, or whatever format your community exports. Writing an
adapter is the intended contribution path for new platforms.

## Webhooks

`createWebhook` / `listWebhooks` / `deleteWebhook` manage subscriptions; the
secret (`whsec_…`) is returned once at creation. Receivers verify with:

```ts
import { verifyWebhookSignature } from "@community-os/sdk";
const ok = await verifyWebhookSignature(rawBody, req.headers["x-communityos-signature"], secret);
```

Embedded mode registers subscriptions but only `serve()`/remote deployments
deliver them.

## Ground rules

- No accounts or API keys — the open core is single-operator. Put network
  auth in front of anything exposed; a hosted edition layers it on at the
  edge.
- Drafts only: `draftOutreach` returns text for a human to send. There is no
  `send`, ever.
- The public front-door methods (`publicCommunity`, `publicEvent`,
  `publicMember`, `rsvp`) only ever return opted-in data.

MIT · part of the [Community OS](https://github.com/HShaebi11/community-os) monorepo.
