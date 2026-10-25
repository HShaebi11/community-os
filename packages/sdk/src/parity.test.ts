import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "@community-os/server";
import { MemoryStore } from "@community-os/core";
import { SqliteStore } from "@community-os/store-sqlite";
import { makeWhatsAppZip, normalizedMessage, transcripts } from "@community-os/testkit";
import { ApiError, CommunityOS } from "./index.ts";

/** The same domain suite, run against every transport. Any divergence between
 *  remote and embedded behavior is a bug — the SDK promises identical results. */
const sqliteStores: SqliteStore[] = [];
afterAll(() => {
  for (const s of sqliteStores.splice(0)) s.close();
});

const transports = [
  {
    name: "remote",
    cos: () => {
      const app = createApp(new MemoryStore());
      const fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
        app.request(String(input), init)) as typeof globalThis.fetch;
      return new CommunityOS({ baseUrl: "http://remote.test", fetch, publicOrigin: "https://pub.test" });
    },
  },
  {
    name: "memory",
    cos: () => CommunityOS.memory({ publicOrigin: "https://pub.test" }),
  },
  {
    name: "sqlite",
    cos: () => {
      const s = new SqliteStore();
      sqliteStores.push(s);
      return CommunityOS.store(s, { publicOrigin: "https://pub.test" });
    },
  },
] as const;

