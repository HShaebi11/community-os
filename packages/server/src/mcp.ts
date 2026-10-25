import type { Context, Hono } from "hono";
import { handleMcpRequest } from "@community-os/mcp/remote";
import type { AppEnv } from "./index.ts";

export function mountMcp(app: Hono<AppEnv>) {
  const handler = (c: Context<AppEnv>) =>
    handleMcpRequest(c.req.raw, {
      apiFetch: (path, init) => app.request(path, init) as Promise<Response>,
      loader: (c.env as Record<string, unknown> | undefined)?.LOADER,
    });
  app.all("/mcp", handler);
  app.all("/mcp/*", handler);
}
