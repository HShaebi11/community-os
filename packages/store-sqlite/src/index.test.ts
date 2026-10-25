import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { eventRecord, guest, proposal, testStoreContract, testStoreModelConformance, timelineEvent } from "@community-os/testkit";
import { SqliteStore } from "./index.ts";

testStoreContract("SqliteStore", () => new SqliteStore(), (s) => s.close());

testStoreModelConformance("SqliteStore", () => new SqliteStore(), (s) => s.close());

describe("SqliteStore — adapter specifics", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("persists data across close and reopen of the same file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cos-sqlite-"));
    dirs.push(dir);
    const path = join(dir, "community.db");

    const first = new SqliteStore(path);
    const w = await first.createWorkspace({ name: "Durable", createdBy: "lead" });
    await first.upsertMember(w.id, "Ada", null);
    first.close();

    const second = new SqliteStore(path);
    expect((await second.listWorkspaces()).map((x) => x.name)).toContain("Durable");
    expect(await second.listMembers(w.id)).toHaveLength(1);
    second.close();
  });

  it("upgrades an existing DB that still carries the old (communityId, sourceMessageId) index", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cos-sqlite-"));
    dirs.push(dir);
    const path = join(dir, "community.db");

    // Simulate a pre-fix database: old index present, v2 absent.
    const seed = new SqliteStore(path);
    seed.close();
    const raw = new DatabaseSync(path);
    raw.exec("DROP INDEX IF EXISTS idx_messages_dedup_v2");
    raw.exec("CREATE UNIQUE INDEX idx_messages_dedup ON messages(communityId, sourceMessageId)");
    raw.close();

    const store = new SqliteStore(path); // schema bootstrap runs here
    const w = await store.createWorkspace({ name: "W", createdBy: "lead" });
    const res = await store.insertMessages([
      { id: "m1", communityId: w.id, sourceId: "s1", sourceMessageId: "1", authorRaw: "a", memberId: null, body: "b", sentAt: "t", isNoise: false },
      { id: "m2", communityId: w.id, sourceId: "s2", sourceMessageId: "1", authorRaw: "a", memberId: null, body: "b", sentAt: "t", isNoise: false },
    ]);
    expect(res).toEqual({ inserted: 2, skipped: 0 });
    expect(await store.listMessages(w.id)).toHaveLength(2);
    store.close();
  });

  it("upgrades a database carrying pre-constraint duplicates", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cos-sqlite-"));
    dirs.push(dir);
    const path = join(dir, "community.db");

    const seed = new SqliteStore(path);
    const w = await seed.createWorkspace({ name: "W", createdBy: "lead" });
    const e = await seed.createEvent(eventRecord({ communityId: w.id, slug: "evt" }));
    seed.close();

    // Simulate the pre-constraint past: drop the unique indexes and write
    // the duplicates older versions allowed — same public slug, same
    // normalized display name, same (event, email) guest.
    const raw = new DatabaseSync(path);
    raw.exec(`DROP INDEX IF EXISTS idx_members_public_slug;
      DROP INDEX IF EXISTS idx_members_name_norm;
      DROP INDEX IF EXISTS idx_guests_event_email;
      ALTER TABLE events DROP COLUMN rsvpCount;`);
    const insMember = raw.prepare(
      `INSERT INTO members (id, communityId, displayName, aliases, "do", want, offer, notes, publicOptIn, publicSlug, lastActive, leadLockedFields)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL, '[]')`,
    );
    insMember.run("m1", w.id, "Ada", '["Ada"]', 1, "ada");
    insMember.run("m2", w.id, " Ada ", '[" Ada "]', 0, "ada");
    raw
      .prepare(
        `INSERT INTO guests (id, eventId, communityId, memberId, name, email, source)
         VALUES ('g1', ?, ?, NULL, 'A', 'a@x', 'native'), ('g2', ?, ?, NULL, 'A2', 'a@x', 'native')`,
      )
      .run(e.id, w.id, e.id, w.id);
    raw.close();

    // Reopen: migrate() reconciles before the unique indexes are created.
    const store = new SqliteStore(path);
    const members = await store.listMembers(w.id);
    expect(members).toHaveLength(2);
    // The first claim (m1) keeps the slug and name; m2 keeps its row and
    // every reference under deterministic suffixes.
    const ada = members.find((m) => m.publicSlug === "ada");
    expect(ada?.id).toBe("m1");
    const renamed = members.find((m) => m.id === "m2")!;
    expect(renamed.publicSlug).not.toBe("ada");
    expect(renamed.displayName).not.toBe(" Ada ");
    // Duplicate guest dropped; the backfilled counter counts survivors.
    expect(await store.listGuests(e.id)).toHaveLength(1);
    expect((await store.getEvent(e.id))?.rsvpCount).toBe(1);
    // Constraints are live — a second claim on the slug now fails.
    await expect(store.updateMember("m2", { publicSlug: "ada" }, true)).rejects.toThrow();
    store.close();
  });

  it("two stores on one file can't oversell a capped event", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cos-sqlite-"));
    dirs.push(dir);
    const path = join(dir, "community.db");
    const a = new SqliteStore(path);
    const b = new SqliteStore(path);
    const w = await a.createWorkspace({ name: "W", createdBy: "lead" });
    const e = await a.createEvent(eventRecord({ communityId: w.id, slug: "evt" }));

    // 8 racers for 3 seats, split across two connections to the same file —
    // BEGIN IMMEDIATE serializes each reservation end to end.
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        (i % 2 ? b : a).rsvpGuest(guest({ eventId: e.id, communityId: w.id, email: `r${i}@x` }), 3),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await a.listGuests(e.id)).toHaveLength(3);
    expect((await a.getEvent(e.id))?.rsvpCount).toBe(3);
    a.close();
    b.close();
  });

  it("falls back to 'community' when the workspace name slugifies to nothing", async () => {
    const store = new SqliteStore();
    const w = await store.createWorkspace({ name: "!!!", createdBy: "lead" });
    expect(w.slug).toBe("community");
    store.close();
  });

  it("stringifies missing JSON columns as their container defaults", async () => {
    const store = new SqliteStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "lead" });
    await store.addTimeline(timelineEvent({ communityId: w.id, payload: undefined as never }));
    const [row] = await store.listTimeline(w.id);
    expect(row.payload).toEqual({});
    // speakerIds undefined exercises the array fallback on the update path.
    const p = await store.createProposal(proposal({ communityId: w.id }));
    const updated = await store.updateProposal(p.id, { speakerIds: undefined });
    expect(updated.speakerIds).toEqual(p.speakerIds);
    store.close();
  });

  it("treats an empty patch as a no-op", async () => {
    const store = new SqliteStore();
    const w = await store.createWorkspace({ name: "W", createdBy: "lead" });
    const p = await store.createProposal(proposal({ communityId: w.id }));
    const same = await store.updateProposal(p.id, {});
    expect(same.demandId).toBe(p.demandId);
    store.close();
  });
});