describe.each(transports)("parity over $name transport", ({ cos }) => {
  it("workspaces: create → get → bySlug → list → patch → not-found parity", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "Parity Town" });
    expect(w.slug).toBe("parity-town");
    expect((await c.getWorkspace(w.id)).name).toBe("Parity Town");
    expect((await c.getWorkspaceBySlug("parity-town")).role).toBe("owner");
    expect((await c.listWorkspaces()).length).toBe(1);
    await c.updateWorkspace(w.id, { joinUrl: "https://join" });
    expect((await c.getWorkspace(w.id)).joinUrl).toBe("https://join");

    await expect(c.getWorkspace("nope")).rejects.toMatchObject({ status: 404 });
    await expect(c.getWorkspaceBySlug("nope")).rejects.toBeInstanceOf(ApiError);
    await expect(c.getWorkspaceBySlug("nope")).rejects.toMatchObject({ status: 404 });
  });

  it("ingest: normalized messages dedupe + member resolution", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "I" });
    const source = { kind: "slack" as const, name: "#town" };
    await c.ingest(w.id, { source, messages: [
      normalizedMessage({ id: "s1", author: "Ada" }),
      normalizedMessage({ id: "s2", author: "ada" }),
    ] });
    const second = await c.ingest(w.id, { source, messages: [normalizedMessage({ id: "s1", author: "Ada" })] });
    expect(second.inserted).toBe(0);
    expect(await c.listMembers(w.id)).toHaveLength(1);
    expect(await c.listMessages(w.id)).toHaveLength(2);
  });

  it("importChat parses a real whatsapp zip", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "Z" });
    const res = await c.importChat(w.id, makeWhatsAppZip(transcripts.ios), "export.zip");
    expect(res.inserted).toBe(2);
    expect((await c.listTimeline(w.id)).some((t) => t.kind === "import")).toBe(true);
  });

  it("memory: refresh → briefing → member card citations → search", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "M" });
    await c.ingest(w.id, { source: { kind: "whatsapp", name: "t" }, messages: [
      normalizedMessage({ id: "1", author: "Ada", body: "i'm a baker, i want a bread workshop" }),
    ] });
    const memory = await c.refreshMemory(w.id);
    expect(memory.demands.length).toBeGreaterThanOrEqual(1);
    const brief = await c.briefing(w.id);
    expect(brief.people).toBe(1);
    const card = await c.getMember(memory.members[0].id);
    expect(card.citations.length).toBeGreaterThanOrEqual(1);
    const hits = await c.search("baker");
    expect(hits.some((h) => h.type === "member")).toBe(true);
  });

  it("pipeline: demand → proposal → approve → outreach → go-live → chain → autopilot", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "P" });
    await c.ingest(w.id, { source: { kind: "whatsapp", name: "t" }, messages: [
      normalizedMessage({ id: "1", author: "Ada", body: "i want a bread workshop" }),
    ] });
    await c.refreshMemory(w.id);
    const [demand] = await c.listDemands(w.id);
    const card = await c.getDemand(demand.id);
    expect(card.citations.length).toBeGreaterThanOrEqual(1);

    await c.createVenue(w.id, { name: "Hall", capacity: 40 });
    await c.createSponsor(w.id, { name: "Flour Co" });
    expect(await c.listVenues(w.id)).toHaveLength(1);
    expect(await c.listSponsors(w.id)).toHaveLength(1);

    const pack = await c.createProposal(w.id, demand.id);
    expect(pack.status).toBe("draft");
    await expect(c.goLive(pack.id)).rejects.toMatchObject({ status: 400 });

    await c.approveProposal(pack.id);
    const drafted = await c.draftOutreach(pack.id);
    expect(drafted.outreachDraft).toBeTruthy();

    const event = await c.goLive(pack.id);
    expect((await c.listEvents(w.id)).map((e) => e.slug)).toContain(event.slug);
    const chain = await c.getEventChain(event.id);
    expect(chain.demand?.id).toBe(demand.id);
    const artifacts = await c.autopilot(event.id);
    expect(artifacts).toHaveLength(3);
  });

  it("public surface + rsvp", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "Pub Town" });
    await c.ingest(w.id, { source: { kind: "whatsapp", name: "t" }, messages: [
      normalizedMessage({ id: "1", author: "Ada", body: "i want a bread workshop" }),
    ] });
    await c.refreshMemory(w.id);
    const [demand] = await c.listDemands(w.id);
    const pack = await c.createProposal(w.id, demand.id);
    await c.approveProposal(pack.id);
    const event = await c.goLive(pack.id);

    const community = await c.publicCommunity("pub-town");
    expect(community.events.map((e) => e.slug)).toContain(event.slug);
    const pubEvent = await c.publicEvent(event.slug);
    expect(pubEvent.title).toBeTruthy();

    const guest = await c.rsvp(event.slug, { name: "Ada", email: "ada@x.test" });
    expect(guest.memberId).toBeTruthy();
    expect(await c.listGuests(event.id)).toHaveLength(1);

    const member = (await c.listMembers(w.id))[0];
    await c.updateMember(member.id, { publicOptIn: true });
    const page = await c.publicMember("ada");
    expect(page.name).toBe("Ada");
    await expect(c.publicMember("nobody")).rejects.toMatchObject({ status: 404 });
  });

  it("gatekeeper: applications score, blocklist declines", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "Gate" });
    const app1 = await c.submitApplication(w.id, {
      applicant: "ada",
      answers: "I organize meetups and found Gate through friends — I would love to contribute.",
    });
    expect(app1.decision).toBe("accept");
    await c.addBlocklist(w.id, { applicant: "mal", evidence: "spam", confirmed: true });
    const blocked = await c.submitApplication(w.id, { applicant: "mal", answers: "let me in please I love Gate so much" });
    expect(blocked.decision).toBe("decline");
    expect(await c.listApplications(w.id)).toHaveLength(2);
  });

  it("webhooks: secret once, redacted on list, delete parity", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "W" });
    const sub = await c.createWebhook(w.id, { url: "https://hook.test/x", kinds: ["import"] });
    expect(sub.secret).toMatch(/^whsec_/);
    const listed = await c.listWebhooks(w.id);
    expect(listed[0]).not.toHaveProperty("secret");
    expect((await c.deleteWebhook(sub.id)).ok).toBe(true);
    await expect(c.deleteWebhook(sub.id)).rejects.toMatchObject({ status: 404 });
    await expect(c.createWebhook(w.id, { url: "ftp://no" })).rejects.toMatchObject({ status: 400 });
  });

  it("export carries the archive; timeline records import+memory", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "Exp" });
    await c.importChat(w.id, makeWhatsAppZip(transcripts.ios), "export.zip");
    await c.refreshMemory(w.id);
    const out = await c.exportWorkspace(w.id);
    expect(out.version).toBe(1);
    expect(out.messages[0]).not.toHaveProperty("body");
    const kinds = (await c.listTimeline(w.id)).map((t) => t.kind);
    expect(kinds).toContain("import");
    expect(kinds).toContain("memory");
  });

  it("domain errors map to 400, missing resources to 404 — same in every mode", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "E" });
    await expect(c.getMember("nope")).rejects.toMatchObject({ status: 404 });
    await expect(c.getDemand("nope")).rejects.toMatchObject({ status: 404 });
    await expect(c.getProposal("nope")).rejects.toMatchObject({ status: 404 });
    await expect(c.createProposal(w.id, "nope")).rejects.toMatchObject({ status: 400 });
    await expect(c.rsvp("nope", { name: "A", email: "a@b.c" })).rejects.toMatchObject({ status: 400 });
  });

  it("edge: cross-source id collision + padded author names + hostile bodies", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "Edge" });
    // Same platform id from two different sources — both messages land.
    await c.ingest(w.id, { source: { kind: "slack", name: "#a" }, messages: [normalizedMessage({ id: "1", author: "Ada" })] });
    await c.ingest(w.id, { source: { kind: "discord", name: "#b" }, messages: [normalizedMessage({ id: "1", author: "Ada" })] });
    expect(await c.listMessages(w.id)).toHaveLength(2);
    // Padded author name — same person, not a second member.
    expect(await c.listMembers(w.id)).toHaveLength(1);
    await c.ingest(w.id, { source: { kind: "slack", name: "#a" }, messages: [normalizedMessage({ id: "2", author: "  Ada  " })] });
    expect(await c.listMembers(w.id)).toHaveLength(1);
    // Hostile bodies round-trip intact through every transport.
    await c.ingest(w.id, { source: { kind: "native", name: "t" }, messages: [normalizedMessage({ id: "h1", author: "Eve", body: "'; DROP TABLE members; -- 👋🏽" })] });
    const hostile = (await c.listMessages(w.id)).find((m) => m.sourceMessageId === "h1");
    expect(hostile?.body).toBe("'; DROP TABLE members; -- 👋🏽");
  });

  it("edge: rsvp enforces the matched venue capacity on every transport", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "Cap" });
    await c.createVenue(w.id, { name: "Tiny", capacity: 10 });
    await c.ingest(w.id, { source: { kind: "whatsapp", name: "t" }, messages: [normalizedMessage({ id: "1", author: "Ada", body: "i want a bread workshop" })] });
    await c.refreshMemory(w.id);
    const [demand] = await c.listDemands(w.id);
    const pack = await c.createProposal(w.id, demand.id);
    await c.approveProposal(pack.id);
    const event = await c.goLive(pack.id);
    for (let i = 0; i < 10; i++) await c.rsvp(event.slug, { name: `G${i}`, email: `g${i}@x.com` });
    await expect(c.rsvp(event.slug, { name: "Eleven", email: "e11@x.com" })).rejects.toMatchObject({ status: 400 });
    // Updating an existing guest still works at capacity.
    const updated = await c.rsvp(event.slug, { name: "G0 Renamed", email: "g0@x.com" });
    expect(updated.name).toBe("G0 Renamed");
  });

  it("secondary read surfaces: files, timeline, resources, proposals", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "Reads" });
    await c.ingest(w.id, { source: { kind: "whatsapp", name: "t" }, messages: [
      normalizedMessage({ id: "1", author: "Ada", body: "i want a bread workshop — notes at https://notes.example.com/x" }),
    ] });
    await c.refreshMemory(w.id);
    const [demand] = await c.listDemands(w.id);
    const pack = await c.createProposal(w.id, demand.id);
    expect(await c.listFiles(w.id)).toEqual([]);
    expect((await c.listTimeline(w.id)).length).toBeGreaterThanOrEqual(1);
    expect((await c.listResources(w.id)).map((r) => r.url)).toContain("https://notes.example.com/x");
    expect((await c.listProposals(w.id)).map((p) => p.id)).toEqual([pack.id]);
    expect((await c.getProposal(pack.id)).id).toBe(pack.id);
    await c.approveProposal(pack.id);
    expect((await c.listGuests((await c.goLive(pack.id)).id).catch(() => [])).length).toBe(0);
  });

  it("search hits members and demands identically in every mode", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "Searchy" });
    await c.ingest(w.id, { source: { kind: "whatsapp", name: "t" }, messages: [
      normalizedMessage({ id: "1", author: "Ada", body: "i want a bread workshop" }),
    ] });
    await c.refreshMemory(w.id);
    const hits = await c.search("ada");
    expect(hits.some((h) => h.type === "member")).toBe(true);
    const demandHits = await c.search("workshop");
    expect(demandHits.some((h) => h.type === "demand")).toBe(true);
  });

  it("ingestDiscord lands a single normalized message", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "Cord" });
    const res = await c.ingestDiscord({
      id: "d1",
      communityId: w.id,
      timestamp: "2025-01-01T00:00:00Z",
      author: { id: "u1", username: "ada" },
      content: "i want a hack night",
    });
    expect(res.inserted + res.skipped).toBe(1);
    const msgs = await c.listMessages(w.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0].authorRaw).toBe("ada");
  });

  it("importChat accepts string, bytes and ArrayBuffer transcripts; corrupt zips 400", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "Imports" });
    const txt = "01/01/2025, 10:00 - Ada: i want a meetup\n";
    const r1 = await c.importChat(w.id, txt, "chat.txt");
    expect(r1.inserted).toBe(1);
    const r2 = await c.importChat(w.id, new TextEncoder().encode(txt.replace("meetup", "second meetup")), "chat.txt");
    expect(r2.inserted).toBe(1);
    const r3 = await c.importChat(w.id, new TextEncoder().encode(txt.replace("meetup", "third")).buffer as ArrayBuffer, "chat.txt");
    expect(r3.inserted).toBe(1);
    await expect(c.importChat(w.id, new Uint8Array([1, 2, 3]), "broken.zip")).rejects.toMatchObject({ status: 400 });
  });

  it("event handlers fire on mutations; off() removes them", async () => {
    const c = cos();
    const w = await c.createWorkspace({ name: "Hooks" });
    const seen: string[] = [];
    // Remote mode delivers via a poll timer — short interval, then wait a cycle.
    const off = c.on("*", (ev) => { seen.push(ev.kind); }, { pollMs: 10 });
    const settle = () => new Promise((r) => setTimeout(r, 80));
    await c.ingest(w.id, { source: { kind: "native", name: "t" }, messages: [normalizedMessage({ id: "1", author: "Ada", body: "i want bread" })] });
    await c.refreshMemory(w.id); // timeline-writing op → dispatches a "memory" event
    await settle();
    expect(seen.length).toBeGreaterThanOrEqual(1);
    off();
    const before = seen.length;
    await c.refreshMemory(w.id);
    await settle();
    expect(seen.length).toBe(before);
    // a throwing handler must not break the mutation path
    const offBad = c.on("*", () => { throw new Error("handler blew up"); }, { pollMs: 10 });
    await c.refreshMemory(w.id);
    await settle();
    offBad();
    expect(await c.listMessages(w.id)).toHaveLength(1);
  });
});
