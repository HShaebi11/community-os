import { describe, expect, it } from "vitest";
import {
  assignPublicSlug,
  createProposalFromDemand,
  exportWorkspace,
  goLive,
  ingestMessages,
  refreshMemory,
  rsvp,
  setProposalStatus,
} from "./kernel.ts";
import { MemoryStore } from "./memory-store.ts";
import type { EventRecord, NormalizedMessage } from "./types.ts";

const msg = (id: string, author = "Ada", body = "hello"): NormalizedMessage => ({
  id,
  author,
  body,
  sentAt: "2025-06-01T12:00:00.000Z",
});

/** Live event whose proposal is bound to a venue with the given capacity. */
async function liveEvent(store: MemoryStore, venueCapacity: number | null): Promise<EventRecord> {
  const w = await store.createWorkspace({ name: "W", createdBy: "l" });
  const venue = await store.upsertVenue({
    id: "v1",
    communityId: w.id,
    name: "Hall",
    area: null,
    capacity: venueCapacity,
    contact: null,
  });
  await ingestMessages(store, w.id, { kind: "whatsapp", name: "t" }, [
    msg("1", "Ada", "i want a bread workshop"),
  ]);
  await refreshMemory(store, w.id);
  const demand = (await store.listDemands(w.id))[0];
  const pack = await createProposalFromDemand(store, w.id, demand.id);
  await store.updateProposal(pack.id, { venueId: venue.id });
  await setProposalStatus(store, pack.id, "approved");
  return goLive(store, pack.id, "https://os.test");
}

describe("cross-source dedupe — platform ids are only unique per source", () => {
  it("slack '1' and discord '1' in the same workspace are two different messages", async () => {
    const store = new MemoryStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "l" });
    const a = await ingestMessages(store, w.id, { kind: "slack", name: "#a" }, [msg("1", "Ada")]);
    const b = await ingestMessages(store, w.id, { kind: "discord", name: "#b" }, [msg("1", "Grace", "from discord")]);
    expect(a.inserted + b.inserted).toBe(2);
    const list = await store.listMessages(w.id);
    expect(list).toHaveLength(2);
    expect(new Set(list.map((m) => m.body))).toEqual(new Set(["hello", "from discord"]));
  });

  it("replay through the SAME source still dedupes", async () => {
    const store = new MemoryStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "l" });
    await ingestMessages(store, w.id, { kind: "slack", name: "#a" }, [msg("1")]);
    const again = await ingestMessages(store, w.id, { kind: "slack", name: "#a" }, [msg("1")]);
    expect(again.inserted).toBe(0);
    expect(again.skipped).toBe(1);
  });
});

describe("member resolution — padded names", () => {
  it("' Ada ' and 'Ada' resolve to one member", async () => {
    const store = new MemoryStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "l" });
    await ingestMessages(store, w.id, { kind: "native", name: "t" }, [msg("1", "Ada"), msg("2", "  Ada  ")]);
    expect(await store.listMembers(w.id)).toHaveLength(1);
    expect(await store.listMessages(w.id)).toHaveLength(2);
  });
});

