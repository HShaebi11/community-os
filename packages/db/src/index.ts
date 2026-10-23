import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";

export * from "./schema.ts";

export function createDb(url: string) {
  const sql = neon(url);
  return drizzle({ client: sql, schema });
}

export type Database = ReturnType<typeof createDb>;
