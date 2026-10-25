# Contributing

Community OS is the open core — deliberately no authentication. Before
contributing, read [`docs/PRODUCT.md`](docs/PRODUCT.md) (what this is),
[`docs/MAP.md`](docs/MAP.md) (repo map), and [`docs/API.md`](docs/API.md)
(the API contract).

## Ground rules

- **No auth in the core.** No users, sessions, tokens, or role checks. The
  model is one trusted operator per deployment. A hosted edition layers auth
  on top as a fork — keep the kernel ignorant of identity.
- **The API is the product.** `apps/app` and `apps/mcp` are clients of `/v1`.
  New capability lands as a route first, then a client.
- **Humans send; the system drafts.** There is intentionally no
  `send_message` or post-to-chat route, in `/v1` or MCP.
- **Public means opted-in.** `/v1/public/*` exposes only published events and
  members who set `publicOptIn`. Never leak message bodies, emails, or `want`.
- **Append-only evidence.** Messages are deduplicated and never mutated;
  operator edits lock fields via `leadLockedFields`, they don't rewrite
  history.

## Workflow

```sh
npm install
npm run validate     # tests + typecheck — must be green before you PR
npm run dev:app      # API :5173 + app :3002, in-memory store
```

- Tests are `vitest`: API tests construct a `MemoryStore` and call routes
  directly (`apps/api/src/app.test.ts`); `kernel-loop.test.ts` encodes the
  whole product loop and is the canonical "did I break it" check.
- With a `DATABASE_URL`, `npm run db:push` syncs the Drizzle schema.
- Match the existing style: compact, typed, no speculative abstractions.

## Docs are part of the change

If you add, rename, or remove a route, update `docs/API.md` in the same
commit — it is a contract document, not marketing.
