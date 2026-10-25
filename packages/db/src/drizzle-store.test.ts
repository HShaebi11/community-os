import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eventRecord, testStoreContract, testStoreModelConformance } from "@community-os/testkit";
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

testStoreModelConformance("DrizzleStore", async () => (await makeStore()).store, undefined, 2);

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
        memberId: null,
        sentAt: new Date().toISOString(),
        isNoise: false,
      },
    ]);
    await expect(result).rejects.toThrow();
  });

  it("ignores empty file/citation batches and resolves ghosts to null", async () => {
    const { store } = await makeStore();
    const ws = await store.createWorkspace({ name: "ws", createdBy: "test" });
    await store.insertFiles([]);
    await store.insertCitations([]);
    expect(await store.listFiles(ws.id)).toEqual([]);
    expect(await store.getMember("ghost-member")).toBeNull();
    expect(await store.getEvent("ghost-event")).toBeNull();
  });

  it("persists events without a startsAt", async () => {
    const { store } = await makeStore();
    const ws = await store.createWorkspace({ name: "ws", createdBy: "test" });
    const event = await store.createEvent(eventRecord({ communityId: ws.id, slug: "no-start" }));
    expect(event.startsAt).toBeNull();
    expect((await store.getEvent(event.id))?.startsAt).toBeNull();
  });

  it("round-trips a real startsAt and resolves members by public slug", async () => {
    const { store } = await makeStore();
    const ws = await store.createWorkspace({ name: "ws", createdBy: "test" });
    const event = await store.createEvent(
      eventRecord({ communityId: ws.id, slug: "dated", startsAt: "2025-06-01T18:00:00.000Z" }),
    );
    expect(event.startsAt).toBe("2025-06-01T18:00:00.000Z");
    expect((await store.getEvent(event.id))?.startsAt).toBe("2025-06-01T18:00:00.000Z");

    const member = await store.upsertMember(ws.id, "Ada", "2025-01-01T00:00:00.000Z");
    await store.updateMember(member.id, { publicOptIn: true, publicSlug: "ada" }, false);
    expect((await store.getMemberByPublicSlug("ada"))?.id).toBe(member.id);
    expect(await store.getMemberByPublicSlug("nobody")).toBeNull();
    expect((await store.getMemberBySlug(ws.id, "ada"))?.id).toBe(member.id);
    expect(await store.getMemberBySlug(ws.id, "nobody")).toBeNull();
  });

  it("serializes concurrent same-name upserts — one member survives, all callers get it", async () => {
    const { store } = await makeStore();
    const ws = await store.createWorkspace({ name: "ws", createdBy: "test" });
    // Every racer selects before any insert lands → all see an empty community,
    // all insert → the name_norm index admits exactly one; losers re-find it.
    const results = await Promise.all(Array.from({ length: 8 }, () => store.upsertMember(ws.id, "Ada", null)));
    expect(new Set(results.map((m) => m.id)).size).toBe(1);
    expect(await store.listMembers(ws.id)).toHaveLength(1);
  });
});
