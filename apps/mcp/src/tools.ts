export type Api = (path: string, init?: RequestInit) => Promise<unknown>;

export type ToolContext = {
  workspaceId: string;
  api: Api;
};

export const tools = [
  {
    name: "search_memory",
    description: "Search member cards and demand",
    inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
  },
  {
    name: "get_member",
    description: "Get a member card by id",
    inputSchema: { type: "object", properties: { memberId: { type: "string" } }, required: ["memberId"] },
  },
  {
    name: "list_demand",
    description: "List demand for the workspace",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_proposal",
    description: "Create a proposal from a demand id",
    inputSchema: { type: "object", properties: { demandId: { type: "string" } }, required: ["demandId"] },
  },
  {
    name: "get_event",
    description: "Get a native event by slug",
    inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
  },
  {
    name: "draft_message",
    description: "Draft outreach for a proposal (does not send)",
    inputSchema: { type: "object", properties: { proposalId: { type: "string" } }, required: ["proposalId"] },
  },
] as const;

export async function dispatch(name: string, args: Record<string, string>, ctx: ToolContext) {
  if (name === "search_memory") return ctx.api(`/v1/search?q=${encodeURIComponent(args.q ?? "")}`);
  if (name === "get_member") return ctx.api(`/v1/members/${args.memberId}`);
  if (name === "list_demand") return ctx.api(`/v1/workspaces/${ctx.workspaceId}/demands`);
  if (name === "create_proposal") {
    return ctx.api(`/v1/workspaces/${ctx.workspaceId}/proposals`, {
      method: "POST",
      body: JSON.stringify({ demandId: args.demandId }),
    });
  }
  if (name === "get_event") return ctx.api(`/v1/public/events/${args.slug}`);
  if (name === "draft_message") return ctx.api(`/v1/proposals/${args.proposalId}/outreach`, { method: "POST" });
  throw new Error("unknown tool");
}
