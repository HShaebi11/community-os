#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCosMcpServer } from "./server.ts";

const base = process.env.COMMUNITY_OS_API_URL ?? "http://localhost:5173";
const workspaceId = process.env.COMMUNITY_OS_WORKSPACE_ID ?? "";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text ? JSON.parse(text) : {};
}

const server = createCosMcpServer({ api, workspaceId });
const transport = new StdioServerTransport();
await server.connect(transport);
