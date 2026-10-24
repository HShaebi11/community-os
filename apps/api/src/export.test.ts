import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "@community-os/core";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

const chat = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/whatsapp-sample/_chat.txt"),
);

async function devHeaders(app: ReturnType<typeof createApp>, email = "lead@example.com") {
  const res = await app.request("/v1/auth/dev", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const { token } = (await res.json()) as { token: string };
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

describe("workspace export", () => {
  it("requires auth and lead membership", async () => {
    const app = createApp(new MemoryStore());
    const headers = await devHeaders(app);
    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };

    const anon = await app.request(`/v1/workspaces/${workspace.id}/export`);
    expect(anon.status).toBe(401);

    const other = await devHeaders(app, "other@example.com");
    const denied = await app.request(`/v1/workspaces/${workspace.id}/export`, { headers: other });
    expect(denied.status).toBe(403);

    const ok = await app.request(`/v1/workspaces/${workspace.id}/export`, { headers });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toContain("attachment");
  });

  it("exports members, demands, events, guests, citations, and message ids without bodies", async () => {
    const app = createApp(new MemoryStore());
    const headers = await devHeaders(app);
    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string; slug: string };

    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { authorization: headers.authorization, "content-type": "text/plain" },
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
    const pack = (await created.json()) as { id: string };
    await app.request(`/v1/proposals/${pack.id}/approve`, { method: "POST", headers });
    const live = await app.request(`/v1/proposals/${pack.id}/go-live`, { method: "POST", headers });
    const event = (await live.json()) as { id: string; slug: string };
    await app.request(`/v1/public/events/${event.slug}/rsvp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Guest", email: "guest@example.com" }),
    });

    const res = await app.request(`/v1/workspaces/${workspace.id}/export`, { headers });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      version: number;
      exportedAt: string;
      workspace: { id: string; slug: string };
      sources: unknown[];
      members: Array<{ id: string; displayName: string }>;
      demands: Array<{ id: string }>;
      proposals: Array<{ id: string }>;
      venues: Array<{ name: string }>;
      sponsors: unknown[];
      resources: Array<{ url: string }>;
      files: unknown[];
      events: Array<{ id: string; slug: string }>;
      guests: Array<{ email: string; eventId: string }>;
      citations: Array<{ objectType: string; messageId: string; quote: string }>;
      messages: Array<Record<string, unknown>>;
    };

    expect(data.version).toBe(1);
    expect(data.workspace.id).toBe(workspace.id);
    expect(data.workspace.slug).toBe(workspace.slug);
    expect(data.members.length).toBe(memory.members.length);
    expect(data.demands.length).toBe(memory.demands.length);
    expect(data.proposals.map((p) => p.id)).toContain(pack.id);
    expect(data.events.map((e) => e.id)).toContain(event.id);
    expect(data.venues.map((v) => v.name)).toContain("Expedite HQ");
    expect(data.guests.some((g) => g.email === "guest@example.com" && g.eventId === event.id)).toBe(true);
    expect(data.citations.some((c) => c.objectType === "member" && c.quote)).toBe(true);
    expect(data.citations.some((c) => c.objectType === "demand" && c.quote)).toBe(true);

    expect(data.messages.length).toBeGreaterThan(0);
    for (const message of data.messages) {
      expect(message.id).toBeTruthy();
      expect(message.body).toBeUndefined();
    }
    const messageIds = new Set(data.messages.map((m) => m.id));
    expect(data.citations.every((c) => messageIds.has(c.messageId))).toBe(true);
  });
});
