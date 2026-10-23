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
});
