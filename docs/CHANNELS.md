# Channels — continuous ingest

Community OS ingests platform data two ways:

- **One-shot imports** — `importChat` parses an export file (WhatsApp `.txt`/`.zip` built in; any `IngestAdapter` for others).
- **Live channels** — `cos.listen(adapter, { workspaceId })` runs a continuous feed: new platform messages become deduped, member-resolved `Message` rows on whatever `Store` you chose.
- **Webhooks** — `cos.receive(adapter, { workspaceId })` turns platforms that *push* (Slack Events API, WhatsApp Cloud API, or any service via `jsonWebhook`) into a fetch handler you mount anywhere.

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

## Webhook receivers — `cos.receive()`

The passive mirror of `listen` for platforms that push over HTTP. A
`WebhookAdapter` owns the platform specifics — signature checks, verification
handshakes, payload mapping — and `cos.receive` wires the messages into the
same dedupe path (embedded store or `POST /v1/ingest` remotely). Ingest
failures return 500 so platforms retry; dedupe makes replays safe.

```ts
type WebhookAdapter = {
  name: string;
  kind: SourceKind;
  handle(request: Request): Promise<{ messages: NormalizedMessage[]; response?: Response }>;
  // throw a Response to short-circuit (e.g. 403 on a bad signature)
};
```

Shipped receivers:

| Adapter | Platform path | Setup |
|---|---|---|
| `slackEvents({ signingSecret, botToken? })` (channel-slack) | **Slack Events API** — Slack's production transport | Verify token + `X-Slack-Signature` handled; answers `url_verification` automatically. Point Slack's Event Subscriptions URL at your handler. |
| `whatsappCloud({ verifyToken, appSecret? })` (channel-whatsapp) | **WhatsApp Cloud API** — Meta's official webhooks | Handles the `GET` subscribe handshake; verifies `x-hub-signature-256` when `appSecret` is set. Receives 1:1 inbound + Groups API groups (OBA-only, ≤8 members). |
| `jsonWebhook({ map, verify? })` (SDK built-in) | **Anything that POSTs JSON** — Omni, n8n, Zapier, custom pollers | One `map(payload) → NormalizedMessage[]` function. |

Mounting — the handler is a plain fetch function; serve it wherever:

```ts
import { slackEvents } from "@community-os/channel-slack";

const hook = await cos.receive(slackEvents({ signingSecret }), { workspaceId });
// Option A: alongside the whole app
export default { fetch: (r) => (r.url.endsWith("/slack") ? hook(r) : cos.fetch(r)) };
// Option B: standalone
Bun.serve({ fetch: (r) => (r.url.endsWith("/slack") ? hook(r) : new Response("ok")) });
```

Adapter rejections (bad signature, failed verify) propagate as their thrown
`Response` — `403` etc. — so platform dashboards see a clean failure.

## Adapters in this repo

| Package | Mechanism | Setup |
|---|---|---|
| `@community-os/channel-discord` | Discord **Gateway** WebSocket (raw, no discord.js) | Bot token; enable **MESSAGE_CONTENT** intent in the dev portal (privileged); optional `channelIds`/`guildIds` filters. |
| `@community-os/channel-slack` | **Socket Mode** WebSocket (outbound — works behind NAT, no public URL) | App-level `xapp-` token (`connections:write`); `botToken` `xoxb-` optional — resolves user ids to names via `users.info`, else `author` = user id. |
| `@community-os/channel-whatsapp` | **Baileys** multi-device client (`@whiskeysockets/baileys` peer dep — `npm i` it yourself) | QR pairing via `onQr` callback; session persists in `sessionDir`. Groups only by default (`include: "all"` for DMs too). |

### WhatsApp honesty note

There is no official WhatsApp API for *reading* existing community group
messages — Baileys is the standard unofficial client (the same mechanism as
WhatsApp Web). It works, it's widely used, and it's ToS-grey: the account can
theoretically be banned. It lives in its own optional package so nothing else
in Community OS carries that risk.

The official alternative is `whatsappCloud` (below): Meta's Cloud API webhooks.
It covers inbound messages to a business number and the new Groups API — but
Groups API requires an Official Business Account, is invite-only, and caps
groups at **8 participants**, so it can't listen to real community groups.
Self-hosted gateways like Evolution API or WAHA also work — run one and point
its webhook at `jsonWebhook` or `POST /v1/ingest`.

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
