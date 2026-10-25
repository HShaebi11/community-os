import { describe, expect, it } from "vitest";
import { normalizedMessage } from "@community-os/testkit";
import {
  createProposalFromDemand,
  eventChain,
  eventChainById,
  goLive,
  ingestMessages,
  makeOutreachDraft,
  openDemand,
  recordEventPageView,
  refreshMemory,
  rsvp,
  setProposalStatus,
} from "./kernel.ts";
import { MemoryStore } from "./memory-store.ts";

const ws = async (s: MemoryStore) => (await s.createWorkspace({ name: "Bread Town", createdBy: "lead" })).id;

/** Ingest wants → refresh → returns the community id with a live demand. */
async function seedWithDemand() {
  const s = new MemoryStore();
  const cid = await ws(s);
  await ingestMessages(s, cid, { kind: "whatsapp", name: "t" }, [
    normalizedMessage({ id: "1", author: "Ada", body: "i want a bread workshop" }),
    normalizedMessage({ id: "2", author: "Lin", body: "i want a bread workshop" }),
    normalizedMessage({ id: "3", author: "Grace", body: "i can host, i have a venue" }),
  ]);
  await refreshMemory(s, cid);
  const demand = (await s.listDemands(cid))[0];
  return { s, cid, demand };
}

describe("openDemand", () => {
  it("fills title + oneLiner and returns citations", async () => {
    const { s, demand } = await seedWithDemand();
    const card = await openDemand(s, demand.id);
    expect(card.title).toContain("people want");
    expect(card.oneLiner).toContain("asked for");
    expect(card.citations.length).toBeGreaterThanOrEqual(1);
  });

  it("throws on unknown demand", async () => {
    await expect(openDemand(new MemoryStore(), "nope")).rejects.toThrow("demand not found");
  });
});

describe("proposal pipeline", () => {
  it("creates a draft proposal with matched speakers and a timeline event", async () => {
    const { s, cid, demand } = await seedWithDemand();
    await s.upsertVenue({ id: "v1", communityId: cid, name: "Town Hall", area: "downtown", capacity: 50, contact: null });
    const pack = await createProposalFromDemand(s, cid, demand.id);
    expect(pack.status).toBe("draft");
    expect(pack.demandId).toBe(demand.id);
    expect(pack.explanation).toContain("Demand for");
    expect(pack.venue?.name).toBe("Town Hall");
    expect((await s.listTimeline(cid)).some((t) => t.kind === "proposal")).toBe(true);
  });

  it("picks the smallest venue that fits the crowd", async () => {
    const { s, cid, demand } = await seedWithDemand();
    await s.upsertVenue({ id: "big", communityId: cid, name: "Arena", area: null, capacity: 500, contact: null });
    await s.upsertVenue({ id: "small", communityId: cid, name: "Studio", area: null, capacity: 20, contact: null });
    const pack = await createProposalFromDemand(s, cid, demand.id);
    expect(pack.venueId).toBe("small");
  });

  it("approve → outreach draft → go-live; each gate enforced", async () => {
    const { s, cid, demand } = await seedWithDemand();
    const pack = await createProposalFromDemand(s, cid, demand.id);

    await expect(goLive(s, pack.id, "https://os.test")).rejects.toThrow("approve");

    const approved = await setProposalStatus(s, pack.id, "approved");
    expect(approved.status).toBe("approved");
    await expect(setProposalStatus(s, pack.id, "approved")).rejects.toThrow("only a draft");
    await expect(setProposalStatus(s, pack.id, "live")).rejects.toThrow("go-live");

    const withDraft = await makeOutreachDraft(s, pack.id, "Bread Town");
    expect(withDraft.outreachDraft).toContain("Bread Town");
    const again = await makeOutreachDraft(s, pack.id, "Bread Town");
    expect(again.outreachDraft).toBe(withDraft.outreachDraft); // idempotent — never regenerates

    const event = await goLive(s, pack.id, "https://os.test");
    expect(event.slug).toBeTruthy();
    expect(event.qrSvg).toContain("<svg");
    expect((await s.getProposal(pack.id))!.status).toBe("live");
    expect((await s.listTimeline(cid)).some((t) => t.kind === "published")).toBe(true);
    return { s, cid, event };
  });

  it("throws approving or going live on an unknown proposal", async () => {
    const s = new MemoryStore();
    await expect(setProposalStatus(s, "nope", "approved")).rejects.toThrow("proposal not found");
    await expect(goLive(s, "nope", "https://x")).rejects.toThrow("proposal not found");
  });
});

