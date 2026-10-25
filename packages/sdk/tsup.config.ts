import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: { resolve: ["@community-os/core", "@community-os/whatsapp-import", "@community-os/server", "@community-os/mcp"] },
  clean: true,
  // Bundle the whole product: kernel, parser, server, MCP adapter — the
  // published package is Community OS in one install, zero runtime deps.
  noExternal: ["@community-os/core", "@community-os/whatsapp-import", "@community-os/server", "@community-os/mcp"],
  // Node-only / Workers-only runtimes stay external + lazily imported —
  // importing the package never pulls in node:http or cloudflare:workers.
  // serve() needs @hono/node-server; /mcp/code needs @cloudflare/codemode —
  // both optional peers, resolved only when those paths are invoked.
  external: ["@hono/node-server", "@cloudflare/codemode", "@cloudflare/codemode/mcp", "cloudflare:workers"],
  target: "node20",
});
