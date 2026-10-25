import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { testStoreContract } from "@community-os/testkit";
import { SqliteStore } from "./index.ts";

testStoreContract("SqliteStore", () => new SqliteStore(), (s) => s.close());

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
});
