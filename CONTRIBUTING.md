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
npm run coverage     # coverage + enforced thresholds (vitest.config.ts per workspace)
npm run dev:app      # API :5173 + app :3002, in-memory store
```

### The test suite

Layers, bottom-up — put a test in the layer it exercises:

- **`@community-os/testkit`** (`packages/testkit`) — shared harnesses:
  `testStoreContract` (the executable Store contract), `FakeWebSocket`,
  fixtures, signing helpers, real-zip builders. Reuse before inventing.
- **Store adapters** must pass `testStoreContract` — that *is* the definition
  of "done" for `packages/store-*`. See `packages/core/src/store-contract.test.ts`
  and `packages/store-sqlite/src/index.test.ts`.
- **Kernel** domain suites live beside the kernel (`kernel.*.test.ts`);
  pure helpers (`extract`, `noise`, `match`, `qr`) have unit suites.
- **Server routes**: `packages/server/src/index.test.ts` — happy paths,
  validation, 404s, webhook signature delivery.
- **SDK**: `packages/sdk/src/parity.test.ts` runs the same domain suite on all
  three transports (remote/memory/sqlite). New SDK methods get a parity case.
- **Channel adapters**: lifecycle tests use `FakeWebSocket` / `vi.mock` —
  never a real socket.
- **e2e**: `apps/api/src/e2e.test.ts` — the full product loop over real HTTP
  and a real SQLite file.
- **Model-based conformance**: `packages/testkit/src/store-model.ts` +
  `model-commands.ts` drive randomized `fast-check` command sequences against
  every store adapter and diff observable state against a naive reference
  model. Failures shrink to minimal counterexamples — this is the highest
  bug-finding density in the suite; it caught the cross-source dedupe and
  event-slug collisions.
- **Determinism**: `kernel.determinism.test.ts` freezes the clock, permutes
  batches, and races concurrent ingests. CI also runs suites under
  `--sequence.shuffle`; everything must pass under any timezone (`TZ` leg).
- **Spec drift**: `packages/server/src/spec-drift.test.ts` fails if a route
  exists without an `openapi.yaml` entry, or vice versa — plus a never-500
  matrix over every documented route.
- **Dist smoke**: `npm run test:dist` builds the publishable packages and runs
  the golden path against **built artifacts** — source-level tests can't see
  bundling mistakes (e.g. a `node:` prefix being rewritten).
- **Golden snapshots**: `golden.test.ts` pins generated product text
  (proposals, outreach, run sheets, newsletters) and the QR SVG — byte-level
  regression detection for anything user-facing.
- **Mutation**: `npm run test:mutation` (Stryker, gated at 80% score) verifies
  the suite actually *asserts* — survivors mean missing assertions, not just
  uncovered lines. Runs weekly + on-demand in CI, not on the PR path.

Coverage thresholds are enforced per workspace (`vitest.config.ts`) — seeded
at current levels and meant to ratchet upward, never down. If a change makes
you lower a threshold, that's a conversation to have in the PR, not a fix.
Type-only files (barrels, `types.ts`, compile-time drift guards) are excluded
per-package with a comment explaining why — do not exclude business logic.

- With a `DATABASE_URL`, `npm run db:push` syncs the Drizzle schema.
- Match the existing style: compact, typed, no speculative abstractions.

## Docs are part of the change

If you add, rename, or remove a route, update `docs/API.md` in the same
commit — it is a contract document, not marketing.
