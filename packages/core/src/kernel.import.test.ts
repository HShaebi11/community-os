import { describe, expect, it } from "vitest";
import { transcripts } from "@community-os/testkit";
import { importWhatsApp } from "./kernel.ts";
import { MemoryStore } from "./memory-store.ts";
import { parseWhatsAppTranscript } from "./whatsapp.ts";

const store = () => new MemoryStore();
const ws = async (s: MemoryStore) => (await s.createWorkspace({ name: "W", createdBy: "lead" })).id;

describe("parseWhatsAppTranscript", () => {
  it("parses iOS bracketed 12h-clock lines", () => {
    const rows = parseWhatsAppTranscript(transcripts.ios);
    expect(rows).toHaveLength(2);
    expect(rows[0].authorRaw).toBe("Ada");
    expect(rows[0].sentAt).toBe("2025-06-15T09:30:00.000Z");
    expect(rows[1].body).toBe("hi!");
  });

  it("parses Android 24h-clock lines with a dash separator", () => {
    const rows = parseWhatsAppTranscript(transcripts.android);
    expect(rows).toHaveLength(2);
    expect(rows[0].sentAt).toBe("2025-06-15T09:30:00.000Z");
  });

  it("resolves ambiguous dates: day>12 means D/M order", () => {
    const [row] = parseWhatsAppTranscript(transcripts.usFormat);
    expect(row.sentAt).toBe("2025-06-15T09:30:00.000Z");
  });

  it("continues a message body onto following non-message lines", () => {
    const rows = parseWhatsAppTranscript(transcripts.multiline);
    expect(rows).toHaveLength(2);
    expect(rows[0].body).toBe("first line\nsecond line of the same message");
  });

  it("skips system-authored lines", () => {
    const rows = parseWhatsAppTranscript(transcripts.system);
    expect(rows).toHaveLength(1);
    expect(rows[0].authorRaw).toBe("Ada");
  });

  it("collects <attached: ...> markers into attachedNames", () => {
    const [row] = parseWhatsAppTranscript(transcripts.attachment);
    expect(row.attachedNames).toEqual(["poster.jpg"]);
    expect(row.body).toContain("<attached:");
  });

  it("tolerates BOM and CRLF line endings", () => {
    const rows = parseWhatsAppTranscript(transcripts.crlf);
    expect(rows).toHaveLength(2);
  });

  it("produces stable sourceMessageIds for identical content", () => {
    const a = parseWhatsAppTranscript(transcripts.ios);
    const b = parseWhatsAppTranscript(transcripts.ios);
    expect(a[0].sourceMessageId).toBe(b[0].sourceMessageId);
  });
});

describe("importWhatsApp", () => {
  it("creates a whatsapp source once and returns inserted/skipped + members", async () => {
    const s = store();
    const cid = await ws(s);
    const res = await importWhatsApp(s, cid, transcripts.ios, []);
    expect(res).toMatchObject({ inserted: 2, skipped: 0 });
    expect(res.members.map((m) => m.displayName).sort()).toEqual(["Ada", "Lin"]);
    expect((await s.listSources(cid))[0].kind).toBe("whatsapp");
  });

  it("re-importing the same transcript skips every message", async () => {
    const s = store();
    const cid = await ws(s);
    await importWhatsApp(s, cid, transcripts.ios, []);
    const second = await importWhatsApp(s, cid, transcripts.ios, []);
    expect(second).toMatchObject({ inserted: 0, skipped: 2 });
    expect(await s.listMessages(cid)).toHaveLength(2);
  });

  it("records attachment files and emits an import timeline event", async () => {
    const s = store();
    const cid = await ws(s);
    await importWhatsApp(s, cid, transcripts.attachment, [
      { name: "poster.jpg", storagePath: "files/poster.jpg", mime: "image/jpeg" },
    ]);
    expect((await s.listFiles(cid))[0].name).toBe("poster.jpg");
    const events = await s.listTimeline(cid);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("import");
    expect(events[0].payload).toMatchObject({ source: "whatsapp", inserted: 1 });
  });

  it("stores noise-marked rows but keeps real messages clean", async () => {
    const s = store();
    const cid = await ws(s);
    await importWhatsApp(s, cid, `15/06/2025, 09:30 - Ada: lol\n15/06/2025, 09:31 - Ada: an actual message`, []);
    const rows = await s.listMessages(cid);
    expect(rows.filter((m) => m.isNoise)).toHaveLength(1);
  });
});
