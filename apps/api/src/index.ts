import { createDb } from "@community-os/db";
import { createApp, memoryStore } from "./app.ts";
import { createAuth } from "./auth.ts";
import { createDrizzleStore } from "./drizzle-store.ts";

type WorkerEnv = {
  DATABASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
};

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> | Response {
    const url = new URL(request.url);
    console.log(JSON.stringify({ message: "incoming request", method: request.method, path: url.pathname }));
    const db = env.DATABASE_URL ? createDb(env.DATABASE_URL) : null;
    const store = db ? createDrizzleStore(db) : memoryStore;
    const auth =
      db && env.BETTER_AUTH_SECRET ? createAuth(db, env.BETTER_AUTH_SECRET, url.origin) : undefined;
    return createApp(store, auth).fetch(request);
  },
};
