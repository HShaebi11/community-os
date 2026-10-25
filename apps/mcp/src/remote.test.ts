import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "@community-os/core";
import { createApp } from "../../api/src/app.ts";
import { beforeAll, describe, expect, it } from "vitest";
import { handleMcpRequest } from "./remote.ts";

const chat = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/whatsapp-sample/_chat.txt"));

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

type JsonRpc = { jsonrpc: string; id?: number; method: string; params?: unknown };
type StubExecutor = { execute: (code: string) => Promise<{ result: unknown }> };

let workspaceId: string;
let app: ReturnType<typeof createApp>;
let stubExecutor: StubExecutor | undefined;

function rpc(path: string, message: JsonRpc) {
  return handleMcpRequest(
    new Request(`http://test.local${path}`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: JSON.stringify(message),
    }),
    {
      apiFetch: (p, i) => app.request(p, i) as Promise<Response>,
      executor: stubExecutor,
    },
  );
}

beforeAll(async () => {
  app = createApp(new MemoryStore());
  const headers = { "content-type": "application/json" };
  const ws = await app.request("/v1/workspaces", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Weird Stuff" }),
  });
  workspaceId = ((await ws.json()) as { id: string }).id;
  await app.request(`/v1/workspaces/${workspaceId}/imports?filename=_chat.txt`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: chat,
  });
  await app.request(`/v1/workspaces/${workspaceId}/memory`, { method: "POST", headers });
});

describe("POST /mcp", () => {
  it("accepts requests without credentials", async () => {
    const res = await rpc("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(res.status).toBe(200);
  });

  it("lists the six /v1 tools and no send_message", async () => {
    const res = await rpc("/mcp?workspace=" + workspaceId, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { tools: Array<{ name: string }> } };
    const names = body.result.tools.map((t) => t.name);
    expect(names).toEqual(["search_memory", "get_member", "list_demand", "create_proposal", "get_event", "draft_message"]);
    expect(names).not.toContain("send_message");
  });

  it("calls search_memory against /v1 for the caller's workspace", async () => {
    const res = await rpc(`/mcp?workspace=${workspaceId}`, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "search_memory", arguments: { q: "workshop" } },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { content: Array<{ text: string }> } };
    const hits = JSON.parse(body.result.content[0].text) as Array<{ type: string }>;
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe("POST /mcp/code", () => {
  it("503s when no executor or LOADER is available", async () => {
    stubExecutor = undefined;
    const res = await rpc("/mcp/code", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect(res.status).toBe(503);
  });

  it("exposes a single code tool that runs through the executor", async () => {
    const calls: Array<{ code: string }> = [];
    stubExecutor = {
      execute: async (code: string) => {
        calls.push({ code });
        return { result: { ok: true } };
      },
    };
    const list = await rpc("/mcp/code", { jsonrpc: "2.0", id: 1, method: "tools/list" });
    const listed = (await list.json()) as { result: { tools: Array<{ name: string }> } };
    expect(listed.result.tools.map((t) => t.name)).toEqual(["code"]);

    const call = await rpc("/mcp/code", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "code", arguments: { code: "async () => codemode.search_memory({ q: 'workshop' })" } },
    });
    expect(call.status).toBe(200);
    const body = (await call.json()) as { result: { content: Array<{ text: string }>; isError?: boolean } };
    expect(body.result.isError).not.toBe(true);
    expect(calls[0].code).toContain("codemode.search_memory");
    expect(body.result.content[0].text).toContain("ok");
  });
});
