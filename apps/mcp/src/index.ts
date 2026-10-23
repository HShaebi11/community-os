#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const base = process.env.COMMUNITY_OS_API_URL ?? "http://localhost:5173";
const token = process.env.COMMUNITY_OS_TOKEN ?? "";
const workspaceId = process.env.COMMUNITY_OS_WORKSPACE_ID ?? "";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text ? JSON.parse(text) : {};
}

const server = new Server({ name: "community-os", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "search_memory", description: "Search member cards and demand", inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] } },
    { name: "get_member", description: "Get a member card by id", inputSchema: { type: "object", properties: { memberId: { type: "string" } }, required: ["memberId"] } },
    { name: "list_demand", description: "List demand for the workspace", inputSchema: { type: "object", properties: {} } },
    { name: "create_proposal", description: "Create a proposal from a demand id", inputSchema: { type: "object", properties: { demandId: { type: "string" } }, required: ["demandId"] } },
    { name: "get_event", description: "Get a native event by slug", inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] } },
    { name: "draft_message", description: "Draft outreach for a proposal (does not send)", inputSchema: { type: "object", properties: { proposalId: { type: "string" } }, required: ["proposalId"] } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, string>;
  let result: unknown;
  if (name === "search_memory") result = await api(`/v1/search?q=${encodeURIComponent(args.q)}`);
  else if (name === "get_member") result = await api(`/v1/members/${args.memberId}`);
  else if (name === "list_demand") result = await api(`/v1/workspaces/${workspaceId}/demands`);
  else if (name === "create_proposal") result = await api(`/v1/workspaces/${workspaceId}/proposals`, { method: "POST", body: JSON.stringify({ demandId: args.demandId }) });
  else if (name === "get_event") result = await api(`/v1/public/events/${args.slug}`);
  else if (name === "draft_message") result = await api(`/v1/proposals/${args.proposalId}/outreach`, { method: "POST" });
  else throw new Error("unknown tool");
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
