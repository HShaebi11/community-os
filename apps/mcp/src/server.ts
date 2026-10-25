import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dispatch, tools, type ToolContext } from "./tools.ts";

const inputShapes = {
  search_memory: { q: z.string().describe("Search query") },
  get_member: { memberId: z.string().describe("Member id") },
  list_demand: {},
  create_proposal: { demandId: z.string().describe("Demand id") },
  get_event: { slug: z.string().describe("Public event slug") },
  draft_message: { proposalId: z.string().describe("Proposal id") },
} as const;

export function createCosMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "community-os", version: "0.1.0" });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: inputShapes[tool.name] },
      async (args: Record<string, string>) => {
        const result = await dispatch(tool.name, args, ctx);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      },
    );
  }
  return server;
}
