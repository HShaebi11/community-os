import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "@community-os/core";
import { describe, expect, it } from "vitest";
import { createApp, type WebhookDelivery } from "./app.ts";

const chat = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/whatsapp-sample/_chat.txt"),
);

const headers = { "content-type": "application/json" };

describe("kernel API", () => {
  it("curl path: workspace → import → members", async () => {
    const app = createApp(new MemoryStore());

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };
    expect(workspace.id).toBeTruthy();

    const imported = await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: chat,
    });
    const result = (await imported.json()) as { inserted: number; members: unknown[] };
    expect(imported.status).toBe(200);
    expect(result.inserted).toBeGreaterThan(0);
    expect(result.members.length).toBeGreaterThan(2);

    const members = await app.request(`/v1/workspaces/${workspace.id}/members`);
    const list = (await members.json()) as unknown[];
    expect(list.length).toBe(result.members.length);
  });

  it("curl path: import → memory → cited member and demand cards", async () => {
    const app = createApp(new MemoryStore());

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };

    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: chat,
    });

    const memoryRes = await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST" });
    expect(memoryRes.status).toBe(200);
    const memory = (await memoryRes.json()) as {
      members: Array<{ id: string; do: string | null; want: string | null; offer: string | null }>;
      demands: Array<{ id: string }>;
      resources: Array<{ url: string }>;
    };
    expect(memory.members.some((m) => m.do || m.want || m.offer)).toBe(true);
    expect(memory.demands.length).toBeGreaterThan(0);

    const filled = memory.members.find((m) => m.do || m.want || m.offer)!;
    const cardRes = await app.request(`/v1/members/${filled.id}`);
    const card = (await cardRes.json()) as { citations: Array<{ quote: string }> };
    expect(cardRes.status).toBe(200);
    expect(card.citations.length).toBeGreaterThan(0);

    const briefRes = await app.request(`/v1/workspaces/${workspace.id}/briefing`);
    const brief = (await briefRes.json()) as {
      people: number;
      topDemands: unknown[];
      resources: Array<{ url: string }>;
    };
    expect(brief.people).toBeGreaterThan(2);
    expect(brief.topDemands.length).toBeGreaterThan(0);
    expect(brief.resources.some((r) => r.url.includes("example.com/community-os-notes"))).toBe(true);

    const demandRes = await app.request(`/v1/demands/${memory.demands[0].id}`);
    const demand = (await demandRes.json()) as { title: string | null; citations: unknown[] };
    expect(demandRes.status).toBe(200);
    expect(demand.title).toBeTruthy();
    expect(demand.citations.length).toBeGreaterThan(0);

    const resources = await app.request(`/v1/workspaces/${workspace.id}/resources`);
    const list = (await resources.json()) as Array<{ url: string }>;
    expect(list.some((r) => r.url === "https://example.com/community-os-notes")).toBe(true);
  });

  it("curl path: demand → proposal pack → approve → outreach", async () => {
    const app = createApp(new MemoryStore());

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };

    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: chat,
    });

    const memoryRes = await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST" });
    const memory = (await memoryRes.json()) as { demands: Array<{ id: string }> };
    expect(memory.demands.length).toBeGreaterThan(0);

    const venueRes = await app.request(`/v1/workspaces/${workspace.id}/venues`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Expedite HQ", area: "Hammersmith", capacity: 80 }),
    });
    expect(venueRes.status).toBe(201);

    const created = await app.request(`/v1/workspaces/${workspace.id}/proposals`, {
      method: "POST",
      headers,
      body: JSON.stringify({ demandId: memory.demands[0].id }),
    });
    expect(created.status).toBe(201);
    const pack = (await created.json()) as {
      id: string;
      status: string;
      explanation: string | null;
      speakers: unknown[];
      venue: { name: string } | null;
      citations: Array<{ quote: string }>;
    };
    expect(pack.status).toBe("draft");
    expect(pack.speakers.length).toBeGreaterThan(0);
    expect(pack.venue?.name).toBe("Expedite HQ");
    expect(pack.explanation).toBeTruthy();
    expect(pack.citations.length).toBeGreaterThan(0);

    const got = await app.request(`/v1/proposals/${pack.id}`);
    expect(got.status).toBe(200);
    const opened = (await got.json()) as { id: string; speakers: unknown[] };
    expect(opened.id).toBe(pack.id);
    expect(opened.speakers.length).toBe(pack.speakers.length);

    const approved = await app.request(`/v1/proposals/${pack.id}/approve`, { method: "POST" });
    expect(approved.status).toBe(200);
    const approvedPack = (await approved.json()) as { status: string };
    expect(approvedPack.status).toBe("approved");

    const outreach = await app.request(`/v1/proposals/${pack.id}/outreach`, { method: "POST" });
    expect(outreach.status).toBe(200);
    const drafted = (await outreach.json()) as { outreachDraft: string | null };
    expect(drafted.outreachDraft).toMatch(/Weird Stuff/);
  });

  it("curl path: go-live → public pages → RSVP → guests", async () => {
    const app = createApp(new MemoryStore());

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string; slug: string };

    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: chat,
    });
    const memoryRes = await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST" });
    const memory = (await memoryRes.json()) as { demands: Array<{ id: string }>; members: Array<{ id: string }> };
    await app.request(`/v1/workspaces/${workspace.id}/venues`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Expedite HQ", area: "Hammersmith", capacity: 80 }),
    });
    const created = await app.request(`/v1/workspaces/${workspace.id}/proposals`, {
      method: "POST",
      headers,
      body: JSON.stringify({ demandId: memory.demands[0].id }),
    });
    const pack = (await created.json()) as { id: string; speakers: Array<{ id: string }> };
    await app.request(`/v1/proposals/${pack.id}/approve`, { method: "POST" });
    const live = await app.request(`/v1/proposals/${pack.id}/go-live`, { method: "POST" });
    expect(live.status).toBe(200);
    const event = (await live.json()) as { id: string; slug: string; title: string };

    const rsvpRes = await app.request(`/v1/public/events/${event.slug}/rsvp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Guest", email: "guest@example.com" }),
    });
    expect(rsvpRes.status).toBe(201);
    const guests = await app.request(`/v1/events/${event.id}/guests`);
    const list = (await guests.json()) as Array<{ email: string }>;
    expect(list.some((g) => g.email === "guest@example.com")).toBe(true);

    const pub = await app.request(`/v1/public/events/${event.slug}`);
    expect(pub.status).toBe(200);
    const body = (await pub.json()) as {
      title: string;
      venue: { name: string } | null;
      messages?: unknown;
      demand?: unknown;
    };
    expect(body.title).toBe(event.title);
    expect(body.venue?.name).toBe("Expedite HQ");
    expect(body.messages).toBeUndefined();
    expect(body.demand).toBeUndefined();

    const community = await app.request(`/v1/public/communities/${workspace.slug}`);
    expect(community.status).toBe(200);
    const communityBody = (await community.json()) as { qrSvg: string; name: string };
    expect(communityBody.qrSvg).toContain("<svg");
    expect(communityBody.name).toBeTruthy();

    const hidden = await app.request(`/v1/public/members/not-a-member`);
    expect(hidden.status).toBe(404);

    const opted = await app.request(`/v1/members/${pack.speakers[0].id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ publicOptIn: true }),
    });
    const member = (await opted.json()) as { publicSlug: string; publicOptIn: boolean };
    expect(member.publicOptIn).toBe(true);
    expect(member.publicSlug).toBeTruthy();
    const publicMember = await app.request(`/v1/public/members/${member.publicSlug}`);
    expect(publicMember.status).toBe(200);
    const publicBody = (await publicMember.json()) as Record<string, unknown>;
    expect(publicBody.want).toBeUndefined();

    const chain = await app.request(`/v1/events/${event.id}/chain`);
    expect(chain.status).toBe(200);
    const privateChain = (await chain.json()) as { messages: unknown[] };
    expect(privateChain.messages.length).toBeGreaterThan(0);
  });

  it("desk and search are clients of the same /v1 memory", async () => {
    const app = createApp(new MemoryStore());
    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };
    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: chat,
    });
    await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST" });
    const search = await app.request("/v1/search?q=workshop");
    expect(search.status).toBe(200);
    const hits = (await search.json()) as Array<{ type: string }>;
    expect(hits.some((h) => h.type === "member" || h.type === "demand")).toBe(true);
  });
});

