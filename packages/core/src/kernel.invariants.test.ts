import { describe, expect, it } from "vitest";
import { ingestMessages, assignPublicSlug } from "./kernel.ts";
import { slugify } from "./ids.ts";
import { MemoryStore } from "./memory-store.ts";
import type { NormalizedMessage } from "./types.ts";

/** Deterministic RNG — same sequence every run, so failures reproduce. */
const rng = (seed = 42) => {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
};

describe("invariants — properties that must hold for ANY input", () => {
  it("ingest: a shuffled batch with duplicates nets exactly the unique ids", async () => {
    for (let trial = 0; trial < 5; trial++) {
      const rand = rng(trial * 7919 + 1);
      const store = new MemoryStore();
      const w = await store.createWorkspace({ name: "W", createdBy: "l" });
      const unique = Array.from({ length: 20 }, (_, i) => `id-${i}`);
      const batch: NormalizedMessage[] = [];
      for (const id of unique) batch.push({ id, author: "a", body: "b", sentAt: `2025-01-01T00:${String(Math.floor(rand() * 60)).padStart(2, "0")}:00Z` });
      // Inject duplicates at random positions — some repeated several times.
      for (let i = 0; i < 15; i++) batch.splice(Math.floor(rand() * batch.length), 0, { ...batch[Math.floor(rand() * batch.length)] });
      // Shuffle.
      for (let i = batch.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [batch[i], batch[j]] = [batch[j], batch[i]];
      }
      const res = await ingestMessages(store, w.id, { kind: "native", name: "t" }, batch);
      expect(res.inserted).toBe(unique.length);
      expect(res.skipped).toBe(batch.length - unique.length);
      expect(await store.listMessages(w.id)).toHaveLength(unique.length);
    }
  });

  it("listMessages is always sentAt-sorted regardless of insertion order", async () => {
    const rand = rng(7);
    const store = new MemoryStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "l" });
    const stamps = Array.from({ length: 50 }, (_, i) => `2025-0${1 + (i % 9)}-0${1 + (i % 9)}T${String(i % 24).padStart(2, "0")}:00:00Z`);
    const batch = stamps.map((sentAt, i) => ({ id: `m${i}`, author: "a", body: `b${i}`, sentAt }));
    for (let i = batch.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [batch[i], batch[j]] = [batch[j], batch[i]];
    }
    await ingestMessages(store, w.id, { kind: "native", name: "t" }, batch);
    const list = await store.listMessages(w.id);
    const sorted = [...list].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    expect(list.map((m) => m.id)).toEqual(sorted.map((m) => m.id));
  });

  it("malformed fuzz: arbitrary junk entries never crash ingest and never store", async () => {
    const rand = rng(99);
    const store = new MemoryStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "l" });
    const junk = Array.from({ length: 100 }, () => {
      const pick = rand();
      if (pick < 0.2) return { id: "", author: "x", body: "y", sentAt: "t" };
      if (pick < 0.4) return { id: `ok-${Math.floor(rand() * 1e5)}`, author: "   ", body: "b", sentAt: "t" };
      if (pick < 0.6) return { id: rand() * 1000, author: "n", body: "b", sentAt: "t" };
      if (pick < 0.8) return { id: `ok2-${Math.floor(rand() * 1e5)}`, author: "n" };
      return { author: "a", body: "b", sentAt: "t" };
    }) as unknown as NormalizedMessage[];
    const res = await ingestMessages(store, w.id, { kind: "native", name: "t" }, junk);
    // Only entries with a non-empty string id, non-blank author, and string body survive.
    const expected = junk.filter(
      (m) => typeof m.id === "string" && m.id && typeof m.author === "string" && m.author.trim() && typeof m.body === "string",
    );
    expect(res.inserted).toBe(expected.length);
    expect((await store.listMessages(w.id)).length).toBe(expected.length);
  });

  it("slugs: arbitrary names always produce non-empty, unique public slugs in a community", async () => {
    const rand = rng(1234);
    const store = new MemoryStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "l" });
    const alphabet = "ab!@#$%^&*()😀  __--\t";
    const slugs = new Set<string>();
    const membersSeen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const name = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => alphabet[Math.floor(rand() * alphabet.length)]).join("");
      const member = await store.upsertMember(w.id, name || `m${i}`, null);
      const slug = await assignPublicSlug(store, member.id);
      expect(slug).toBeTruthy();
      // Slugs are unique across DISTINCT members (upsertMember can return an
      // existing member for a repeated name — re-slugging it is idempotent).
      if (!membersSeen.has(member.id)) {
        expect(slugs.has(slug)).toBe(false);
        slugs.add(slug);
        membersSeen.add(member.id);
      } else {
        expect(slugs.has(slug)).toBe(true);
      }
      expect(slugify(name)).not.toBe("");
    }
  });
});
