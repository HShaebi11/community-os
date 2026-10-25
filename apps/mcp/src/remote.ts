import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Executor } from "@cloudflare/codemode";
import { createCosMcpServer } from "./server.ts";
import type { Api, ToolContext } from "./tools.ts";

export type RemoteMcpOptions = {
  /** In-process fetch onto the API surface (e.g. `app.request`). Authorization is injected. */
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  /** `env.LOADER` Worker Loader binding. Required for `/mcp/code`. */
  loader?: unknown;
  /** Test seam: a prebuilt executor overrides `loader`. */
  executor?: Executor;
};

const CODE_PATH = "/mcp/code";
const CODE_DESCRIPTION = `Run JavaScript inside a Cloudflare sandbox against this Community OS workspace. The six MCP tools are callable as \`await codemode.<name>(args)\` — there is no send_message; drafts come back for a human to send. The sandbox cannot fetch anything else.

{{types}}

Example:
{{example}}`;

export async function handleMcpRequest(request: Request, opts: RemoteMcpOptions): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/mcp" && url.pathname !== CODE_PATH) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const workspaceId = url.searchParams.get("workspace") ?? request.headers.get("x-cos-workspace") ?? "";
  const api: Api = async (path, init) => {
    const res = await opts.apiFetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text);
    return text ? JSON.parse(text) : {};
  };
  const ctx: ToolContext = { api, workspaceId };

  let server = createCosMcpServer(ctx);
  if (url.pathname === CODE_PATH) {
    const executor = opts.executor ?? (opts.loader ? await workerExecutor(opts.loader) : null);
    if (!executor) {
      return Response.json({ error: "code mode unavailable: LOADER binding missing" }, { status: 503 });
    }
    const { codeMcpServer } = await import("@cloudflare/codemode/mcp");
    server = await codeMcpServer({ server, executor, description: CODE_DESCRIPTION });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

async function workerExecutor(loader: unknown): Promise<Executor> {
  const { DynamicWorkerExecutor } = await import("@cloudflare/codemode");
  return new DynamicWorkerExecutor({ loader: loader as never });
}
