# @community-os/sdk

Community OS as a library. One package, two ways to run:

- **Remote** — typed client for a deployed Community OS API.
- **Embedded** — `CommunityOS.memory()` runs the entire kernel in-process on an
  in-memory store. No server, no database, no auth. The same method surface
  either way.

```bash
npm i @community-os/sdk
```

Requires Node 20+ (or any runtime with `fetch` + `crypto.subtle`).

## Embedded mode

Everything works without a server:

```ts
import { CommunityOS } from "@community-os/sdk";

const cos = CommunityOS.memory();

const ws = await cos.createWorkspace({ name: "Weird Stuff" });
await cos.importChat(ws.id, chatExportText, "_chat.txt"); // string, bytes, Blob, or .zip
const { members, demands } = await cos.refreshMemory(ws.id);
const pack = await cos.createProposal(ws.id, demands[0].id);
await cos.approveProposal(pack.id);
const event = await cos.goLive(pack.id);
await cos.rsvp(event.slug, { name: "Ada", email: "ada@test.dev" });
```

Volatile — state lives until the process exits. Great for tests, scripts,
prototypes, and agents. Persist with `exportWorkspace(ws.id)`, or run the API
if you need durability.

## Remote mode

Point it at any deployed Community OS API:

```ts
const cos = new CommunityOS({
  baseUrl: "http://localhost:5173",
  publicOrigin: "https://community.example.com", // optional; sent as X-Public-Origin
  fetch: customFetch,                            // optional
});
```

No API key — the open core is unauthenticated by design (single trusted
operator per deployment; put network auth in front of anything exposed).

## Surface

Workspaces (`createWorkspace`, `listWorkspaces`, `getWorkspace`,
`getWorkspaceBySlug`, `updateWorkspace`) · evidence (`importChat`,
`ingestDiscord`, `listMessages`, `listFiles`, `listTimeline`,
`exportWorkspace`) · memory (`refreshMemory`, `listMembers`, `getMember`,
`updateMember`, `briefing`, `listDemands`, `getDemand`, `listResources`,
`search`) · proposals → events (`createProposal`, `getProposal`,
`approveProposal`, `draftOutreach`, `goLive`, `listEvents`, `getEventChain`,
`listGuests`, `autopilot`) · public front door (`publicCommunity`,
`publicEvent`, `publicMember`, `rsvp`) · gatekeeper (`submitApplication`,
`listApplications`, `addBlocklist`) · webhooks (`createWebhook`, `listWebhooks`,
`deleteWebhook`).

Errors throw `ApiError` with `.status` — embedded mode mirrors the remote
API's status codes (404 for missing records, 400 for domain errors).

## Webhook verification

```ts
import { verifyWebhookSignature } from "@community-os/sdk";

const ok = await verifyWebhookSignature(rawBody, req.headers["x-communityos-signature"], "whsec_…");
```

Subscriptions are created with `createWebhook` — the `whsec_` secret is shown
once. Deliveries are `POST`ed as `{ id, kind, workspaceId, occurredAt, data }`
with `X-CommunityOS-Signature: sha256=<hmac>`. Embedded mode registers
subscriptions but does not deliver — delivery is a server concern.

## Notes

- Drafts only: `draftOutreach` returns text for a human to send. The SDK will
  never ship a `send` — that's the product's design.
- The public front-door methods only ever return opted-in data.

MIT · part of the [Community OS](https://github.com/HShaebi11/community-os) monorepo.
