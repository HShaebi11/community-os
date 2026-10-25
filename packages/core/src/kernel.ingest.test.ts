import { describe, expect, it } from "vitest";
import { normalizedMessage } from "@community-os/testkit";
import { ingestDiscord, ingestMessages } from "./kernel.ts";
import { MemoryStore } from "./memory-store.ts";

const store = () => new MemoryStore();
const ws = async (s: MemoryStore) => (await s.createWorkspace({ name: "W", createdBy: "lead" })).id;

describe("ingestMessages", () => {
  it("find-or-creates the source once per kind, reusing it for later batches", async () => {
    const s = store();
    const cid = await ws(s);
    await ingestMessages(s, cid, { kind: "discord", name: "Discord" }, [normalizedMessage({ id: "d1" })]);
    await ingestMessages(s, cid, { kind: "discord", name: "Discord #2" }, [normalizedMessage({ id: "d2" })]);
    const sources = await s.listSources(cid);
    expect(sources).toHaveLength(1);
    expect(sources[0].kind).toBe("discord");
  });

  it("resolves repeated authors to the same member", async () => {
    const s = store();
    const cid = await ws(s);
    await ingestMessages(s, cid, { kind: "slack", name: "s" }, [
      normalizedMessage({ id: "1", author: "Ada" }),
      normalizedMessage({ id: "2", author: "ada" }),
      normalizedMessage({ id: "3", author: "Lin" }),
    ]);
    const members = await s.listMembers(cid);
    expect(members.map((m) => m.displayName).sort()).toEqual(["Ada", "Lin"]);
    const messages = await s.listMessages(cid);
    expect(new Set(messages.map((m) => m.memberId)).size).toBe(2);
  });

  it("dedupes on platform message id across calls", async () => {
    const s = store();
    const cid = await ws(s);
    await ingestMessages(s, cid, { kind: "slack", name: "s" }, [normalizedMessage({ id: "s1" })]);
    const second = await ingestMessages(s, cid, { kind: "slack", name: "s" }, [normalizedMessage({ id: "s1" })]);
    expect(second).toMatchObject({ inserted: 0, skipped: 1 });
    expect(await s.listMessages(cid)).toHaveLength(1);
  });

  it("drops malformed entries and counts only well-formed ones", async () => {
    const s = store();
    const cid = await ws(s);
    const res = await ingestMessages(s, cid, { kind: "slack", name: "s" }, [
      normalizedMessage({ id: "good" }),
      { id: "", author: "Ada", body: "no id", sentAt: "x" },
      { id: "x2", author: "  ", body: "no author", sentAt: "x" },
      { id: "x3", author: "Ada", sentAt: "x" } as never,
    ]);
    expect(res).toMatchObject({ inserted: 1, skipped: 0 });
    expect(await s.listMessages(cid)).toHaveLength(1);
    expect(await s.listMembers(cid)).toHaveLength(1);
  });

  it("marks noise bodies as noise while storing them", async () => {
    const s = store();
    const cid = await ws(s);
    await ingestMessages(s, cid, { kind: "slack", name: "s" }, [
      normalizedMessage({ id: "n1", body: "lol" }),
      normalizedMessage({ id: "n2", body: "real discussion here" }),
    ]);
    const [noise, real] = (await s.listMessages(cid)).sort((a, b) => a.sourceMessageId.localeCompare(b.sourceMessageId));
    expect(noise.isNoise).toBe(true);
    expect(real.isNoise).toBe(false);
  });

  it("returns early on an empty batch without touching the store", async () => {
    const s = store();
    const cid = await ws(s);
    const res = await ingestMessages(s, cid, { kind: "slack", name: "s" }, []);
    expect(res).toEqual({ inserted: 0, skipped: 0, members: [] });
    expect(await s.listSources(cid)).toHaveLength(0);
  });
});

describe("ingestDiscord", () => {
  it("upserts a member from the author username and ingests the message", async () => {
    const s = store();
    const cid = await ws(s);
    const res = await ingestDiscord(s, cid, {
      id: "snow-1",
      content: "hello from discord",
      timestamp: "2025-06-01T00:00:00Z",
      author: { id: "u1", username: "ada_lovelace" },
    });
    expect(res.inserted).toBe(1);
    expect(res.member.displayName).toBe("ada_lovelace");
    const messages = await s.listMessages(cid);
    expect(messages[0].sourceMessageId).toBe("snow-1");
    expect(messages[0].memberId).toBe(res.member.id);
  });

  it("dedupes a replayed discord id", async () => {
    const s = store();
    const cid = await ws(s);
    const payload = {
      id: "snow-1",
      content: "x",
      timestamp: "2025-06-01T00:00:00Z",
      author: { id: "u1", username: "ada" },
    };
    await ingestDiscord(s, cid, payload);
    expect((await ingestDiscord(s, cid, payload)).inserted).toBe(0);
  });
});
