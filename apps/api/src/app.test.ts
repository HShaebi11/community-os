import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "@community-os/core";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

const chat = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/whatsapp-sample/_chat.txt"),
);

describe("kernel API", () => {
  it("curl path: auth → workspace → import → members", async () => {
    const app = createApp(new MemoryStore());
    const auth = await app.request("/v1/auth/dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com" }),
    });
    expect(auth.status).toBe(200);
    const { token } = (await auth.json()) as { token: string };
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };
    expect(workspace.id).toBeTruthy();

    const imported = await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
      body: chat,
    });
    const result = (await imported.json()) as { inserted: number; members: unknown[] };
    expect(imported.status).toBe(200);
    expect(result.inserted).toBeGreaterThan(0);
    expect(result.members.length).toBeGreaterThan(2);

    const members = await app.request(`/v1/workspaces/${workspace.id}/members`, { headers });
    const list = (await members.json()) as unknown[];
    expect(list.length).toBe(result.members.length);
  });

  it("curl path: import → memory → cited member and demand cards", async () => {
    const app = createApp(new MemoryStore());
    const auth = await app.request("/v1/auth/dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com" }),
    });
    const { token } = (await auth.json()) as { token: string };
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };

    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
      body: chat,
    });

    const memoryRes = await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST", headers });
    expect(memoryRes.status).toBe(200);
    const memory = (await memoryRes.json()) as {
      members: Array<{ id: string; do: string | null; want: string | null; offer: string | null }>;
      demands: Array<{ id: string }>;
      resources: Array<{ url: string }>;
    };
    expect(memory.members.some((m) => m.do || m.want || m.offer)).toBe(true);
    expect(memory.demands.length).toBeGreaterThan(0);

    const filled = memory.members.find((m) => m.do || m.want || m.offer)!;
    const cardRes = await app.request(`/v1/members/${filled.id}`, { headers });
    const card = (await cardRes.json()) as { citations: Array<{ quote: string }> };
    expect(cardRes.status).toBe(200);
    expect(card.citations.length).toBeGreaterThan(0);

    const briefRes = await app.request(`/v1/workspaces/${workspace.id}/briefing`, { headers });
    const brief = (await briefRes.json()) as {
      people: number;
      topDemands: unknown[];
      resources: Array<{ url: string }>;
    };
    expect(brief.people).toBeGreaterThan(2);
    expect(brief.topDemands.length).toBeGreaterThan(0);
    expect(brief.resources.some((r) => r.url.includes("example.com/community-os-notes"))).toBe(true);

    const demandRes = await app.request(`/v1/demands/${memory.demands[0].id}`, { headers });
    const demand = (await demandRes.json()) as { title: string | null; citations: unknown[] };
    expect(demandRes.status).toBe(200);
    expect(demand.title).toBeTruthy();
    expect(demand.citations.length).toBeGreaterThan(0);

    const resources = await app.request(`/v1/workspaces/${workspace.id}/resources`, { headers });
    const list = (await resources.json()) as Array<{ url: string }>;
    expect(list.some((r) => r.url === "https://example.com/community-os-notes")).toBe(true);
  });

  it("curl path: demand → proposal pack → approve → outreach", async () => {
    const app = createApp(new MemoryStore());
    const auth = await app.request("/v1/auth/dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com" }),
    });
    const { token } = (await auth.json()) as { token: string };
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };

    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
      body: chat,
    });

    const memoryRes = await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST", headers });
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

    const got = await app.request(`/v1/proposals/${pack.id}`, { headers });
    expect(got.status).toBe(200);
    const opened = (await got.json()) as { id: string; speakers: unknown[] };
    expect(opened.id).toBe(pack.id);
    expect(opened.speakers.length).toBe(pack.speakers.length);

    const approved = await app.request(`/v1/proposals/${pack.id}/approve`, { method: "POST", headers });
    expect(approved.status).toBe(200);
    const approvedPack = (await approved.json()) as { status: string };
    expect(approvedPack.status).toBe("approved");

    const outreach = await app.request(`/v1/proposals/${pack.id}/outreach`, { method: "POST", headers });
    expect(outreach.status).toBe(200);
    const drafted = (await outreach.json()) as { outreachDraft: string | null };
    expect(drafted.outreachDraft).toMatch(/Weird Stuff/);
  });

  it("curl path: go-live → public pages → RSVP → guests", async () => {
    const app = createApp(new MemoryStore());
    const auth = await app.request("/v1/auth/dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com" }),
    });
    const { token } = (await auth.json()) as { token: string };
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string; slug: string };

    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
      body: chat,
    });
    const memoryRes = await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST", headers });
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
    await app.request(`/v1/proposals/${pack.id}/approve`, { method: "POST", headers });
    const live = await app.request(`/v1/proposals/${pack.id}/go-live`, { method: "POST", headers });
    expect(live.status).toBe(200);
    const event = (await live.json()) as { id: string; slug: string; title: string };

    const html = await app.request(`/e/${event.slug}`);
    expect(html.status).toBe(200);
    const page = await html.text();
    expect(page).toContain(event.title);
    expect(page).toContain("Expedite HQ");
    expect(page).toContain("<form");

    const rsvpRes = await app.request(`/v1/public/events/${event.slug}/rsvp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Guest", email: "guest@example.com" }),
    });
    expect(rsvpRes.status).toBe(201);
    const guests = await app.request(`/v1/events/${event.id}/guests`, { headers });
    const list = (await guests.json()) as Array<{ email: string }>;
    expect(list.some((g) => g.email === "guest@example.com")).toBe(true);

    const pub = await app.request(`/v1/public/events/${event.slug}`);
    expect(pub.status).toBe(200);
    const body = (await pub.json()) as Record<string, unknown>;
    expect(body.messages).toBeUndefined();
    expect(body.demand).toBeUndefined();

    const community = await app.request(`/v1/public/communities/${workspace.slug}`);
    expect(community.status).toBe(200);
    const communityPage = await app.request(`/c/${workspace.slug}`);
    expect(communityPage.status).toBe(200);
    expect(await communityPage.text()).toContain("<svg");

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
    const card = await app.request(`/m/${member.publicSlug}`);
    expect(card.status).toBe(200);
    const publicMember = await app.request(`/v1/public/members/${member.publicSlug}`);
    expect(publicMember.status).toBe(200);
    const publicBody = (await publicMember.json()) as Record<string, unknown>;
    expect(publicBody.want).toBeUndefined();

    const chain = await app.request(`/v1/events/${event.id}/chain`, { headers });
    expect(chain.status).toBe(200);
    const privateChain = (await chain.json()) as { messages: unknown[] };
    expect(privateChain.messages.length).toBeGreaterThan(0);
  });
});