describe("open access", () => {
  it("every route is reachable without credentials", async () => {
    const app = createApp(new MemoryStore());
    const res = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "No Keys" }),
    });
    expect(res.status).toBe(201);
    const workspace = (await res.json()) as { id: string; createdBy: string };
    expect(workspace.createdBy).toBe("local");
  });

  it("workspaces list marks every workspace as owner", async () => {
    const app = createApp(new MemoryStore());
    await app.request("/v1/workspaces", { method: "POST", headers, body: JSON.stringify({ name: "Weird Stuff" }) });
    const res = await app.request("/v1/workspaces");
    const list = (await res.json()) as Array<{ role: string }>;
    expect(list[0].role).toBe("owner");
  });

  it("by-slug resolves for anyone", async () => {
    const app = createApp(new MemoryStore());
    const created = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await created.json()) as { slug: string };

    const res = await app.request(`/v1/workspaces/by-slug/${workspace.slug}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string; role: string };
    expect(body.slug).toBe(workspace.slug);
    expect(body.role).toBe("owner");
  });

  it("PATCH workspace updates name and join url", async () => {
    const app = createApp(new MemoryStore());
    const created = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await created.json()) as { id: string };

    const patched = await app.request(`/v1/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: "Weirder Stuff", joinUrl: "https://chat.example.com/x" }),
    });
    expect(patched.status).toBe(200);
    const body = (await patched.json()) as { name: string; joinUrl: string };
    expect(body.name).toBe("Weirder Stuff");
    expect(body.joinUrl).toBe("https://chat.example.com/x");
  });
});

