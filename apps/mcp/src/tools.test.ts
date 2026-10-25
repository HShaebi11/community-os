import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "@community-os/core";
import { createApp } from "../../api/src/app.ts";
import { describe, expect, it } from "vitest";
import { dispatch, tools } from "./tools.ts";

const chat = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/whatsapp-sample/_chat.txt"));

describe("MCP tools", () => {
  it("maps the spec tools onto /v1 and refuses send_message", async () => {
    const app = createApp(new MemoryStore());
    const headers = { "content-type": "application/json" };

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
    const memoryRes = await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST", headers });
    const memory = (await memoryRes.json()) as { demands: Array<{ id: string }>; members: Array<{ id: string }> };
    await app.request(`/v1/workspaces/${workspace.id}/venues`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Expedite HQ", area: "Hammersmith", capacity: 80 }),
    });

    const api = async (path: string, init?: RequestInit) => {
      const res = await app.request(path, {
        ...init,
        headers: { ...headers, ...(init?.headers ?? {}) },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text);
      return text ? JSON.parse(text) : {};
    };
    const ctx = { api, workspaceId: workspace.id };

    expect(tools.map((t) => t.name)).toEqual([
      "search_memory",
      "get_member",
      "list_demand",
      "create_proposal",
      "get_event",
      "draft_message",
    ]);
    expect(tools.some((t) => (t.name as string) === "send_message")).toBe(false);
    await expect(dispatch("send_message", {}, ctx)).rejects.toThrow("unknown tool");

    const hits = (await dispatch("search_memory", { q: "workshop" }, ctx)) as Array<{ type: string }>;
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.type === "member" || h.type === "demand")).toBe(true);

    const member = (await dispatch("get_member", { memberId: memory.members[0].id }, ctx)) as { id: string };
    expect(member.id).toBe(memory.members[0].id);

    const demands = (await dispatch("list_demand", {}, ctx)) as Array<{ id: string }>;
    expect(demands.length).toBeGreaterThan(0);

    const pack = (await dispatch("create_proposal", { demandId: memory.demands[0].id }, ctx)) as {
      id: string;
      status: string;
    };
    expect(pack.status).toBe("draft");

    const drafted = (await dispatch("draft_message", { proposalId: pack.id }, ctx)) as { outreachDraft: string | null };
    expect(drafted.outreachDraft).toBeTruthy();

    await app.request(`/v1/proposals/${pack.id}/approve`, { method: "POST", headers });
    const live = await app.request(`/v1/proposals/${pack.id}/go-live`, { method: "POST", headers });
    const event = (await live.json()) as { slug: string; title: string };
    const publicEvent = (await dispatch("get_event", { slug: event.slug }, ctx)) as { title: string; messages?: unknown };
    expect(publicEvent.title).toBe(event.title);
    expect(publicEvent.messages).toBeUndefined();
  });
});