describe("rsvp", () => {
  async function liveEvent() {
    const { s, cid, demand } = await seedWithDemand();
    const pack = await createProposalFromDemand(s, cid, demand.id);
    await setProposalStatus(s, pack.id, "approved");
    const event = await goLive(s, pack.id, "https://os.test");
    return { s, cid, event };
  }

  it("creates a guest and links them to a same-named member", async () => {
    const { s, event } = await liveEvent();
    const g = await rsvp(s, event.slug, { name: "Ada", email: "ada@bakers.test" });
    expect(g.memberId).toBeTruthy();
    const ada = await s.getMember(g.memberId!);
    expect(ada?.displayName).toBe("Ada");
    expect((await s.listTimeline(g.communityId)).some((t) => t.kind === "rsvp")).toBe(true);
  });

  it("updates the existing guest on a duplicate email instead of duplicating", async () => {
    const { s, event } = await liveEvent();
    await rsvp(s, event.slug, { name: "Grace H", email: "grace@x.test" });
    const second = await rsvp(s, event.slug, { name: "Grace Hopper", email: "grace@x.test" });
    expect(second.name).toBe("Grace Hopper");
    expect(await s.listGuests(event.id)).toHaveLength(1);
  });

  it("rejects bad input before touching the store", async () => {
    const { s, event } = await liveEvent();
    await expect(rsvp(s, event.slug, { name: "", email: "a@b.c" })).rejects.toThrow("required");
    await expect(rsvp(s, event.slug, { name: "A", email: "not-an-email" })).rejects.toThrow("required");
    await expect(rsvp(s, "no-such-event", { name: "A", email: "a@b.c" })).rejects.toThrow("event not found");
    expect(await s.listGuests(event.id)).toHaveLength(0);
  });
});

describe("event chain + page views", () => {
  it("reconstructs event → proposal → demand → source messages by slug or id", async () => {
    const { s, cid, demand } = await seedWithDemand();
    const pack = await createProposalFromDemand(s, cid, demand.id);
    await setProposalStatus(s, pack.id, "approved");
    const event = await goLive(s, pack.id, "https://os.test");

    const bySlug = await eventChain(s, event.slug);
    const byId = await eventChainById(s, event.id);
    for (const chain of [bySlug, byId]) {
      expect(chain.event.id).toBe(event.id);
      expect(chain.proposal?.id).toBe(pack.id);
      expect(chain.demand?.id).toBe(demand.id);
      expect(chain.messages.length).toBe(demand.messageIds.length);
    }
  });

  it("throws on unknown event, silently no-ops page views on unknown slug", async () => {
    const s = new MemoryStore();
    await expect(eventChain(s, "nope")).rejects.toThrow("event not found");
    await expect(eventChainById(s, "nope")).rejects.toThrow("event not found");
    await recordEventPageView(s, "nope"); // does not throw
  });

  it("records a page_view timeline event per view", async () => {
    const { s, cid, demand } = await seedWithDemand();
    const pack = await createProposalFromDemand(s, cid, demand.id);
    await setProposalStatus(s, pack.id, "approved");
    const event = await goLive(s, pack.id, "https://os.test");
    await recordEventPageView(s, event.slug);
    await recordEventPageView(s, event.slug);
    const views = (await s.listTimeline(cid)).filter((t) => t.kind === "page_view");
    expect(views).toHaveLength(2);
    expect(views[0].payload).toMatchObject({ eventId: event.id });
  });
});