describe("webhooks", () => {
  it("delivers signed events to matching subscriptions only", async () => {
    const deliveries: WebhookDelivery[] = [];
    const app = createApp(new MemoryStore(), {
      deliverWebhook: (d) => {
        deliveries.push(d);
      },
    });

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };

    const subRes = await app.request(`/v1/workspaces/${workspace.id}/webhooks`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: "https://hooks.example.com/imports", kinds: ["import"] }),
    });
    expect(subRes.status).toBe(201);
    const sub = (await subRes.json()) as { id: string; secret: string; kinds: string[] };
    expect(sub.secret).toMatch(/^whsec_/);
    expect(sub.kinds).toEqual(["import"]);

    const anyRes = await app.request(`/v1/workspaces/${workspace.id}/webhooks`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: "https://hooks.example.com/all" }),
    });
    expect(anyRes.status).toBe(201);

    const listRes = await app.request(`/v1/workspaces/${workspace.id}/webhooks`);
    const list = (await listRes.json()) as Array<{ id: string; secret?: string }>;
    expect(list.length).toBe(2);
    expect(list.every((s) => s.secret === undefined)).toBe(true);

    const imported = await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: chat,
    });
    expect(imported.status).toBe(200);

    expect(deliveries.length).toBe(2);
    const targeted = deliveries.find((d) => d.url === "https://hooks.example.com/imports")!;
    const payload = JSON.parse(targeted.body) as { kind: string; workspaceId: string; data: { inserted: number } };
    expect(payload.kind).toBe("import");
    expect(payload.workspaceId).toBe(workspace.id);
    expect(payload.data.inserted).toBeGreaterThan(0);
    expect(targeted.headers["x-communityos-event"]).toBe("import");

    const expected = createHmac("sha256", sub.secret).update(targeted.body).digest("hex");
    expect(targeted.headers["x-communityos-signature"]).toBe(`sha256=${expected}`);
  });

  it("rejects non-http urls and removes subscriptions on delete", async () => {
    const deliveries: WebhookDelivery[] = [];
    const app = createApp(new MemoryStore(), {
      deliverWebhook: (d) => {
        deliveries.push(d);
      },
    });
    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };

    const bad = await app.request(`/v1/workspaces/${workspace.id}/webhooks`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: "not-a-url" }),
    });
    expect(bad.status).toBe(400);

    const subRes = await app.request(`/v1/workspaces/${workspace.id}/webhooks`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: "https://hooks.example.com/x" }),
    });
    const sub = (await subRes.json()) as { id: string };

    const del = await app.request(`/v1/webhooks/${sub.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const again = await app.request(`/v1/webhooks/${sub.id}`, { method: "DELETE" });
    expect(again.status).toBe(404);

    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: chat,
    });
    expect(deliveries.length).toBe(0);
  });
});
