import { createDb } from "@community-os/db";
import { createApp, memoryStore } from "./app.ts";
import { createDrizzleStore } from "@community-os/db";

type WorkerEnv = {
  DATABASE_URL?: string;
  LOADER?: unknown;
};

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> | Response {
    const url = new URL(request.url);
    console.log(JSON.stringify({ message: "incoming request", method: request.method, path: url.pathname }));
    const db = env.DATABASE_URL ? createDb(env.DATABASE_URL) : null;
    const store = db ? createDrizzleStore(db) : memoryStore;
    return createApp(store).fetch(request, env, ctx);
  },
};
