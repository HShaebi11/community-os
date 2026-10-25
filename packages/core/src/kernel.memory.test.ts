import { describe, expect, it } from "vitest";
import { message, normalizedMessage } from "@community-os/testkit";
import { briefing, ingestMessages, memberCard, refreshMemory } from "./kernel.ts";
import { MemoryStore } from "./memory-store.ts";

const store = () => new MemoryStore();
const ws = async (s: MemoryStore) => (await s.createWorkspace({ name: "W", createdBy: "lead" })).id;

async function seedChat(s: MemoryStore, cid: string, msgs: Array<{ author: string; body: string; id?: string }>) {
  await ingestMessages(
    s,
    cid,
    { kind: "whatsapp", name: "t" },
    msgs.map((m, i) => normalizedMessage({ id: `m${i}`, ...m })),
  );
}

describe("refreshMemory", () => {
  it("extracts do/want/offer onto member cards with citations", async () => {
    const s = store();
    const cid = await ws(s);
    await seedChat(s, cid, [
      { author: "Ada", body: "i'm a baker, i work with dough" },
      { author: "Ada", body: "i want a bread workshop" },
      { author: "Lin", body: "i can host at my studio" },
    ]);
    await refreshMemory(s, cid);
    const ada = (await s.listMembers(cid)).find((m) => m.displayName === "Ada")!;
    expect(ada.do).toContain("baker");
    expect(ada.want).toContain("bread workshop");
    const lin = (await s.listMembers(cid)).find((m) => m.displayName === "Lin")!;
    expect(lin.offer).toContain("studio");
    const citations = await s.listCitations(cid, "member", ada.id);
    expect(citations.length).toBeGreaterThanOrEqual(2);
    expect(citations.every((c) => c.objectType === "member")).toBe(true);
  });

  it("does not duplicate citations on a second refresh", async () => {
    const s = store();
    const cid = await ws(s);
    await seedChat(s, cid, [{ author: "Ada", body: "i want a bread workshop" }]);
    await refreshMemory(s, cid);
    const first = (await s.listCitations(cid)).length;
    await refreshMemory(s, cid);
    expect((await s.listCitations(cid)).length).toBe(first);
  });

  it("never overwrites a lead-locked field", async () => {
    const s = store();
    const cid = await ws(s);
    await seedChat(s, cid, [{ author: "Ada", body: "i want a bread workshop" }]);
    const ada = (await s.listMembers(cid))[0];
    await s.updateMember(ada.id, { want: "lead-curated want" }, true);
    await refreshMemory(s, cid);
    expect((await s.getMember(ada.id))!.want).toBe("lead-curated want");
  });

  it("skips noise messages when extracting", async () => {
    const s = store();
    const cid = await ws(s);
    await seedChat(s, cid, [
      { author: "Ada", body: "lol" },
      { author: "Ada", body: "i want a bread workshop" },
    ]);
    await refreshMemory(s, cid);
    const ada = (await s.listMembers(cid))[0];
    expect(ada.want).toContain("bread workshop");
    const citations = await s.listCitations(cid);
    const msgs = await s.listMessages(cid);
    expect(citations.every((c) => msgs.find((m) => m.id === c.messageId)!.isNoise === false)).toBe(true);
  });

  it("extracts urls into resources", async () => {
    const s = store();
    const cid = await ws(s);
    await seedChat(s, cid, [{ author: "Ada", body: "check this https://bakers.example.com/signup for the workshop" }]);
    const { resources } = await refreshMemory(s, cid);
    expect(resources).toHaveLength(1);
    expect(resources[0].url).toBe("https://bakers.example.com/signup");
    expect(resources[0].messageId).toBeTruthy();
  });

  it("creates demands from want-topics with citations, merging repeated topics", async () => {
    const s = store();
    const cid = await ws(s);
    await seedChat(s, cid, [
      { author: "Ada", body: "i want a bread workshop" },
      { author: "Lin", body: "i want a bread workshop" },
    ]);
    const { demands } = await refreshMemory(s, cid);
    const bread = demands.find((d) => d.topic.includes("workshop"))!;
    expect(bread.memberIds).toHaveLength(2);
    const citations = await s.listCitations(cid, "demand", bread.id);
    expect(citations.length).toBeGreaterThanOrEqual(2);
  });

  it("emits a memory timeline event with counts", async () => {
    const s = store();
    const cid = await ws(s);
    await seedChat(s, cid, [{ author: "Ada", body: "i want a bread workshop" }]);
    await refreshMemory(s, cid);
    const memory = (await s.listTimeline(cid)).find((t) => t.kind === "memory");
    expect(memory).toBeTruthy();
    expect(memory!.payload).toMatchObject({ members: 1, demands: 1 });
  });

  it("ignores stored messages that carry no memberId", async () => {
    const s = store();
    const cid = await ws(s);
    const src = await s.createSource({ communityId: cid, kind: "native", name: "t" });
    // Raw insert with memberId null — reachable via adapters/importers that
    // attach members lazily. refreshMemory must not credit or extract from it.
    await s.insertMessages([
      message({ communityId: cid, sourceId: src.id, memberId: null, body: "i want a bread workshop see https://tools.example.com" }),
    ]);
    await refreshMemory(s, cid);
    expect(await s.listDemands(cid)).toHaveLength(0);
    expect(await s.listResources(cid)).toHaveLength(0);
  });

  it("resource titles strip the protocol and cap at 80 chars", async () => {
    const s = store();
    const cid = await ws(s);
    await seedChat(s, cid, [
      { author: "Ada", body: `check https://very-long-domain-name.example.com/${"segment/".repeat(12)} for details` },
    ]);
    await refreshMemory(s, cid);
    const res = await s.listResources(cid);
    expect(res).toHaveLength(1);
    expect(res[0].title.startsWith("http")).toBe(false);
    expect(res[0].title.length).toBeLessThanOrEqual(80);
  });

  it("never nulls an existing member field when re-extracting finds nothing", async () => {
    const s = store();
    const cid = await ws(s);
    await seedChat(s, cid, [{ author: "Ada", body: "i want a bread workshop" }]);
    await refreshMemory(s, cid);
    const ada = (await s.listMembers(cid))[0];
    await s.updateMember(ada.id, { do: "baker" });
    // A second refresh over messages that yield no 'do' must leave 'baker' —
    // patch fields are only written when extraction produces a value.
    await refreshMemory(s, cid);
    expect((await s.listMembers(cid))[0].do).toBe("baker");
  });
});