describe("rsvp vs venue capacity", () => {
  it("rejects new guests once the venue is full; existing guests may still update", async () => {
    const store = new MemoryStore();
    const event = await liveEvent(store, 1);
    const g1 = await rsvp(store, event.slug, { name: "First", email: "first@x.com" });
    await expect(rsvp(store, event.slug, { name: "Second", email: "second@x.com" })).rejects.toThrow(/capacity/i);
    // Correcting a name is not a new seat.
    const again = await rsvp(store, event.slug, { name: "First Person", email: "FIRST@x.com" });
    expect(again.id).toBe(g1.id);
    expect(await store.listGuests(event.id)).toHaveLength(1);
  });

  it("enforces capacity under concurrent RSVPs — check-then-act must not oversell", async () => {
    const store = new MemoryStore();
    const event = await liveEvent(store, 1);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => rsvp(store, event.slug, { name: `R${i}`, email: `r${i}@x.com` })),
    );
    const seats = results.filter((r) => r.status === "fulfilled").length;
    expect(seats).toBe(1);
    expect(await store.listGuests(event.id)).toHaveLength(1);
  });

  it("serializes concurrent assignPublicSlug calls — one base slug, one suffixed claim", async () => {
    const store = new MemoryStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "l" });
    // Distinct names that slugify identically → both racers compute the
    // same base slug.
    const a = await store.upsertMember(w.id, "Ada Lane", null);
    const b = await store.upsertMember(w.id, "ada-lane", null);
    expect(a.id).not.toBe(b.id);
    const [slugA, slugB] = await Promise.all([assignPublicSlug(store, a.id), assignPublicSlug(store, b.id)]);
    expect(slugA).not.toBe(slugB);
    const claims = new Set([slugA, slugB]);
    expect(claims).toContain("ada-lane");
    expect([...claims].find((s) => s !== "ada-lane")).toMatch(/^ada-lane-[0-9a-f]{6}$/);
    // Idempotent: a second run returns the already-claimed slug.
    expect(await assignPublicSlug(store, a.id)).toBe(slugA);
    expect(await assignPublicSlug(store, b.id)).toBe(slugB);
    // Both claims resolve to distinct members.
    expect((await store.getMember(a.id))!.publicSlug).toBe(slugA);
    expect((await store.getMember(b.id))!.publicSlug).toBe(slugB);
  });

  it("null capacity means unlimited; zero means closed", async () => {
    const store = new MemoryStore();
    const open = await liveEvent(store, null);
    for (let i = 0; i < 5; i++) await rsvp(store, open.slug, { name: `G${i}`, email: `g${i}@x.com` });
    expect(await store.listGuests(open.id)).toHaveLength(5);
    const closed = await liveEvent(store, 0);
    await expect(rsvp(store, closed.slug, { name: "G", email: "g@x.com" })).rejects.toThrow(/capacity/i);
  });

  it("an event with no venue has no cap", async () => {
    const store = new MemoryStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "l" });
    await ingestMessages(store, w.id, { kind: "whatsapp", name: "t" }, [msg("1", "Ada", "i want a bread workshop")]);
    await refreshMemory(store, w.id);
    const demand = (await store.listDemands(w.id))[0];
    const pack = await createProposalFromDemand(store, w.id, demand.id);
    await setProposalStatus(store, pack.id, "approved");
    const event = await goLive(store, pack.id, "https://os.test");
    for (let i = 0; i < 20; i++) await rsvp(store, event.slug, { name: `G${i}`, email: `g${i}@x.com` });
    expect(await store.listGuests(event.id)).toHaveLength(20);
  });
});

describe("public slug collisions", () => {
  it("a slug held by an opted-OUT member still blocks reuse when they opt back in", async () => {
    const store = new MemoryStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "l" });
    const a = await store.upsertMember(w.id, "Ada", null);
    const slugA = await assignPublicSlug(store, a.id);
    expect(slugA).toBe("ada");
    await store.updateMember(a.id, { publicOptIn: true }, true);
    await store.updateMember(a.id, { publicOptIn: false }, true);
    // A *different* person whose name slugs the same — alias matching won't
    // collapse them ("Ada!" isn't "Ada"), but slugify("Ada!") === "ada".
    const b = await store.upsertMember(w.id, "Ada!", null);
    expect(b.id).not.toBe(a.id);
    const slugB = await assignPublicSlug(store, b.id);
    expect(slugB).not.toBe("ada");
    await store.updateMember(b.id, { publicOptIn: true }, true);
    await store.updateMember(a.id, { publicOptIn: true }, true);
    // Both public now — each slug still resolves to exactly one member.
    expect((await store.getMemberByPublicSlug(slugA))?.id).toBe(a.id);
    expect((await store.getMemberByPublicSlug(slugB))?.id).toBe(b.id);
  });
});

describe("idempotency + export integrity", () => {
  it("refreshMemory is idempotent — citations and demands do not duplicate on rerun", async () => {
    const store = new MemoryStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "l" });
    await ingestMessages(store, w.id, { kind: "whatsapp", name: "t" }, [
      msg("1", "Ada", "i'm a baker, i want a bread workshop"),
    ]);
    const first = await refreshMemory(store, w.id);
    const citationsAfterFirst = (await store.listCitations(w.id)).length;
    const second = await refreshMemory(store, w.id);
    expect(second.demands).toHaveLength(first.demands.length);
    expect((await store.listCitations(w.id)).length).toBe(citationsAfterFirst);
    await refreshMemory(store, w.id);
    expect((await store.listCitations(w.id)).length).toBe(citationsAfterFirst);
    expect(second.members).toHaveLength(first.members.length);
  });

  it("export carries message metadata but never a body field", async () => {
    const store = new MemoryStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "l" });
    await ingestMessages(store, w.id, { kind: "native", name: "t" }, [msg("1", "Ada", "secret body text")]);
    const out = await exportWorkspace(store, w.id);
    for (const m of out.messages) {
      expect(m).not.toHaveProperty("body");
      expect(m.sourceMessageId).toBe("1");
      expect(m.authorRaw).toBe("Ada");
    }
    // Nothing anywhere in the export contains the body text.
    expect(JSON.stringify(out)).not.toContain("secret body text");
  });
});
