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
});