describe("briefing", () => {
  it("summarizes people, messages, top demands and next events", async () => {
    const s = store();
    const cid = await ws(s);
    await seedChat(s, cid, [
      { author: "Ada", body: "i want a bread workshop" },
      { author: "Lin", body: "i want a design meetup" },
    ]);
    await refreshMemory(s, cid);
    const brief = await briefing(s, cid);
    expect(brief.people).toBe(2);
    expect(brief.messages).toBe(2);
    expect(brief.topDemands.length).toBeGreaterThanOrEqual(1);
    expect(brief.topDemands[0].title).toBeTruthy();
    expect(brief.topDemands[0].oneLiner).toContain("members");
  });
});

describe("memberCard", () => {
  it("returns the member with their citations", async () => {
    const s = store();
    const cid = await ws(s);
    await seedChat(s, cid, [{ author: "Ada", body: "i want a bread workshop" }]);
    await refreshMemory(s, cid);
    const ada = (await s.listMembers(cid))[0];
    const card = await memberCard(s, ada.id);
    expect(card.displayName).toBe("Ada");
    expect(card.citations.length).toBeGreaterThanOrEqual(1);
  });

  it("throws on an unknown member id", async () => {
    await expect(memberCard(store(), "nope")).rejects.toThrow("member not found");
  });
});
