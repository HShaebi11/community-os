import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  briefing,
  createProposalFromDemand,
  assignPublicSlug,
  eventChain,
  generateAutopilot,
  goLive,
  importWhatsApp,
  ingestDiscord,
  makeOutreachDraft,
  memberCard,
  publicCommunity,
  publicEvent,
  publicMember,
  refreshMemory,
  rsvp,
  setProposalStatus,
  submitApplication,
} from "./kernel.ts";
import { clipQuote } from "./extract.ts";
import { MemoryStore } from "./memory-store.ts";
import { parseWhatsAppTranscript } from "./whatsapp.ts";

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/whatsapp-sample/_chat.txt"),
  "utf8",
);

describe("whatsapp import", () => {
  it("parses a synthetic export", () => {
    const messages = parseWhatsAppTranscript(fixture);
    expect(messages.length).toBeGreaterThan(8);
    expect(messages.some((m) => m.authorRaw === "Maya")).toBe(true);
  });
});

describe("kernel loop", () => {
  it("imports, remembers, proposes, publishes, and RSVPs", async () => {
    const store = new MemoryStore();
    const workspace = await store.createWorkspace({ name: "Weird Stuff", createdBy: "local" });
    const imported = await importWhatsApp(store, workspace.id, fixture, []);
    expect(imported.inserted).toBeGreaterThan(0);
    expect(imported.members.length).toBeGreaterThan(2);

    const memory = await refreshMemory(store, workspace.id);
    expect(memory.demands.length).toBeGreaterThan(0);
    const cited = memory.members.find((m) => m.do || m.want || m.offer);
    expect(cited).toBeTruthy();
    const card = await memberCard(store, cited!.id);
    expect(card.citations.length).toBeGreaterThan(0);
    const citationCount = (await store.listCitations(workspace.id)).length;
    await refreshMemory(store, workspace.id);
    expect((await store.listCitations(workspace.id)).length).toBe(citationCount);
    const brief = await briefing(store, workspace.id);
    expect(brief.people).toBe(imported.members.length);
    expect(brief.resources.some((r) => r.url.includes("example.com/community-os-notes"))).toBe(true);

    await store.upsertVenue({
      id: "venue-1",
      communityId: workspace.id,
      name: "Expedite HQ",
      area: "Hammersmith",
      capacity: 80,
      contact: "hello@venue.test",
    });

    const demand = memory.demands[0];
    const proposal = await createProposalFromDemand(store, workspace.id, demand.id);
    expect(proposal.status).toBe("draft");
    expect(proposal.speakers.length).toBeGreaterThan(0);
    expect(proposal.explanation).toMatch(/“/);
    await expect(goLive(store, proposal.id, "http://localhost:5173")).rejects.toThrow(/approve/);
    await setProposalStatus(store, proposal.id, "approved");
    const drafted = await makeOutreachDraft(store, proposal.id, workspace.name);
    expect(drafted.outreachDraft).toMatch(/Weird Stuff/);

    const event = await goLive(store, proposal.id, "http://localhost:5173");
    expect(event.qrSvg).toContain("<svg");
    const guest = await rsvp(store, event.slug, { name: "Maya", email: "maya@example.com" });
    expect(guest.memberId).not.toBeNull();
    await expect(rsvp(store, event.slug, { name: "", email: "x" })).rejects.toThrow(/name and email/);
    const again = await rsvp(store, event.slug, { name: "Maya K", email: "maya@example.com" });
    expect(again.id).toBe(guest.id);
    expect(again.name).toBe("Maya K");
    expect((await store.listGuests(event.id)).length).toBe(1);
    const chain = await eventChain(store, event.slug);
    expect(chain.demand?.id).toBe(demand.id);
    expect(chain.messages.length).toBeGreaterThan(0);
    const pub = await publicEvent(store, event.slug);
    expect("messages" in pub).toBe(false);
    expect(pub.venue?.name).toBe("Expedite HQ");
    const community = await publicCommunity(store, workspace.slug, "http://localhost:5173");
    expect(community.qrSvg).toContain("<svg");
    await store.updateMember(proposal.speakers[0].id, { publicOptIn: true }, true);
    const memberSlug = await assignPublicSlug(store, proposal.speakers[0].id);
    const publicCard = await publicMember(store, memberSlug);
    expect(publicCard.name).toBe(proposal.speakers[0].displayName);
    expect("want" in publicCard).toBe(false);

    const live = await ingestDiscord(store, workspace.id, {
      id: "d1",
      content: "We should do another AI workshop next month",
      timestamp: new Date().toISOString(),
      author: { id: "u1", username: "Ilya" },
    });
    expect(live.inserted).toBe(1);

    const artifacts = await generateAutopilot(store, event.id, "http://localhost:5173");
    expect(artifacts.map((a) => a.kind).sort()).toEqual(["newsletter", "post", "run_sheet"]);

    const application = await submitApplication(store, workspace.id, {
      applicant: "+447700900123",
      answers: "I build agents and want to help Weird Stuff run workshops.",
      communityName: workspace.name,
    });
    expect(application.decision).toBe("accept");
  });

  it("does not overwrite lead edits", async () => {
    const store = new MemoryStore();
    const workspace = await store.createWorkspace({ name: "Lab", createdBy: "local" });
    const member = await store.upsertMember(workspace.id, "Ada", new Date().toISOString());
    await store.updateMember(member.id, { do: "Lead-set: hosts nights" }, true);
    await store.updateMember(member.id, { do: "Model-set: would overwrite" }, false);
    const again = await store.getMember(member.id);
    expect(again?.do).toBe("Lead-set: hosts nights");
    await store.updateMember(member.id, { want: null }, true);
    await store.updateMember(member.id, { want: "Model-set: refill" }, false);
    const cleared = await store.getMember(member.id);
    expect(cleared?.want).toBeNull();
  });
});

