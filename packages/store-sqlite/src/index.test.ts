import { describe, expect, it } from "vitest";
import { createId } from "@community-os/core";
import { SqliteStore } from "./index.ts";

// Contract-level checks — the semantics every Store implementation shares
// with MemoryStore. The full kernel loop over this store is exercised in the
// sdk test suite (CommunityOS.store(new SqliteStore())).

describe("SqliteStore", () => {
  it("dedupes messages by community + sourceMessageId", async () => {
    const s = new SqliteStore();
    const msg = {
      id: createId(),
      communityId: "c1",
      sourceId: "s1",
      sourceMessageId: "m1",
      authorRaw: "Ada",
      memberId: null,
      body: "hello",
      sentAt: "2025-01-01T00:00:00Z",
      isNoise: false,
    };
    expect(await s.insertMessages([msg])).toEqual({ inserted: 1, skipped: 0 });
    expect(await s.insertMessages([{ ...msg, id: createId() }])).toEqual({ inserted: 0, skipped: 1 });
    s.close();
  });

  it("upserts members on case-insensitive alias match, merging lastActive", async () => {
    const s = new SqliteStore();
    const a = await s.upsertMember("c1", "Ada", "2025-01-01T00:00:00Z");
    const b = await s.upsertMember("c1", "ada", "2025-02-01T00:00:00Z");
    expect(b.id).toBe(a.id);
    expect(b.lastActive).toBe("2025-02-01T00:00:00Z");
    expect((await s.listMembers("c1")).length).toBe(1);
    s.close();
  });

  it("updateMember respects lead locks for non-lead writes", async () => {
    const s = new SqliteStore();
    const m = await s.upsertMember("c1", "Ada", null);
    await s.updateMember(m.id, { do: "organizes" }, true); // lead write locks the field
    const after = await s.updateMember(m.id, { do: "something else" }, false); // non-lead blocked
    expect(after.do).toBe("organizes");
    s.close();
  });

  it("upsertDemand merges member/message ids on topic match", async () => {
    const s = new SqliteStore();
    await s.upsertDemand({
      id: createId(), communityId: "c1", topic: "coffee meetup", title: null, oneLiner: null,
      memberIds: ["m1"], messageIds: ["x1"], updatedAt: "2025-01-01T00:00:00Z",
    });
    const merged = await s.upsertDemand({
      id: createId(), communityId: "c1", topic: "coffee meetup", title: "Coffee", oneLiner: null,
      memberIds: ["m2"], messageIds: ["x2"], updatedAt: "2025-01-02T00:00:00Z",
    });
    expect(merged.memberIds.sort()).toEqual(["m1", "m2"]);
    expect(merged.title).toBe("Coffee");
    expect((await s.listDemands("c1")).length).toBe(1);
    s.close();
  });

  it("orders demands by crowd size then recency", async () => {
    const s = new SqliteStore();
    for (const [topic, ids] of [["small", ["m1"]], ["big", ["m1", "m2", "m3"]]] as const) {
      await s.upsertDemand({
        id: createId(), communityId: "c1", topic, title: null, oneLiner: null,
        memberIds: [...ids], messageIds: [], updatedAt: "2025-01-01T00:00:00Z",
      });
    }
    expect((await s.listDemands("c1"))[0]!.topic).toBe("big");
    s.close();
  });

  it("webhook delete reports existence", async () => {
    const s = new SqliteStore();
    const sub = await s.createWebhookSubscription({ communityId: "c1", url: "https://x.test", secret: "s", kinds: [] });
    expect(await s.deleteWebhookSubscription(sub.id)).toBe(true);
    expect(await s.deleteWebhookSubscription(sub.id)).toBe(false);
    s.close();
  });

  it("finds blocklist entries by hash", async () => {
    const s = new SqliteStore();
    await s.addBlocklist({ id: createId(), communityId: "c1", hash: "abc123", evidence: "spam", reporter: "op", confirmed: true });
    expect((await s.findBlocklist("c1", "abc123"))!.confirmed).toBe(true);
    expect(await s.findBlocklist("c1", "nope")).toBeNull();
    s.close();
  });
});
