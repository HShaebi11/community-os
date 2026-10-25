import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { testStoreContract } from "@community-os/testkit";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { createDrizzleStore } from "./drizzle-store.ts";
import * as schema from "./schema.ts";

// Runs the full Store contract against a real Postgres — PGlite embeds
// Postgres via WASM, so DrizzleStore gets the same 35 semantic tests as
// MemoryStore and SqliteStore with no external service. This is what caught
// the dedupe-index and name-normalization drift in this adapter.

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const migrationSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n")
  .replace(/--> statement-breakpoint/g, ";");

async function makeStore() {
  const client = new PGlite();
  await client.exec(migrationSql);
  const db = drizzle(client, { schema });
  const store = createDrizzleStore(db);
  return { store, client };
}

testStoreContract(
  "DrizzleStore",
  async () => (await makeStore()).store,
  undefined, // PGlite instances are in-memory; GC handles teardown
);

describe("DrizzleStore — adapter specifics", () => {
  it("rethrows non-dedupe database errors from insertMessages", async () => {
    const { store } = await makeStore();
    const ws = await store.createWorkspace({ name: "ws", createdBy: "test" });
    // No source row → FK violation, not a unique violation.
    const result = store.insertMessages([
      {
        id: "m1",
        communityId: ws.id,
        sourceId: "missing-source",
        sourceMessageId: "s1",
        authorRaw: "a",
        body: "b",
        sentAt: new Date().toISOString(),
        isNoise: false,
      },
    ]);
    await expect(result).rejects.toThrow();
  });
});
