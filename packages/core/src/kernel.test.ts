import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  briefing,
  createProposalFromDemand,
  eventChain,
  generateAutopilot,
  goLive,
  importWhatsApp,
  ingestDiscord,
  makeOutreachDraft,
  memberCard,
  refreshMemory,
  rsvp,
  setProposalStatus,
  submitApplication,
} from "./kernel.ts";
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
    const lead = await store.upsertUser("lead@example.com");
    const workspace = await store.createWorkspace({ name: "Weird Stuff", createdBy: lead.id });
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
      userId: null,
    });

    const demand = memory.demands[0];
    const proposal = await createProposalFromDemand(store, workspace.id, demand.id);
    expect(proposal.status).toBe("draft");
    await setProposalStatus(store, proposal.id, "approved");
    const drafted = await makeOutreachDraft(store, proposal.id, workspace.name);
    expect(drafted.outreachDraft).toMatch(/Weird Stuff/);

    const event = await goLive(store, proposal.id, "http://localhost:5173");
    expect(event.qrSvg).toContain("<svg");
    const guest = await rsvp(store, event.slug, { name: "Maya", email: "maya@example.com" });
    expect(guest.memberId).not.toBeNull();
    const chain = await eventChain(store, event.slug);
    expect(chain.demand?.id).toBe(demand.id);
    expect(chain.messages.length).toBeGreaterThan(0);

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
    const lead = await store.upsertUser("lead@example.com");
    const workspace = await store.createWorkspace({ name: "Lab", createdBy: lead.id });
    const member = await store.upsertMember(workspace.id, "Ada", new Date().toISOString());
    await store.updateMember(member.id, { do: "Lead-set: hosts nights" }, true);
    await store.updateMember(member.id, { do: "Model-set: would overwrite" }, false);
    const again = await store.getMember(member.id);
    expect(again?.do).toBe("Lead-set: hosts nights");
  });
});
