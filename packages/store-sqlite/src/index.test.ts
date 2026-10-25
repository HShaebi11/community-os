import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});