describe("trusted memory", () => {
  it("member cards cite the chat lines behind do, want and offer", async () => {
    const store = new MemoryStore();
    const workspace = await store.createWorkspace({ name: "Weird Stuff", createdBy: "local" });
    await importWhatsApp(store, workspace.id, fixture, []);
    await refreshMemory(store, workspace.id);

    const filled = (await store.listMembers(workspace.id)).filter((m) => m.do || m.want || m.offer);
    expect(filled.length).toBeGreaterThan(0);
    for (const member of filled) {
      const card = await memberCard(store, member.id);
      expect(card.citations.length).toBeGreaterThan(0);
      for (const citation of card.citations) {
        const message = await store.getMessage(citation.messageId);
        expect(message).toBeTruthy();
        expect(message!.memberId).toBe(member.id);
        expect(clipQuote(message!.body)).toBe(citation.quote);
      }
    }
  });

  it("cites a chat line that wraps onto a second line", async () => {
    const store = new MemoryStore();
    const workspace = await store.createWorkspace({ name: "Lab", createdBy: "local" });
    const transcript = "[22/10/2026, 10:00:00] Ada: I teach evening classes\nand can host the group";
    await importWhatsApp(store, workspace.id, transcript, []);
    await refreshMemory(store, workspace.id);

    const ada = (await store.listMembers(workspace.id)).find((m) => m.displayName === "Ada")!;
    expect(ada.offer).toBe("I teach evening classes and can host the group");
    const card = await memberCard(store, ada.id);
    const citation = card.citations.find((c) => c.quote.includes("host the group"));
    expect(citation).toBeTruthy();
    const message = await store.getMessage(citation!.messageId);
    expect(message?.body).toContain("\n");
  });

  it("a lead edit survives a second memory refresh", async () => {
    const store = new MemoryStore();
    const workspace = await store.createWorkspace({ name: "Lab", createdBy: "local" });
    await importWhatsApp(store, workspace.id, fixture, []);
    const first = await refreshMemory(store, workspace.id);
    const maya = first.members.find((m) => m.displayName === "Maya")!;
    const charlie = first.members.find((m) => m.displayName === "Charlie")!;
    expect(maya.do).toBeTruthy();
    expect(charlie.want).toBeTruthy();

    // The same call PATCH /v1/members/:id makes.
    await store.updateMember(maya.id, { do: "Runs eval nights", notes: "Met her at the lab." }, true);
    await store.updateMember(charlie.id, { want: null }, true);
    // A patch cannot clear the locks or reach non-editable fields.
    await store.updateMember(maya.id, { leadLockedFields: [], communityId: "other" } as unknown as { do: string }, true);

    await ingestDiscord(store, workspace.id, {
      id: "d2",
      content: "I can run the next demo night",
      timestamp: new Date().toISOString(),
      author: { id: "u2", username: "Ravi" },
    });
    const second = await refreshMemory(store, workspace.id);

    const after = second.members.find((m) => m.id === maya.id)!;
    expect(after.do).toBe("Runs eval nights");
    expect(after.notes).toBe("Met her at the lab.");
    expect(after.communityId).toBe(workspace.id);
    expect(after.leadLockedFields).toEqual(expect.arrayContaining(["do", "notes"]));
    expect(after.want).toBe(maya.want);

    const cleared = second.members.find((m) => m.id === charlie.id)!;
    expect(cleared.want).toBeNull();

    const ravi = second.members.find((m) => m.displayName === "Ravi")!;
    expect(ravi.offer).toBe("I can run the next demo night");

    const citations = (await store.listCitations(workspace.id)).length;
    await refreshMemory(store, workspace.id);
    expect((await store.listCitations(workspace.id)).length).toBe(citations);
  });
});
