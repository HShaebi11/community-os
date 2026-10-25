# Phase A — spine

Tracker (Linear, team **Community OS**): [Phase A — spine](https://linear.app/interfaces-co/project/phase-a-spine-769425143aac)

Start here: [Linear: Start here](https://linear.app/interfaces-co/document/start-here-f280990e049f)

## North star

Give us one community habitat. We keep listening or syncing. We keep cited memory. Humans and agents use the same `/v1` functions. They own the event page and guest list. We never post in the chat.

**Phase A is done when** a real lead (not the maintainer) can: self-host → import or connect Discord → see cited cards and demand → go live (event URL, QR, RSVP) → guests in the workspace → point Cursor at `/mcp` (`search_memory` / `create_proposal` / `draft_message`, no send) → export and leave. They come back a week later; memory still matches the chat.

Until that is true, do not add gatekeeper, venues, Cognee, city directories, or auto-post.

## How we reach it

One pipe. One step at a time. Do not run Step 2 while Step 1 is open.

1. Kernel `/v1` — curl/CI: import → memory → proposal → go-live → RSVP → guests ([COS-1](https://linear.app/interfaces-co/issue/COS-1))
   - **1.1** Kernel loop test ([COS-6](https://linear.app/interfaces-co/issue/COS-6)) — parallel
   - **1.2** Lead edits win + citations ([COS-8](https://linear.app/interfaces-co/issue/COS-8)) — parallel
   - **1.3** Document existing `/v1` ([COS-9](https://linear.app/interfaces-co/issue/COS-9)) — parallel
   - **1.4** Export workspace JSON ([COS-7](https://linear.app/interfaces-co/issue/COS-7)) — solo (`app.ts`)
2. Desk playlist — `apps/app` is buttons on that API ([COS-2](https://linear.app/interfaces-co/issue/COS-2))
   - **2.1** Desk playlist gaps only ([COS-11](https://linear.app/interfaces-co/issue/COS-11))
3. MCP 1:1 then Code Mode on the same Worker ([COS-3](https://linear.app/interfaces-co/issue/COS-3))
   - **3.1** MCP 1:1 then Code Mode wrap ([COS-12](https://linear.app/interfaces-co/issue/COS-12))
4. Listen / WhatsApp sync ([COS-4](https://linear.app/interfaces-co/issue/COS-4))
5. First real community ([COS-5](https://linear.app/interfaces-co/issue/COS-5))

Dispatch agents only at **child** issues. Do not start Step 2 while Step 1 is open. Parallel now: 1.1, 1.2, 1.3. Solo now: 1.4.

## Docs in Linear

- [North star](https://linear.app/interfaces-co/document/north-star-aeb2048ae882)
- [Constitution](https://linear.app/interfaces-co/document/constitution-462ec5fa0341)
- [Phase A catalog](https://linear.app/interfaces-co/document/phase-a-catalog-every-issue-3aca268aea37)
- [How to dispatch agents](https://linear.app/interfaces-co/document/how-to-dispatch-agents-3b25a9c8128c)
- [Later (not now)](https://linear.app/interfaces-co/document/later-not-now-38fc74dcb7c0)

## Constitution (short)

`/v1` is the only brain. Desk, public pages, MCP, and Code Mode are clients. Evidence is append-only. Memory is cited; lead edits win. No desk-only logic. No `send_message`. Humans and agents get the same capabilities.
