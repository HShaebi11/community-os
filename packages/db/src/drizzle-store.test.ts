import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eventRecord, guest, testStoreContract, testStoreModelConformance } from "@community-os/testkit";
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

  it("rethrows non-dedupe database errors from rsvpGuest", async () => {
    const { store } = await makeStore();
    const ws = await store.createWorkspace({ name: "ws", createdBy: "test" });
    const e = await store.createEvent(eventRecord({ communityId: ws.id }));
    // communityId violates the workspace FK — not a unique violation.
    await expect(
      store.rsvpGuest(guest({ eventId: e.id, communityId: "ghost-ws" }), null),
    ).rejects.toThrow();
    // Same failure after a successful claim must release the seat.
    await expect(
      store.rsvpGuest(guest({ eventId: e.id, communityId: "ghost-ws" }), 5),
    ).rejects.toThrow();
    expect((await store.getEvent(e.id))?.rsvpCount).toBe(0);
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

  it("keeps the newest lastActive on the insert-conflict loser path", async () => {
    const { store } = await makeStore();
    const ws = await store.createWorkspace({ name: "ws", createdBy: "test" });
    // The loser of the concurrent insert must still advance lastActive —
    // otherwise the newer message's timestamp silently drops.
    const older = "2025-01-01T10:00:00.000Z";
    const newer = "2025-01-01T11:00:00.000Z";
    const results = await Promise.all([
      store.upsertMember(ws.id, "Ada", older),
      store.upsertMember(ws.id, "Ada", newer),
    ]);
    expect(new Set(results.map((m) => m.id)).size).toBe(1);
    // The winner returns its own write; what matters is what persisted.
    expect((await store.listMembers(ws.id))[0].lastActive).toBe(newer);
  });

  it("two independent store instances on one database can't oversell a capped event", async () => {
    const { client } = await makeStore();
    const db = drizzle(client, { schema });
    // Two stores, one shared database — the shape of separate server
    // instances claiming seats for the same event.
    const a = createDrizzleStore(db);
    const b = createDrizzleStore(drizzle(client, { schema }));
    const ws = await a.createWorkspace({ name: "ws", createdBy: "test" });
    const event = await a.createEvent(eventRecord({ communityId: ws.id }));
    const seat = (i: number) => guest({ eventId: event.id, communityId: ws.id, email: `r${i}@x.test` });
    // 8 racers for 3 seats, alternating between the two stores so claims
    // interleave across the shared database.
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => (i % 2 ? b : a).rsvpGuest(seat(i), 3)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await a.listGuests(event.id)).toHaveLength(3);
    expect((await a.getEvent(event.id))?.rsvpCount).toBe(3);
  });

  it("migrates a database carrying pre-constraint duplicates", async () => {
    const client = new PGlite();
    const sqlOf = (name: string) =>
      readFileSync(join(migrationsDir, name), "utf8").replace(/--> statement-breakpoint/g, ";");
    // Start from the 0000 schema — the member unique indexes don't exist yet.
    await client.exec(sqlOf("0000_small_mordo.sql"));
    // Seed the collisions older stores allowed: duplicate public slug,
    // duplicate normalized display name, duplicate (event, email) guest.
    await client.exec(`
      INSERT INTO community_os.workspaces (id, name, slug, created_by, created_at)
        VALUES ('w1', 'W', 'w', 'lead', now());
      INSERT INTO community_os.events (id, community_id, proposal_id, slug, title, qr_svg, published_at)
        VALUES ('e1', 'w1', 'p1', 'evt', 'T', '', now());
      INSERT INTO community_os.members (id, community_id, display_name, aliases, public_opt_in, public_slug, lead_locked_fields)
        VALUES
          ('m1', 'w1', 'Ada', '{Ada}', true, 'ada', '{}'),
          ('m2', 'w1', ' Ada ', '{ Ada }', false, 'ada', '{}');
      INSERT INTO community_os.guests (id, event_id, community_id, name, email, source)
        VALUES ('g1', 'e1', 'w1', 'A', 'a@x', 'native'), ('g2', 'e1', 'w1', 'A2', 'a@x', 'native');
    `);
    // Both constraint migrations must complete — the reconcile step inside
    // each keeps the earliest claimant and preserves every row.
    await client.exec(sqlOf("0001_nice_the_fallen.sql"));
    await client.exec(sqlOf("0002_large_whirlwind.sql"));

    const store = createDrizzleStore(drizzle(client, { schema }));
    const ms = await store.listMembers("w1");
    expect(ms).toHaveLength(2);
    // m1 (MIN id) keeps the slug and name; m2 keeps its row under suffixes.
    const ada = ms.find((m) => m.publicSlug === "ada");
    expect(ada?.id).toBe("m1");
    const renamed = ms.find((m) => m.id === "m2")!;
    expect(renamed.publicSlug).toMatch(/^ada-m2$/);
    expect(renamed.displayName).toMatch(/^ Ada +#m2$/);
    // Duplicate guest dropped, counter backfilled from the surviving rows.
    expect(await store.listGuests("e1")).toHaveLength(1);
    expect((await store.getEvent("e1"))?.rsvpCount).toBe(1);
    // And the constraints are live: a second claim now fails.
    await expect(store.updateMember("m2", { publicSlug: "ada" }, true)).rejects.toThrow();
  });
});
