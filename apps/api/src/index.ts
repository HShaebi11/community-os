import { createDb } from "@community-os/db";
import { createApp, memoryStore } from "./app.ts";
import { createAuth, DEFAULT_APP_ORIGINS, type AuthEnv } from "./auth.ts";
import { createDrizzleStore } from "./drizzle-store.ts";

type WorkerEnv = AuthEnv & {
  DATABASE_URL?: string;
  ALLOW_DEV_AUTH?: string;
};

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> | Response {
    const url = new URL(request.url);
    console.log(JSON.stringify({ message: "incoming request", method: request.method, path: url.pathname }));
    const db = env.DATABASE_URL ? createDb(env.DATABASE_URL) : null;
    const store = db ? createDrizzleStore(db) : memoryStore;
    const auth = db && env.BETTER_AUTH_SECRET ? createAuth(db, env, env.BETTER_AUTH_URL ?? url.origin) : undefined;
    const appOrigins = (env.APP_ORIGINS || DEFAULT_APP_ORIGINS)
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    const providers = {
      google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      email: (env.RESEND_API_KEY ? "resend" : "log") as "resend" | "log",
    };
    return createApp(store, auth, {
      allowDevAuth: env.ALLOW_DEV_AUTH === "true" || !db,
      appOrigins,
      providers,
    }).fetch(request);
  },
};
