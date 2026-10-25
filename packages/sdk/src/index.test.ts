import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "@community-os/core";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../apps/api/src/app.ts";
import { ApiError, CommunityOS, verifyWebhookSignature } from "./index.ts";

const chat = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/whatsapp-sample/_chat.txt"),
);

/** Remote mode: the real Hono app served through the injected fetch, so this
 *  exercises the actual HTTP contract — routes, status codes, wire shapes. */
function remoteCos() {
  const app = createApp(new MemoryStore());
  const fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    app.request(String(input), init)) as typeof globalThis.fetch;
  return new CommunityOS({ baseUrl: "http://remote.test", fetch, publicOrigin: "https://pub.test" });
}

async function kernelLoop(cos: CommunityOS) {
  const ws = await cos.createWorkspace({ name: "Weird Stuff", joinUrl: "https://chat.whatsapp.com/x" });
  const imported = await cos.importChat(ws.id, chat, "_chat.txt");
  expect(imported.inserted).toBeGreaterThan(0);
  expect(imported.members.length).toBeGreaterThan(2);

  const memory = await cos.refreshMemory(ws.id);
  expect(memory.demands.length).toBeGreaterThan(0);

  const members = await cos.listMembers(ws.id);
  const card = await cos.getMember(members[0]!.id);
  expect(card.displayName).toBe(members[0]!.displayName);
  expect(Array.isArray(card.citations)).toBe(true);

  const pack = await cos.createProposal(ws.id, memory.demands[0]!.id);
  expect(pack.status).toBe("draft");

  const approved = await cos.approveProposal(pack.id);
  expect(approved.status).toBe("approved");

  const drafted = await cos.draftOutreach(pack.id);
  expect(drafted.outreachDraft).toBeTruthy();

  const event = await cos.goLive(pack.id);
  expect(event.slug).toBeTruthy();

  const pub = await cos.publicEvent(event.slug);
  expect(pub.community.slug).toBe(ws.slug);

  const guest = await cos.rsvp(event.slug, { name: "Ada", email: "ada@test.dev" });
  expect(guest.name).toBe("Ada");
  expect((await cos.listGuests(event.id)).length).toBe(1);

  const chain = await cos.getEventChain(event.id);
  expect(chain.demand?.id).toBe(memory.demands[0]!.id);

  const exported = await cos.exportWorkspace(ws.id);
  expect(exported.workspace?.id).toBe(ws.id);
  expect(exported.messages.every((m) => !("body" in m))).toBe(true);

  return ws;
}

describe("remote transport", () => {
  it("runs the full kernel loop over HTTP", async () => {
    await kernelLoop(remoteCos());
  });

  it("sends X-Public-Origin and surfaces ApiError on 404", async () => {
    const app = createApp(new MemoryStore());
    const seen: string[] = [];
    const fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("x-public-origin") ?? "");
      return app.request(String(input), init);
    }) as typeof globalThis.fetch;
    const cos = new CommunityOS({ baseUrl: "http://remote.test", fetch, publicOrigin: "https://pub.test" });
    const ws = await cos.createWorkspace({ name: "T" });
    expect(seen[0]).toBe("https://pub.test");
    await expect(cos.getWorkspace("nope")).rejects.toMatchObject({ status: 404 });
    await expect(cos.getWorkspaceBySlug("nope")).rejects.toBeInstanceOf(ApiError);
    void ws;
  });
});

describe("embedded transport (CommunityOS.memory)", () => {
  it("runs the full kernel loop in-process — no server", async () => {
    await kernelLoop(CommunityOS.memory({ publicOrigin: "https://pub.test" }));
  });

  it("matches remote error semantics", async () => {
    const cos = CommunityOS.memory();
    await expect(cos.getWorkspace("nope")).rejects.toMatchObject({ status: 404 });
    await expect(cos.getMember("nope")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("webhooks", () => {
  it("creates, lists (secret hidden), deletes — remote and local", async () => {
    for (const cos of [remoteCos(), CommunityOS.memory()]) {
      const ws = await cos.createWorkspace({ name: "T" });
      const sub = await cos.createWebhook(ws.id, { url: "https://hooks.test/x" });
      expect(sub.secret).toMatch(/^whsec_/);
      const listed = await cos.listWebhooks(ws.id);
      expect(listed.length).toBe(1);
      expect("secret" in listed[0]!).toBe(false);
      expect(await cos.deleteWebhook(sub.id)).toEqual({ ok: true });
      expect(await cos.listWebhooks(ws.id)).toEqual([]);
    }
  });
});

describe("verifyWebhookSignature", () => {
  it("verifies a real signed body and rejects tampering", async () => {
    const body = JSON.stringify({ id: "d1", kind: "rsvp", data: {} });
    const secret = "whsec_test123";
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(await verifyWebhookSignature(body, `sha256=${sig}`, secret)).toBe(true);
    expect(await verifyWebhookSignature(body + "x", `sha256=${sig}`, secret)).toBe(false);
    expect(await verifyWebhookSignature(body, "bad-header", secret)).toBe(false);
  });
});
