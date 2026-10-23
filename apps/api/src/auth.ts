import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import * as schema from "@community-os/db/schema";
import type { Database } from "@community-os/db";

export function createAuth(db: Database, secret: string, baseURL: string) {
  return betterAuth({
    secret,
    baseURL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: { enabled: true },
    plugins: [bearer()],
    trustedOrigins: [baseURL],
    advanced: { database: { generateId: () => crypto.randomUUID() } },
  });
}

export type Auth = ReturnType<typeof createAuth>;
