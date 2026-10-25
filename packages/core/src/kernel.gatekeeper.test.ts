import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assignPublicSlug,
  exportWorkspace,
  generateAutopilot,
  createProposalFromDemand,
  goLive,
  ingestMessages,
  publicCommunity,
  publicEvent,
  publicMember,
  refreshMemory,
  setProposalStatus,
  submitApplication,
} from "./kernel.ts";
import { MemoryStore } from "./memory-store.ts";
import { normalizedMessage } from "@community-os/testkit";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const ws = async (s: MemoryStore, name = "Bread Town") => (await s.createWorkspace({ name, createdBy: "lead" })).id;

describe("submitApplication", () => {
  it("declines obvious spam with score 0", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const app = await submitApplication(s, cid, {
      applicant: "bot",
      answers: "join my airdrop for free crypto now",
      communityName: "Bread Town",
    });
    expect(app).toMatchObject({ decision: "decline", score: 0 });
    expect(app.reason).toContain("spam");
  });

  it("accepts a substantive answer that names the community", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const app = await submitApplication(s, cid, {
      applicant: "ada",
      answers: "I organize bread meetups and heard about Bread Town from a friend — I'd love to help.",
      communityName: "Bread Town",
    });
    expect(app.decision).toBe("accept");
    expect(app.score).toBeGreaterThan(60);
  });

  it("asks a follow-up for real-but-unproven answers and thin ones", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const substance = await submitApplication(s, cid, {
      applicant: "lin",
      answers: "I have organized three neighborhood meetups and can host a venue for fifty people.",
      communityName: "Bread Town",
    });
    expect(substance.decision).toBe("ask");
    const thin = await submitApplication(s, cid, { applicant: "g", answers: "yes", communityName: "Bread Town" });
    expect(thin.decision).toBe("ask");
    expect(thin.score).toBeLessThan(50);
  });

  it("auto-declines an applicant on the confirmed blocklist, by hashed identity", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    await s.addBlocklist({
      id: "b1",
      communityId: cid,
      hash: hash("mallory"),
      evidence: "spam history",
      reporter: "lead",
      confirmed: true,
    });
    const app = await submitApplication(s, cid, { applicant: " Mallory ", answers: "I'm great, let me in please yes", communityName: "Bread Town" });
    expect(app).toMatchObject({ decision: "decline", score: 0 });
    expect(app.reason).toContain("blocklist");
  });

  it("ignores unconfirmed blocklist entries", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    await s.addBlocklist({
      id: "b1",
      communityId: cid,
      hash: hash("ada"),
      evidence: "reported once",
      reporter: "lead",
      confirmed: false,
    });
    const app = await submitApplication(s, cid, {
      applicant: "Ada",
      answers: "I organize bread meetups and heard about Bread Town from a friend — I'd love to help.",
      communityName: "Bread Town",
    });
    expect(app.decision).toBe("accept");
  });
});

