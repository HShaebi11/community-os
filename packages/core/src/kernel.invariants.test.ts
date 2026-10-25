import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ingestMessages, assignPublicSlug } from "./kernel.ts";
import { slugify } from "./ids.ts";
import { MemoryStore } from "./memory-store.ts";
import type { NormalizedMessage } from "./types.ts";

/**
 * Property-based invariants (fast-check): each test asserts a property over
 * randomly generated inputs. On failure, fast-check shrinks the input to the
 * minimal counterexample and prints a replay seed + path, so every failure is
 * reproducible — set `fc.assert(prop, { seed })` to replay it verbatim.
 *
 * Contrast with kernel.edge.test.ts, which pins specific hand-picked cases.
 */

const VALID_ENTRY = (m: { id?: unknown; author?: unknown; body?: unknown }) =>
  typeof m.id === "string" &&
  m.id !== "" &&
  typeof m.author === "string" &&
  m.author.trim() !== "" &&
  typeof m.body === "string";

describe("invariants — properties that must hold for ANY input", () => {
  it("ingest: any batch nets exactly its unique message ids", async () => {
    // Random ids with collisions drawn at arbitrary positions/shuffles.
    const batchArb = fc
      .uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 1, maxLength: 25 })
      .chain((ids) => fc.array(fc.constantFrom(...ids), { maxLength: 60 }))
      .map((ids) => ids.map((id) => ({ id, author: "a", body: "b", sentAt: "2025-01-01T00:00:00.000Z" })));
    await fc.assert(
      fc.asyncProperty(batchArb, async (batch) => {
        const store = new MemoryStore();
        const w = await store.createWorkspace({ name: "W", createdBy: "l" });
        const res = await ingestMessages(store, w.id, { kind: "native", name: "t" }, batch);
        const unique = new Set(batch.map((m) => m.id));
        expect(res.inserted).toBe(unique.size);
        expect(res.skipped).toBe(batch.length - unique.size);
        expect(await store.listMessages(w.id)).toHaveLength(unique.size);
      }),
      { numRuns: 30 },
    );
  });

  it("listMessages is always sentAt-sorted regardless of insertion order", async () => {
    const batchArb = fc
      .array(fc.date({ min: new Date("2024-01-01"), max: new Date("2026-12-31") }), { minLength: 1, maxLength: 60 })
      .map((dates) => dates.map((d, i) => ({ id: `m${i}`, author: "a", body: `b${i}`, sentAt: d.toISOString() })));
    await fc.assert(
      fc.asyncProperty(batchArb, async (batch) => {
        const store = new MemoryStore();
        const w = await store.createWorkspace({ name: "W", createdBy: "l" });
        await ingestMessages(store, w.id, { kind: "native", name: "t" }, batch);
        const list = await store.listMessages(w.id);
        const sorted = [...list].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
        expect(list.map((m) => m.id)).toEqual(sorted.map((m) => m.id));
      }),
      { numRuns: 20 },
    );
  });

  it("malformed fuzz: arbitrary junk never crashes ingest and only valid entries store", async () => {
    const junkArb = fc.array(fc.anything(), { maxLength: 120 });
    await fc.assert(
      fc.asyncProperty(junkArb, async (junk) => {
        const store = new MemoryStore();
        const w = await store.createWorkspace({ name: "W", createdBy: "l" });
        const batch = junk as NormalizedMessage[];
        const res = await ingestMessages(store, w.id, { kind: "native", name: "t" }, batch);
        const expected = batch.filter(
          (m): m is NormalizedMessage => typeof m === "object" && m !== null && VALID_ENTRY(m as { id?: unknown }),
        );
        expect(res.inserted).toBe(new Set(expected.map((m) => m.id)).size);
        expect(await store.listMessages(w.id)).toHaveLength(new Set(expected.map((m) => m.id)).size);
      }),
      { numRuns: 25 },
    );
  });

  it("slugs: arbitrary names produce non-empty, unique public slugs per distinct member", async () => {
    const namesArb = fc.array(fc.string({ maxLength: 24 }), { minLength: 1, maxLength: 40 });
    await fc.assert(
      fc.asyncProperty(namesArb, async (names) => {
        const store = new MemoryStore();
        const w = await store.createWorkspace({ name: "W", createdBy: "l" });
        const slugs = new Map<string, string>(); // member id -> slug
        for (const [i, name] of names.entries()) {
          const member = await store.upsertMember(w.id, name || `m${i}`, null);
          const slug = await assignPublicSlug(store, member.id);
          expect(slug).toBeTruthy();
          // Re-slugging an existing member is idempotent; distinct members
          // must never share a slug.
          const prior = slugs.get(member.id);
          if (prior !== undefined) {
            expect(slug).toBe(prior);
          } else {
            expect([...slugs.values()]).not.toContain(slug);
            slugs.set(member.id, slug);
          }
        }
      }),
      { numRuns: 15 },
    );
  });

  it("slugify: any string produces a URL-safe, length-capped, non-empty slug", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (name) => {
        const slug = slugify(name);
        expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(slug.length).toBeLessThanOrEqual(48);
      }),
      { numRuns: 200 },
    );
  });
});
