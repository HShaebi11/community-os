/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Determinism audits — the suite must be independent of wall clock, insertion
 * order, and concurrency. These tests freeze time, shuffle order, and race
 * ingests, so regressions in determinism are caught here rather than in CI
 * flakes elsewhere.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import * as fc from "fast-check";
import { ingestMessages, refreshMemory, exportWorkspace } from "./kernel.ts";
import { MemoryStore } from "./memory-store.ts";
import { createApp } from "../../server/src/index.ts";

const SRC = { kind: "native" as const, name: "soak" };
const MSG = (id: string, author = "Ada", sentAt = "2025-01-01T10:00:00.000Z") => ({
  id,
  author,
  authorId: author.toLowerCase(),
  body: "i want a bread workshop",
  sentAt,
});

async function seedWs(store: MemoryStore) {
  const ws = await store.createWorkspace({ name: "Soak", createdBy: "t" });
  return ws.id;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("frozen clock", () => {
  it("export payload is identical when run at the same frozen instant", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T12:00:00.000Z"));

    const build = async () => {
      const store = new MemoryStore();
      const ws = await seedWs(store);
      await ingestMessages(store, ws, SRC, [MSG("m1"), MSG("m2", "Bo")]);
      await refreshMemory(store, ws);
      // UUIDs are generated — assert everything except generated ids is identical.
      return JSON.stringify(await exportWorkspace(store, ws)).replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
        "<uuid>",
      );
    };

    expect(await build()).toEqual(await build());
  });

  it("demands extracted under different frozen times have identical content", async () => {
    const run = async (iso: string) => {
      vi.setSystemTime(new Date(iso));
      const store = new MemoryStore();
      const ws = await seedWs(store);
      await ingestMessages(store, ws, SRC, [MSG("m1"), MSG("m2", "Bo"), MSG("m3", "Cy")]);
      return (await refreshMemory(store, ws)).demands.map((d) => ({ topic: d.topic, members: d.memberIds.length }));
    };

    vi.useFakeTimers();
    const a = await run("2030-01-01T00:00:00.000Z");
    const b = await run("1999-12-31T23:59:59.000Z");
    expect(a).toEqual(b);
  });
});

describe("order independence", () => {
  it("any permutation of the same batch lands the same members, messages, demands", () => {
    const bodies = fc.uniqueArray(
      fc.record({
        id: fc.stringMatching(/^[a-z0-9]{1,10}$/),
        author: fc.constantFrom("Ada", "Bo", "Cy", "Di", "Ev"),
        body: fc.constantFrom("i want a bread workshop", "lets do a meetup", "film night please", "bread!", "hackathon?"),
        sentAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2026-01-01"), noInvalidDate: true }).map((d) => d.toISOString()),
      }),
      { minLength: 5, maxLength: 40, selector: (m) => m.id },
    );
    // Same list, permuted — dedupe is first-wins on (sourceId, sourceMessageId),
    // so order-independence must be tested on a set with unique platform ids.
    const permKeys = fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 40, maxLength: 40 });
    return fc.assert(
      fc.asyncProperty(bodies, permKeys, async (combined, keys) => {
        const shuffled = combined
          .map((m, i) => ({ m, k: keys[i] ?? i }))
          .sort((a, b) => a.k - b.k)
          .map((x) => x.m);
        const [s1, s2] = [new MemoryStore(), new MemoryStore()];
        const w1 = await seedWs(s1);
        const w2 = await seedWs(s2);
        await ingestMessages(s1, w1, SRC, combined);
        await ingestMessages(s2, w2, SRC, shuffled);
        await refreshMemory(s1, w1);
        await refreshMemory(s2, w2);
        const pick = (ms: any[]) => ms.map((m) => `${m.sourceMessageId}|${m.authorRaw}|${m.body}`).sort();
        expect(pick(await s2.listMessages(w2))).toEqual(pick(await s1.listMessages(w1)));
        expect((await s2.listMembers(w2)).map((m) => m.displayName).sort()).toEqual(
          (await s1.listMembers(w1)).map((m) => m.displayName).sort(),
        );
        expect((await s2.listDemands(w2)).map((d) => `${d.topic}|${d.memberIds.length}`).sort()).toEqual(
          (await s1.listDemands(w1)).map((d) => `${d.topic}|${d.memberIds.length}`).sort(),
        );
      }),
      { numRuns: 30 },
    );
  });
});

describe("concurrency soak", () => {
  it("N concurrent ingests over an id pool store exactly the unique set", () => {
    return fc.assert(
      fc.asyncProperty(fc.integer({ min: 5, max: 30 }), fc.integer({ min: 2, max: 10 }), async (pool, concurrency) => {
        const app = createApp(new MemoryStore());
        const ws = await app.request("/v1/workspaces", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Race" }),
        });
        const { id } = (await ws.json()) as { id: string };
        await Promise.all(
          Array.from({ length: concurrency }, (_, i) =>
            app.request("/v1/ingest", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                communityId: id,
                source: { kind: "native", name: `race-${i}` },
                messages: Array.from({ length: pool }, (_, j) => MSG(`shared-${j}`)),
              }),
            }),
          ),
        );
        const res = await app.request(`/v1/workspaces/${id}/messages`);
        const msgs = (await res.json()) as any[];
        // `pool` unique ids × `concurrency` distinct sources — nothing lost, nothing duplicated
        expect(msgs).toHaveLength(pool * concurrency);
        expect(new Set(msgs.map((m) => `${m.sourceId}:${m.sourceMessageId}`)).size).toBe(pool * concurrency);
      }),
      { numRuns: 15 },
    );
  });

  it("concurrent refreshMemory calls are idempotent", async () => {
    const store = new MemoryStore();
    const ws = await seedWs(store);
    await ingestMessages(store, ws, SRC, [MSG("a"), MSG("b", "Bo"), MSG("c", "Cy")]);
    const [r1, r2, r3] = await Promise.all([refreshMemory(store, ws), refreshMemory(store, ws), refreshMemory(store, ws)]);
    const demands = await store.listDemands(ws);
    expect(r1.demands.length).toBe(r2.demands.length);
    expect(r2.demands.length).toBe(r3.demands.length);
    expect(demands.length).toBe(r1.demands.length);
  });
});
