/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Coverage completion — exercises every fallback branch in kernel.ts:
 * ghost references (missing proposal/demand/venue/workspace), boundary
 * capacities, and every date/ampm variant in the WhatsApp parser. These are
 * defensive-code paths that normal flows never reach; they exist so corrupt
 * or partial data degrades gracefully rather than crashing.
 */
import { describe, expect, it } from "vitest";
import {
  eventChainById,
  generateAutopilot,
  goLive,
  ingestMessages,
  makeOutreachDraft,
  openProposal,
  publicEvent,
  refreshMemory,
  rsvp,
} from "./kernel.ts";
import { matchVenues } from "./match.ts";
import { MemoryStore } from "./memory-store.ts";
import { parseWhatsAppTranscript } from "./whatsapp.ts";
import { demand, eventRecord, member, message, proposal, venue } from "@community-os/testkit";

const ws = async (s: MemoryStore, name = "W") => (await s.createWorkspace({ name, createdBy: "t" })).id;
const SRC = { kind: "native" as const, name: "t" };

describe("refreshMemory — member with zero messages", () => {
  it("upserted member with no messages survives the extraction loop", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    // A member that exists but authored nothing — byMember.get() misses → ?? [].
    await s.upsertMember(cid, "Ghost", null);
    const out = await refreshMemory(s, cid);
    expect(out.members).toHaveLength(1);
    // No do/want/offer extracted → patch empty → updateMember skipped.
    const m = (await s.listMembers(cid))[0];
    expect(m.do).toBeNull();
    expect(m.want).toBeNull();
    expect(m.offer).toBeNull();
  });
});

describe("openProposal / makeOutreachDraft — missing proposal throws", () => {
  it("openProposal throws on unknown id", async () => {
    const s = new MemoryStore();
    await expect(openProposal(s, "ghost")).rejects.toThrow("proposal not found");
  });
  it("makeOutreachDraft throws on unknown id", async () => {
    const s = new MemoryStore();
    await expect(makeOutreachDraft(s, "ghost", "W")).rejects.toThrow("proposal not found");
  });
});

describe("openProposal — venue bound and unbound", () => {
  it("resolves the venue object when venueId is set", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const v = await s.upsertVenue(venue({ communityId: cid, name: "Hall", capacity: 40 }));
    const p = await s.createProposal(proposal({ communityId: cid, venueId: v.id }));
    const pack = await openProposal(s, p.id);
    expect(pack.venue?.name).toBe("Hall");
  });
});

describe("makeOutreachDraft — fallbacks", () => {
  it("returns early when a draft already exists", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const p = await s.createProposal(proposal({ communityId: cid, outreachDraft: "already written" }));
    const pack = await makeOutreachDraft(s, p.id, "W");
    expect(pack.outreachDraft).toBe("already written");
  });

  it("falls back to 'this' when the demand is missing", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const p = await s.createProposal(proposal({ communityId: cid, demandId: "ghost-demand" }));
    const pack = await makeOutreachDraft(s, p.id, "W");
    expect(pack.outreachDraft).toContain("this");
  });

  it("includes the venue name when bound", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const v = await s.upsertVenue(venue({ communityId: cid, name: "Rooftop" }));
    const d = await s.upsertDemand(demand({ communityId: cid, topic: "meetup" }));
    const p = await s.createProposal(proposal({ communityId: cid, demandId: d.id, venueId: v.id }));
    const pack = await makeOutreachDraft(s, p.id, "W");
    expect(pack.outreachDraft).toContain("Rooftop");
  });
});

describe("goLive — ghost references fall back gracefully", () => {
  it("titles the event 'Community: event' when workspace and demand are missing", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const p = await s.createProposal(
      proposal({ communityId: "ghost-community", demandId: "ghost-demand", status: "approved" }),
    );
    const event = await goLive(s, p.id, "https://o.test");
    expect(event.title).toBe("Community: event");
    expect(event.communityId).toBe("ghost-community");
    void cid;
  });
});

describe("rsvp — repeat email without a matching member", () => {
  it("keeps the existing memberId when the new name matches no member", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const p = await s.createProposal(proposal({ communityId: cid, status: "approved" }));
    const event = await goLive(s, p.id, "https://o.test");
    await rsvp(s, event.slug, { name: "First", email: "guest@x.com" });
    const second = await rsvp(s, event.slug, { name: "Renamed Stranger", email: "guest@x.com" });
    expect(second.name).toBe("Renamed Stranger");
    expect((await s.listGuests(event.id))).toHaveLength(1);
  });

  it("relinks to the member when the name does match one", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const m = await s.upsertMember(cid, "Ada", null);
    const p = await s.createProposal(proposal({ communityId: cid, status: "approved" }));
    const event = await goLive(s, p.id, "https://o.test");
    await rsvp(s, event.slug, { name: "Someone", email: "ada@x.com" });
    const second = await rsvp(s, event.slug, { name: "Ada", email: "ada@x.com" });
    expect(second.memberId).toBe(m.id);
  });
});

describe("eventChain — ghost proposal resolves to empty detail", () => {
  it("ghost proposalId → null proposal, null demand, empty messages", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const e = await s.createEvent(eventRecord({ communityId: cid, proposalId: "ghost-proposal" }));
    const chain = await eventChainById(s, e.id);
    expect(chain.proposal).toBeNull();
    expect(chain.demand).toBeNull();
    expect(chain.messages).toEqual([]);
  });

  it("full chain → event, proposal, demand and cited messages", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    await ingestMessages(s, cid, SRC, [
      { id: "m1", author: "Ada", authorId: "ada", body: "i want a bread workshop", sentAt: "2025-01-01T00:00:00.000Z" },
    ]);
    await refreshMemory(s, cid);
    const d = (await s.listDemands(cid))[0];
    const p = await s.createProposal(proposal({ communityId: cid, demandId: d.id, status: "approved" }));
    const e = await goLive(s, p.id, "https://o.test");
    const chain = await eventChainById(s, e.id);
    expect(chain.proposal?.id).toBe(p.id);
    expect(chain.demand?.topic).toBe("workshop");
    expect(chain.messages.length).toBeGreaterThanOrEqual(1);
  });
});