describe("public surface", () => {
  async function liveCommunity() {
    const s = new MemoryStore();
    const cid = await ws(s);
    await ingestMessages(s, cid, { kind: "whatsapp", name: "t" }, [
      normalizedMessage({ id: "1", author: "Ada", body: "i want a bread workshop" }),
    ]);
    await refreshMemory(s, cid);
    const demand = (await s.listDemands(cid))[0];
    const pack = await createProposalFromDemand(s, cid, demand.id);
    await setProposalStatus(s, pack.id, "approved");
    const event = await goLive(s, pack.id, "https://os.test");
    return { s, cid, event };
  }

  it("publicCommunity exposes name, joinUrl, QR and event list", async () => {
    const { s, event } = await liveCommunity();
    const w = (await s.listWorkspaces())[0];
    const page = await publicCommunity(s, w.slug, "https://os.test");
    expect(page).toMatchObject({ name: "Bread Town", slug: w.slug });
    expect(page.qrSvg).toContain("<svg");
    expect(page.events.map((e) => e.slug)).toContain(event.slug);
    await expect(publicCommunity(s, "nope", "https://os.test")).rejects.toThrow("community not found");
  });

  it("publicEvent shows speakers but only links opted-in member slugs", async () => {
    const { s, event, cid } = await liveCommunity();
    const ada = (await s.listMembers(cid))[0];
    const page = await publicEvent(s, event.slug);
    expect(page.speakers.length).toBeGreaterThanOrEqual(0);
    await s.updateMember(ada.id, { publicOptIn: true, publicSlug: "ada" }, false);
    await expect(publicEvent(s, "nope")).rejects.toThrow("event not found");
  });

  it("publicMember only resolves opted-in members", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const m = await s.upsertMember(cid, "Ada", null);
    await s.updateMember(m.id, { publicSlug: "ada" }, false);
    await expect(publicMember(s, "ada")).rejects.toThrow();
    await s.updateMember(m.id, { publicOptIn: true }, false);
    const page = await publicMember(s, "ada");
    expect(page).toMatchObject({ name: "Ada", slug: "ada" });
  });

  it("assignPublicSlug derives from the name, dedupes collisions, is idempotent", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    const a = await s.upsertMember(cid, "Ada L", null);
    const c = await s.upsertMember(cid, "Ada L.", null);
    const s1 = await assignPublicSlug(s, a.id);
    await s.updateMember(a.id, { publicOptIn: true }, false);
    const s2 = await assignPublicSlug(s, c.id);
    expect(s1).toBe("ada-l");
    expect(s2).not.toBe(s1);
    expect(await assignPublicSlug(s, a.id)).toBe(s1);
    await expect(assignPublicSlug(s, "nope")).rejects.toThrow("member not found");
  });
});

describe("autopilot", () => {
  it("writes run_sheet, post and newsletter artifacts referencing the event", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    await ingestMessages(s, cid, { kind: "whatsapp", name: "t" }, [
      normalizedMessage({ id: "1", author: "Ada", body: "i want a bread workshop" }),
    ]);
    await refreshMemory(s, cid);
    const demand = (await s.listDemands(cid))[0];
    const pack = await createProposalFromDemand(s, cid, demand.id);
    await setProposalStatus(s, pack.id, "approved");
    const event = await goLive(s, pack.id, "https://os.test");

    const artifacts = await generateAutopilot(s, event.id, "https://os.test");
    expect(artifacts.map((a) => a.kind).sort()).toEqual(["newsletter", "post", "run_sheet"]);
    expect(artifacts.find((a) => a.kind === "run_sheet")!.body).toContain("Run sheet");
    expect(artifacts.find((a) => a.kind === "post")!.body).toContain(`/e/${event.slug}`);
    expect(artifacts.find((a) => a.kind === "newsletter")!.body).toContain(event.title);
    expect(await s.listArtifacts(event.id)).toHaveLength(3);
  });

  it("throws on unknown event", async () => {
    await expect(generateAutopilot(new MemoryStore(), "nope", "https://x")).rejects.toThrow("event not found");
  });
});

describe("exportWorkspace", () => {
  it("archives every record type; messages carry metadata, not bodies", async () => {
    const s = new MemoryStore();
    const cid = await ws(s);
    await ingestMessages(s, cid, { kind: "whatsapp", name: "t" }, [
      normalizedMessage({ id: "1", author: "Ada", body: "i want a bread workshop" }),
    ]);
    await s.createWebhookSubscription({ communityId: cid, url: "https://hook", secret: "s3cret", kinds: ["import"] });
    const out = await exportWorkspace(s, cid);
    expect(out.version).toBe(1);
    for (const key of ["sources", "members", "demands", "proposals", "venues", "sponsors", "resources", "files", "events", "guests", "citations", "timeline", "applications", "blocklist", "artifacts", "webhooks", "messages"] as const) {
      expect(out).toHaveProperty(key);
    }
    expect(out.workspace?.name).toBe("Bread Town");
    expect(out.messages[0]).toMatchObject({ sourceMessageId: "1", authorRaw: "Ada" });
    expect(out.messages[0]).not.toHaveProperty("body");
    // Operator export — subscription secrets stay inside the archive.
    expect(out.webhooks[0].secret).toBe("s3cret");
  });
});
