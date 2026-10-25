# Channels — continuous ingest

Community OS ingests platform data two ways:

- **One-shot imports** — `importChat` parses an export file (WhatsApp `.txt`/`.zip` built in; any `IngestAdapter` for others).
- **Live channels** — `cos.listen(adapter, { workspaceId })` runs a continuous feed: new platform messages become deduped, member-resolved `Message` rows on whatever `Store` you chose.

```ts
import { CommunityOS } from "@community-os/sdk";
import { discordChannel } from "@community-os/channel-discord";

const cos = CommunityOS.store(new SqliteStore("./community.db"));
const ws = await cos.createWorkspace({ name: "Weird Stuff" });
const handle = await cos.listen(discordChannel({ token: process.env.DISCORD_TOKEN! }), {
  workspaceId: ws.id,
});
// …later: await handle.stop();
```

Works identically embedded (writes via `ingestMessages`) and remote (batches `POST /v1/ingest`).

## The adapter contract

```ts
type ChannelAdapter = {
  name: string;              // "discord" — also the default source name
  kind: SourceKind;          // "discord" | "slack" | "whatsapp" | "native"
  start(ctx: { emit(messages: NormalizedMessage[]): Promise<void> }): Promise<void>;
  stop(): Promise<void>;
};

type NormalizedMessage = {
  id: string;       // platform message id — dedupe key per workspace
  author: string;   // display name — resolved to a Member via alias upsert
  body: string;
  sentAt: string;   // ISO timestamp — feeds member lastActive
};
```

Your own adapter is ~30 lines: poll an API, tail a file, wrap another client
library — normalize to `NormalizedMessage` and call `emit`.

## Adapters in this repo

| Package | Mechanism | Setup |
|---|---|---|
| `@community-os/channel-discord` | Discord **Gateway** WebSocket (raw, no discord.js) | Bot token; enable **MESSAGE_CONTENT** intent in the dev portal (privileged); optional `channelIds`/`guildIds` filters. |
| `@community-os/channel-slack` | **Socket Mode** WebSocket (outbound — works behind NAT, no public URL) | App-level `xapp-` token (`connections:write`); `botToken` `xoxb-` optional — resolves user ids to names via `users.info`, else `author` = user id. |
| `@community-os/channel-whatsapp` | **Baileys** multi-device client (`@whiskeysockets/baileys` peer dep — `npm i` it yourself) | QR pairing via `onQr` callback; session persists in `sessionDir`. Groups only by default (`include: "all"` for DMs too). |

### WhatsApp honesty note

There is no official WhatsApp API for *reading* group messages — Baileys is
the standard unofficial client (the same mechanism as WhatsApp Web). It works,
it's widely used, and it's ToS-grey: the account can theoretically be banned.
It lives in its own optional package so nothing else in Community OS carries
that risk. Prefer official exports + `importChat` where a file suffices.

## Reacting to what arrives — `cos.on()`

```ts
const unsub = cos.on("rsvp", (event) => sendWelcomeDm(event.payload)); // or "*"
```

- **Embedded:** dispatches as the kernel writes timeline events
  (`import`, `memory`, `proposal`, `published`, `rsvp`, `page_view`).
- **Remote:** polls the workspace timelines every `pollMs` (default 5s) —
  eventually consistent; signed **webhooks** remain the real-time push path.
- Handlers only see events from after they subscribed.

## Mounting the ingest surface — `cos.fetch()`

Every embedded instance is also the full app as a fetch handler — mount it
anywhere fetch-based servers exist (a Worker `export default`, `Bun.serve`,
`Deno.serve`, a Next.js route handler) — `POST /v1/ingest` included:

```ts
const cos = CommunityOS.store(new SqliteStore("./community.db"));
export default { fetch: (req: Request) => cos.fetch(req) }; // a whole Worker
```

For a standalone Node server instead: `cos.serve({ port })` (needs
`@hono/node-server`).

## Passive ingest without an adapter

Platforms that can only POST webhooks can hit `POST /v1/ingest` directly:

```json
{ "communityId": "…", "source": { "kind": "native", "name": "my-bot" },
  "messages": [{ "id": "…", "author": "…", "body": "…", "sentAt": "…" }] }
```

`/v1/ingest/discord` (single-message shape) remains for compatibility.
