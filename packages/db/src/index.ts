import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema.ts";

export * from "./schema.ts";

// Worker/edge path: Neon's HTTP driver — works in any runtime that has fetch,
// including Cloudflare Workers. Requires a Neon-hosted database.
export function createDb(url: string) {
  const sql = neon(url);
  return drizzleNeon({ client: sql, schema });
}

// Node/self-host path: plain Postgres wire protocol via postgres.js — works
// with any Postgres (docker compose, RDS, a local install).
export function createNodeDb(url: string) {
  const client = postgres(url);
  return drizzlePostgres({ client, schema });
}

// Shared query surface of both drivers (Neon HTTP + postgres.js).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PgDatabase<any, typeof schema>;

export { createDrizzleStore } from "./drizzle-store.ts";
