# Building a hosted edition on top of the open core

This repo is deliberately auth-free: one deployment, one trusted operator.
A hosted product is a **separate layer on top** — never a change to the core.
This doc is the recipe for building it.

## The layering pattern

```
hosted repo (private)
├── auth middleware + accounts (Better Auth / Clerk / WorkOS)
├── membership + API-key store methods
├── billing (Stripe), email (Resend), media storage (R2/S3)
└── wraps ──▶ @community-os/* packages (this repo, unchanged)
```

`createApp(store)` returns a plain Hono app — mount it under middleware:

```ts
import { Hono } from "hono";
import { createApp, memoryStore } from "@community-os/api";   // or replicate createApp
import { createDrizzleStore } from "./drizzle-store.ts";        // core store + auth tables

const hosted = new Hono();
hosted.use("*", authMiddleware);          // resolve user → 401 if anonymous
hosted.use("/v1/workspaces/:id/*", requireMembership);  // org membership check
hosted.route("/", createApp(store));      // the entire open core, untouched
```

## Seams the open core already keeps for you

| Seam | Where | What it gives a hosted layer |
| --- | --- | --- |
| `LOCAL_IDENTITY` | `apps/api/src/app.ts` | Single constant where `createdBy`/`reporter` identity flows from — swap for the authenticated user id |
| `role: "owner"` shape | `listWorkspaces` responses | Clients already tolerate a role field; hosted layer fills it for real |
| `createdBy: string` | `workspaces` table | Just a string — store any user id |
| `c.set("store", store)` middleware | `app.ts` | Where per-request tenant context can attach |
| `AppOptions.deliverWebhook` | `app.ts` | Injectable delivery — hosted can add retry queues/logging |
| Published packages | npm `@community-os/*` | Hosted repo tracks core releases without forking code |

## Steps

1. **Publish the packages** (or use git deps for now):
   ```sh
   npm publish -w @community-os/core
   npm publish -w @community-os/whatsapp-import
   npm publish -w @community-os/sdk
   npm publish -w @community-os/mcp
   ```
2. **New private repo** `community-os-cloud` depending on those packages.
3. **Recover the auth implementation from git history** — it was deliberately
   removed here, not deleted from history:
   ```sh
   git log --all -- apps/api/src/auth.ts        # find the last commit that had it
   git show <commit>:apps/api/src/auth.ts        # lift it
   git show <commit>:packages/db/src/schema.ts   # Better Auth + membership tables
   ```
   The removed surface included: Better Auth at `/api/auth/*` (password, magic
   link, Google), org membership as workspace roles, `cos_` API tokens
   (`/v1/tokens`), dev auth, an email outbox, the account/invite/team pages.
4. **Hosted store**: wrap `createDrizzleStore` and add `upsertUser`,
   `membership(workspaceId, userId)`, token mint/list/revoke on top — as
   extension tables, not schema changes.
5. **App**: the deleted auth pages (`(auth)/`, `/account`, `/invite/[id]`,
   `/w/[slug]/settings/team`) live in git history under `apps/app/src/app/` —
   fork `apps/app` at that commit or restore selectively.
6. **Hosted-only infrastructure**: Stripe (billing), Resend (email), R2/S3
   (imported media — `memory://` file records need a real object store),
   rate limiting + abuse controls, custom domains for `/c/:slug` pages.
7. **Deploy**: API as a Workers paid deploy (`cf deploy`), Neon Postgres, the
   app on Vercel/Cloudflare. Put the MCP endpoint behind the same auth.

## What NOT to do

- Don't add auth to this repo behind env flags — it rots immediately and makes
  the open core worse for everyone.
- Don't change core types for hosted needs — extend tables in the hosted repo.
- Don't reintroduce `send_message` — drafts-only is the product's contract,
  hosted or not.
