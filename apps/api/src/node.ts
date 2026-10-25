import { serve } from "@hono/node-server";
import { createNodeDb } from "@community-os/db";
import { createApp, memoryStore } from "./app.ts";
import { createDrizzleStore } from "./drizzle-store.ts";

// Plain-Node entrypoint for self-hosting without Cloudflare. Same Hono app,
// same store contract — only the transport and DB driver differ. Code Mode
// (`/mcp/code`) needs the Workers loader and is disabled here; `/v1` and `/mcp`
// are identical.
const store = process.env.DATABASE_URL ? createDrizzleStore(createNodeDb(process.env.DATABASE_URL)) : memoryStore;
const port = Number(process.env.PORT ?? 5173);

serve({ fetch: createApp(store).fetch, port, hostname: process.env.HOST ?? "127.0.0.1" }, (info) => {
  console.log(`community-os api listening on http://${info.address}:${info.port}`);
});