describe("publicEvent — full deck vs ghost deck", () => {
  it("renders explanation, opted-in speaker slug, venue and community name", async () => {
    const s = new MemoryStore();
    const cid = await ws(s, "Bread Club");
    const spk = await s.upsertMember(cid, "Ada", null);
    await s.updateMember(spk.id, { publicOptIn: true, publicSlug: "ada" }, false);
    const v = await s.upsertVenue(venue({ communityId: cid, name: "Hall", area: "Shoreditch" }));
    const d = await s.upsertDemand(demand({ communityId: cid, topic: "workshop" }));
    const p = await s.createProposal(
      proposal({ communityId: cid, demandId: d.id, venueId: v.id, speakerIds: [spk.id], explanation: "Because bread." }),
    );
    const e = await s.createEvent(eventRecord({ communityId: cid, proposalId: p.id }));
    const page = await publicEvent(s, e.slug);
    expect(page.explanation).toBe("Because bread.");
    expect(page.venue).toEqual({ name: "Hall", area: "Shoreditch" });
    expect(page.community.name).toBe("Bread Club");
    expect(page.speakers).toEqual([{ name: "Ada", slug: "ada" }]);
  });

  it("drops ghost speakers and hides slugs for opted-out speakers", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const shy = await s.upsertMember(cid, "Shy", null); // not opted in
    const p = await s.createProposal(
      proposal({ communityId: cid, speakerIds: [shy.id, "ghost-speaker"], venueId: null }),
    );
    const e = await s.createEvent(eventRecord({ communityId: cid, proposalId: p.id }));
    const page = await publicEvent(s, e.slug);
    expect(page.speakers).toEqual([{ name: "Shy", slug: null }]);
    expect(page.venue).toBeNull();
  });

  it("ghost proposal/workspace → null explanation, empty speakers, blank slug", async () => {
    const s = new MemoryStore();
    const e = await s.createEvent(eventRecord({ communityId: "ghost", proposalId: "ghost" }));
    const page = await publicEvent(s, e.slug);
    expect(page.explanation).toBeNull();
    expect(page.speakers).toEqual([]);
    expect(page.community).toEqual({ name: "Community", slug: "" });
  });
});

describe("generateAutopilot — fallbacks", () => {
  it("ghost community/proposal → 'Community' name and event.title in artifacts", async () => {
    const s = new MemoryStore();
    const e = await s.createEvent(eventRecord({ communityId: "ghost", proposalId: "ghost", title: "Launch Night" }));
    const out = await generateAutopilot(s, e.id, "https://o.test");
    const post = out.find((a: any) => a.kind === "post")!;
    const news = out.find((a: any) => a.kind === "newsletter")!;
    expect(post.body).toContain("Community");
    expect(news.body).toContain("Launch Night");
  });

  it("uses proposal.explanation in the newsletter and maps real speakers", async () => {
    const s = new MemoryStore();
    const cid = await ws(s, "Bread Club");
    const spk = await s.upsertMember(cid, "Ada", null);
    const p = await s.createProposal(
      proposal({ communityId: cid, speakerIds: [spk.id], explanation: "Because bread.", status: "approved" }),
    );
    const e = await goLive(s, p.id, "https://o.test");
    const out = await generateAutopilot(s, e.id, "https://o.test");
    const news = out.find((a: any) => a.kind === "newsletter")!;
    expect(news.body).toContain("Because bread.");
    expect(news.body).toContain("Bread Club");
  });
});

describe("matchVenues — null capacity sorts last", () => {
  it("orders known capacities ascending, unknown last", () => {
    const ranked = matchVenues(
      [venue({ name: "big", capacity: 50 }), venue({ name: "unk", capacity: null }), venue({ name: "small", capacity: 30 })],
      20,
    );
    expect(ranked.map((v) => v.name)).toEqual(["small", "big", "unk"]);
  });
});

describe("parseWhatsAppDate — every format variant", () => {
  const send = (line: string) => parseWhatsAppTranscript(`${line} - Ada: hi\n`)[0].sentAt;

  it("D/M/Y direct when day > 12", () => {
    expect(send("25/12/2025, 9:30")).toBe("2025-12-25T09:30:00.000Z");
  });
  it("M/D/Y swap when month-part > 12", () => {
    expect(send("12/25/2025, 9:30")).toBe("2025-12-25T09:30:00.000Z");
  });
  it("two-digit year expands to 20xx", () => {
    expect(send("01/02/25, 9:30")).toBe("2025-02-01T09:30:00.000Z");
  });
  it("PM adds 12 to sub-noon hours", () => {
    expect(send("01/01/2025, 1:30 PM")).toBe("2025-01-01T13:30:00.000Z");
  });
  it("12 PM stays noon", () => {
    expect(send("01/01/2025, 12:30 PM")).toBe("2025-01-01T12:30:00.000Z");
  });
  it("12 AM becomes midnight", () => {
    expect(send("01/01/2025, 12:30 AM")).toBe("2025-01-01T00:30:00.000Z");
  });
  it("AM under 12 stays as-is", () => {
    expect(send("01/01/2025, 1:30 AM")).toBe("2025-01-01T01:30:00.000Z");
  });
  it("no AM/PM and no seconds uses hours/minutes as given", () => {
    expect(send("01/01/2025, 9:30")).toBe("2025-01-01T09:30:00.000Z");
  });
});
