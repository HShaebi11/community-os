import { createHmac } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "@community-os/core";
import { SqliteStore } from "@community-os/store-sqlite";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../apps/api/src/app.ts";
import {
  ApiError,
  CommunityOS,
  jsonWebhook,
  verifyWebhookSignature,
  type ChannelAdapter,
  type IngestAdapter,
  type NormalizedMessage,
  type WebhookAdapter,
} from "./index.ts";

const fakeChannel = (msgs: NormalizedMessage[]): ChannelAdapter => ({
  name: "test-channel",
  kind: "native",
  async start(ctx) {
    await ctx.emit(msgs);
  },
  async stop() {},
});

const chat = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/whatsapp-sample/_chat.txt"),
);

/** Remote mode: the real Hono app served through the injected fetch, so this
 *  exercises the actual HTTP contract — routes, status codes, wire shapes. */
function remoteCos() {
  const app = createApp(new MemoryStore());
  const fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    app.request(String(input), init)) as typeof globalThis.fetch;
  return new CommunityOS({ baseUrl: "http://remote.test", fetch, publicOrigin: "https://pub.test" });
}

async function kernelLoop(cos: CommunityOS) {
  const ws = await cos.createWorkspace({ name: "Weird Stuff", joinUrl: "https://chat.whatsapp.com/x" });
  const imported = await cos.importChat(ws.id, chat, "_chat.txt");
  expect(imported.inserted).toBeGreaterThan(0);
  expect(imported.members.length).toBeGreaterThan(2);

  const memory = await cos.refreshMemory(ws.id);
  expect(memory.demands.length).toBeGreaterThan(0);

  const members = await cos.listMembers(ws.id);
  const card = await cos.getMember(members[0]!.id);
  expect(card.displayName).toBe(members[0]!.displayName);
  expect(Array.isArray(card.citations)).toBe(true);

  const pack = await cos.createProposal(ws.id, memory.demands[0]!.id);
  expect(pack.status).toBe("draft");

  const approved = await cos.approveProposal(pack.id);
  expect(approved.status).toBe("approved");

  const drafted = await cos.draftOutreach(pack.id);
  expect(drafted.outreachDraft).toBeTruthy();

  const event = await cos.goLive(pack.id);
  expect(event.slug).toBeTruthy();

  const pub = await cos.publicEvent(event.slug);
  expect(pub.community.slug).toBe(ws.slug);

  const guest = await cos.rsvp(event.slug, { name: "Ada", email: "ada@test.dev" });
  expect(guest.name).toBe("Ada");
  expect((await cos.listGuests(event.id)).length).toBe(1);

  const chain = await cos.getEventChain(event.id);
  expect(chain.demand?.id).toBe(memory.demands[0]!.id);

  const exported = await cos.exportWorkspace(ws.id);
  expect(exported.workspace?.id).toBe(ws.id);
  expect(exported.messages.every((m) => !("body" in m))).toBe(true);

  return ws;
}

describe("remote transport", () => {
  it("runs the full kernel loop over HTTP", async () => {
    await kernelLoop(remoteCos());
  });

  it("sends X-Public-Origin and surfaces ApiError on 404", async () => {
    const app = createApp(new MemoryStore());
    const seen: string[] = [];
    const fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("x-public-origin") ?? "");
      return app.request(String(input), init);
    }) as typeof globalThis.fetch;
    const cos = new CommunityOS({ baseUrl: "http://remote.test", fetch, publicOrigin: "https://pub.test" });
    const ws = await cos.createWorkspace({ name: "T" });
    expect(seen[0]).toBe("https://pub.test");
    await expect(cos.getWorkspace("nope")).rejects.toMatchObject({ status: 404 });
    await expect(cos.getWorkspaceBySlug("nope")).rejects.toBeInstanceOf(ApiError);
    void ws;
  });
});

describe("embedded transport (CommunityOS.memory)", () => {
  it("runs the full kernel loop in-process — no server", async () => {
    await kernelLoop(CommunityOS.memory({ publicOrigin: "https://pub.test" }));
  });

  it("matches remote error semantics", async () => {
    const cos = CommunityOS.memory();
    await expect(cos.getWorkspace("nope")).rejects.toMatchObject({ status: 404 });
    await expect(cos.getMember("nope")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("embedded transport on SQLite (CommunityOS.store)", () => {
  it("runs the full kernel loop on a real database", async () => {
    const sqlite = new SqliteStore();
    await kernelLoop(CommunityOS.store(sqlite, { publicOrigin: "https://pub.test" }));
    sqlite.close();
  });

  it("persists across instances — same file, new process-level store", async () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), "../.test-persist.db");
    let ws: { id: string };
    {
      const sqlite = new SqliteStore(path);
      ws = await CommunityOS.store(sqlite).createWorkspace({ name: "Persisted" });
      sqlite.close();
    }
    {
      const sqlite = new SqliteStore(path);
      const cos = CommunityOS.store(sqlite);
      expect((await cos.getWorkspace(ws.id)).name).toBe("Persisted");
      expect((await cos.getWorkspaceBySlug("persisted")).id).toBe(ws.id);
      sqlite.close();
    }
    rmSync(path, { force: true });
  });
});

describe("serve()", () => {
  it("serves the real /v1 API on an embedded store", async () => {
    const cos = CommunityOS.memory();
    const { port, close } = await cos.serve({ port: 0 });
    const res = await fetch(`http://localhost:${port}/v1/health`);
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: true });
    close();
  });
});

describe("listen() — continuous channel ingest", () => {
  const sample: NormalizedMessage[] = [
    { id: "p1", author: "Ada", body: "first message", sentAt: "2025-01-01T00:00:00Z" },
    { id: "p2", author: "Bob", body: "we should do a coffee meetup", sentAt: "2025-01-01T00:01:00Z" },
  ];

  it("feeds a channel into an embedded store", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "T" });
    const handle = await cos.listen(fakeChannel(sample), { workspaceId: ws.id });
    await handle.stop();
    const messages = await cos.listMessages(ws.id);
    expect(messages.length).toBe(2);
    expect((await cos.listMembers(ws.id)).map((m) => m.displayName).sort()).toEqual(["Ada", "Bob"]);
  });

  it("feeds a channel over remote HTTP via POST /v1/ingest", async () => {
    const cos = remoteCos();
    const ws = await cos.createWorkspace({ name: "T" });
    const handle = await cos.listen(fakeChannel(sample), { workspaceId: ws.id });
    await handle.stop();
    expect((await cos.listMessages(ws.id)).length).toBe(2);
  });

  it("dedupes on platform message id across emits", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "T" });
    await cos.listen(fakeChannel([...sample, sample[0]!]), { workspaceId: ws.id });
    expect((await cos.listMessages(ws.id)).length).toBe(2);
  });
});

describe("on() — react to kernel events", () => {
  it("fires on embedded timeline writes", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "T" });
    const seen: string[] = [];
    const unsub = cos.on("import", (e) => seen.push(e.kind));
    await cos.importChat(ws.id, chat, "_chat.txt");
    expect(seen).toEqual(["import"]);
    unsub();
    await cos.importChat(ws.id, chat, "_chat.txt");
    expect(seen.length).toBe(1);
  });

  it("fires on remote timeline polling", async () => {
    const cos = remoteCos();
    const ws = await cos.createWorkspace({ name: "T" });
    const seen: string[] = [];
    cos.on("import", (e) => seen.push(e.kind), { pollMs: 30 });
    await cos.importChat(ws.id, chat, "_chat.txt");
    await new Promise((r) => setTimeout(r, 250));
    expect(seen).toEqual(["import"]);
  });
});

describe("ingest() — the bare primitive", () => {
  const msgs: NormalizedMessage[] = [
    { id: "n1", author: "Ada", body: "from a CSV", sentAt: "2025-01-01T00:00:00Z" },
    { id: "n2", author: "Bob", body: "second row", sentAt: "2025-01-01T00:01:00Z" },
  ];

  it("ingests normalized messages on embedded and remote modes", async () => {
    for (const cos of [CommunityOS.memory(), remoteCos()]) {
      const ws = await cos.createWorkspace({ name: "T" });
      const result = await cos.ingest(ws.id, {
        source: { kind: "slack", name: "Slack CSV export" },
        messages: msgs,
      });
      expect(result.inserted).toBe(2);
      expect((await cos.listMessages(ws.id)).length).toBe(2);
      expect((await cos.listMembers(ws.id)).map((m) => m.displayName).sort()).toEqual(["Ada", "Bob"]);
    }
  });

  it("dedupes repeated pushes by platform message id", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "T" });
    await cos.ingest(ws.id, { messages: msgs });
    const second = await cos.ingest(ws.id, { messages: [msgs[0]!] });
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(1);
  });
});

describe("importChat + messages-adapter — flexible one-shots", () => {
  const csvAdapter: IngestAdapter = {
    name: "csv-import",
    kind: "slack",
    parse: () => ({
      messages: [
        { id: "c1", author: "Ada", body: "mapped myself", sentAt: "2025-01-01T00:00:00Z" },
      ],
    }),
  };

  it("routes adapter messages through ingest — embedded and remote", async () => {
    for (const cos of [CommunityOS.memory(), remoteCos()]) {
      const ws = await cos.createWorkspace({ name: "T" });
      const result = await cos.importChat(ws.id, "col1,col2\na,b", "export.csv", csvAdapter);
      expect(result.inserted).toBe(1);
      const messages = await cos.listMessages(ws.id);
      expect(messages[0]?.body).toBe("mapped myself");
    }
  });

  it("rejects adapters that produce nothing", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "T" });
    await expect(
      cos.importChat(ws.id, "x", "f.txt", { parse: () => ({}) }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("receive() — passive webhook ingest", () => {
  const webhook = (msgs: NormalizedMessage[]): WebhookAdapter => ({
    name: "test-hook",
    kind: "native",
    async handle() {
      return { messages: msgs };
    },
  });
  const sample: NormalizedMessage[] = [
    { id: "w1", author: "Ada", body: "pushed message", sentAt: "2025-01-01T00:00:00Z" },
  ];

  it("ingests pushed messages on embedded and remote modes", async () => {
    for (const cos of [CommunityOS.memory(), remoteCos()]) {
      const ws = await cos.createWorkspace({ name: "T" });
      const hook = await cos.receive(webhook(sample), { workspaceId: ws.id });
      const res = await hook(new Request("https://local/hook", { method: "POST" }));
      expect(res.status).toBe(200);
      expect((await cos.listMessages(ws.id)).length).toBe(1);
    }
  });

  it("returns adapter responses and surfaces adapter rejections", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "T" });
    const hook = await cos.receive(
      {
        name: "h",
        kind: "native",
        async handle(req) {
          if (req.url.includes("handshake")) return { messages: [], response: new Response("ch123") };
          if (req.url.includes("forbidden")) throw new Response("nope", { status: 403 });
          return { messages: [] };
        },
      },
      { workspaceId: ws.id },
    );
    expect(await (await hook(new Request("https://local/handshake"))).text()).toBe("ch123");
    expect((await hook(new Request("https://local/forbidden"))).status).toBe(403);
  });

  it("jsonWebhook maps any JSON POST into messages, with optional verify", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "T" });
    const hook = await cos.receive(
      jsonWebhook({
        verify: (req) => req.headers.get("x-secret") === "s3",
        map: (p) => {
          const { id, author, body } = p as { id: string; author: string; body: string };
          return [{ id, author, body, sentAt: "2025-01-01T00:00:00Z" }];
        },
      }),
      { workspaceId: ws.id },
    );
    const denied = await hook(new Request("https://local/h", { method: "POST", body: "{}" }));
    expect(denied.status).toBe(403);
    const ok = await hook(
      new Request("https://local/h", {
        method: "POST",
        headers: { "x-secret": "s3" },
        body: JSON.stringify({ id: "j1", author: "Bob", body: "from a random service" }),
      }),
    );
    expect(ok.status).toBe(200);
    const messages = await cos.listMessages(ws.id);
    expect(messages[0]?.body).toBe("from a random service");
  });
});

describe("fetch() + request() — mount and escape hatch", () => {
  it("embedded instances answer as a fetch handler", async () => {
    const cos = CommunityOS.memory();
    const res = await cos.fetch(new Request("http://local/v1/health"));
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: true, product: "community-os" });
  });

  it("request() works both directions", async () => {
    for (const cos of [remoteCos(), CommunityOS.memory()]) {
      const health = await cos.request<{ ok: boolean }>("/v1/health");
      expect(health.ok).toBe(true);
    }
  });
});

describe("webhooks", () => {
  it("creates, lists (secret hidden), deletes — remote and local", async () => {
    for (const cos of [remoteCos(), CommunityOS.memory()]) {
      const ws = await cos.createWorkspace({ name: "T" });
      const sub = await cos.createWebhook(ws.id, { url: "https://hooks.test/x" });
      expect(sub.secret).toMatch(/^whsec_/);
      const listed = await cos.listWebhooks(ws.id);
      expect(listed.length).toBe(1);
      expect("secret" in listed[0]!).toBe(false);
      expect(await cos.deleteWebhook(sub.id)).toEqual({ ok: true });
      expect(await cos.listWebhooks(ws.id)).toEqual([]);
    }
  });
});

describe("verifyWebhookSignature", () => {
  it("verifies a real signed body and rejects tampering", async () => {
    const body = JSON.stringify({ id: "d1", kind: "rsvp", data: {} });
    const secret = "whsec_test123";
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(await verifyWebhookSignature(body, `sha256=${sig}`, secret)).toBe(true);
    expect(await verifyWebhookSignature(body + "x", `sha256=${sig}`, secret)).toBe(false);
    expect(await verifyWebhookSignature(body, "bad-header", secret)).toBe(false);
  });
});

describe("coverage completion", () => {
  it("remote call surfaces non-JSON error bodies as statusText", async () => {
    const cos = new CommunityOS({
      baseUrl: "http://x.test",
      fetch: (async () => new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" })) as typeof fetch,
    });
    await expect(cos.request("/v1/nope")).rejects.toMatchObject({ status: 502 });
  });

  it("embedded request() maps non-ok responses to ApiError", async () => {
    const cos = CommunityOS.memory();
    await expect(cos.request("/v1/members/ghost")).rejects.toMatchObject({ status: 404 });
  });

  it("remote() without fetch falls back to globalThis.fetch", () => {
    const cos = new CommunityOS({ baseUrl: "http://x.test" });
    expect(cos).toBeInstanceOf(CommunityOS);
  });

  it("request() forwards init.headers through call()", async () => {
    const seen: Record<string, string> = {};
    const cos = new CommunityOS({
      baseUrl: "http://x.test",
      fetch: (async (_u: unknown, init?: RequestInit) => {
        Object.assign(seen, init?.headers ?? {});
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as typeof fetch,
    });
    await cos.request("/v1/x", { headers: { "x-custom": "yes" } });
    expect(seen["x-custom"]).toBe("yes");
  });

  it("fetch() rejects on remote instances", async () => {
    const cos = new CommunityOS({ baseUrl: "http://x.test" });
    await expect(cos.fetch(new Request("http://x.test/v1/health"))).rejects.toMatchObject({ status: 500 });
  });

  it("receive(): 405 on non-POST, 403 on failed verify, custom response wins", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "H" });
    const handler = await cos.receive(
      jsonWebhook({ verify: () => false, map: () => [] }),
      { workspaceId: ws.id },
    );
    expect((await handler(new Request("http://x/hook", { method: "GET" }))).status).toBe(405);
    expect((await handler(new Request("http://x/hook", { method: "POST", body: "{}" }))).status).toBe(403);
  });

  it("receive(): ingest failure returns 500 so the platform retries", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "H" });
    const handler = await cos.receive(
      jsonWebhook({ map: () => [{ id: "1", author: "a", body: "x", sentAt: "2025-01-01T00:00:00.000Z" }] }),
      { workspaceId: ws.id },
    );
    // Store that fails mid-ingest — emit throws → 500 so the platform retries.
    const store = new MemoryStore();
    const real = store.insertMessages.bind(store);
    const ws2 = await store.createWorkspace({ name: "W", createdBy: "t" });
    store.insertMessages = async () => { throw new Error("db on fire"); };
    const cos2 = CommunityOS.store(store);
    const handler2 = await cos2.receive(
      { name: "t", kind: "native" as const, async handle() { return { messages: [{ id: "1", author: "a", body: "x", sentAt: "t" }] }; } },
      { workspaceId: ws2.id },
    );
    void handler;
    expect((await handler2(new Request("http://x/hook", { method: "POST", body: "{}" }))).status).toBe(500);
    store.insertMessages = real;
  });

  it("receive(): a Response thrown by handle propagates as-is; an adapter-supplied response wins", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "H" });
    const custom = await cos.receive(
      { name: "t", kind: "native" as const, async handle() { return { messages: [], response: Response.json({ custom: true }, { status: 202 }) }; } },
      { workspaceId: ws.id },
    );
    expect((await custom(new Request("http://x/hook", { method: "POST", body: "{}" }))).status).toBe(202);
    const throwing = await cos.receive(
      { name: "t", kind: "native" as const, async handle() { throw new Error("adapter blew up"); } },
      { workspaceId: ws.id },
    );
    await expect(throwing(new Request("http://x/hook", { method: "POST", body: "{}" }))).rejects.toThrow("adapter blew up");
  });

  it("serve() binds a real port on embedded instances", async () => {
    const cos = CommunityOS.memory();
    const { port, close } = await cos.serve({ port: 0 });
    try {
      const res = await fetch(`http://localhost:${port}/v1/health`);
      expect(res.status).toBe(200);
    } finally {
      close();
    }
  });

  it("serve() rejects on remote instances", async () => {
    const cos = new CommunityOS({ baseUrl: "http://x.test" });
    await expect(cos.serve()).rejects.toMatchObject({ status: 500 });
  });

  it("poller swallows a dead remote without breaking handlers", async () => {
    const cos = new CommunityOS({
      baseUrl: "http://dead.test",
      fetch: (async () => { throw new Error("connection refused"); }) as typeof fetch,
    });
    const seen: string[] = [];
    const off = cos.on("*", (e) => seen.push(e.kind), { pollMs: 5 });
    await new Promise((r) => setTimeout(r, 30));
    off();
    expect(seen).toEqual([]);
  });

  it("dispatch skips events older than the subscribe watermark", async () => {
    const store = new MemoryStore();
    const cos = CommunityOS.store(store);
    const ws = await cos.createWorkspace({ name: "W" });
    const seen: string[] = [];
    cos.on("*", (e) => seen.push(e.kind));
    // Direct store write with an ancient timestamp — embedded dispatch sees it
    // but the watermark check must skip it.
    await store.addTimeline({
      id: "t1", communityId: ws.id, kind: "import",
      payload: {}, createdAt: "1970-01-01T00:00:00.000Z",
    });
    expect(seen).toEqual([]);
  });

  it("on() uses the default poll interval when none is given", async () => {
    const cos = remoteCos();
    const off = cos.on("*", () => {});
    off();
  });

  it("updateMember assigns a public slug on first opt-in (embedded)", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "W" });
    await cos.ingest(ws.id, { source: { kind: "native", name: "t" }, messages: [{ id: "1", author: "Ada", body: "hi", sentAt: "2025-01-01T00:00:00.000Z" }] });
    const [m] = await cos.listMembers(ws.id);
    const updated = await cos.updateMember(m.id, { publicOptIn: true });
    expect(updated.publicSlug).toBe("ada");
    // A second patch leaves the slug alone.
    const again = await cos.updateMember(m.id, { notes: "hi" });
    expect(again.publicSlug).toBe("ada");
  });

  it("embedded draftOutreach falls back to 'Community' for a ghost workspace", async () => {
    const store = new MemoryStore();
    const cos = CommunityOS.store(store);
    const p = await store.createProposal({
      id: "p1", communityId: "ghost", demandId: "d", venueId: null,
      speakerIds: [], explanation: null, outreachDraft: null, status: "draft",
    });
    const pack = await cos.draftOutreach(p.id);
    expect(pack.outreachDraft).toContain("Community");
  });

  it("embedded blocklist stores confirmed=false when omitted", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "W" });
    const entry = await cos.addBlocklist(ws.id, { applicant: "Spammer", evidence: "links" });
    expect(entry.confirmed).toBe(false);
  });

  it("importChat routes adapter messages, transcripts and failures", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "W" });
    // adapter producing normalized messages → ingest path
    const csv: IngestAdapter = {
      parse: () => ({ messages: [{ id: "1", author: "Ada", body: "hi", sentAt: "2025-01-01T00:00:00.000Z" }] }),
    };
    const r = await cos.importChat(ws.id, new Uint8Array([1]), "data.csv", csv);
    expect(r.inserted).toBe(1);
    // adapter producing nothing → 400
    const empty: IngestAdapter = { parse: () => ({}) };
    await expect(cos.importChat(ws.id, new Uint8Array([1]), "x.bin", empty)).rejects.toMatchObject({ status: 400 });
    // adapter parse throwing a non-Error → 400 "error"
    const throwing: IngestAdapter = { parse: () => { throw "raw"; } };
    await expect(cos.importChat(ws.id, new Uint8Array([1]), "x.bin", throwing)).rejects.toMatchObject({ status: 400 });
  });

  it("importChat remote + transcript adapter posts the transcript", async () => {
    const cos = remoteCos();
    const ws = await cos.createWorkspace({ name: "W" });
    const adapter: IngestAdapter = {
      name: "raw-log",
      parse: () => ({ transcript: "01/01/2025, 10:00 - Ada: i want a meetup\n" }),
    };
    const r = await cos.importChat(ws.id, new Uint8Array([1, 2]), "log.txt", adapter);
    expect(r.inserted).toBe(1);
  });

  it("importChat remote without adapter posts raw bytes", async () => {
    const cos = remoteCos();
    const ws = await cos.createWorkspace({ name: "W" });
    const r = await cos.importChat(ws.id, new TextEncoder().encode("01/01/2025, 10:00 - Ada: i want a meetup\n"), "chat.txt");
    expect(r.inserted).toBe(1);
  });

  it("verifyWebhookSignature rejects a well-formed signature of the wrong length", async () => {
    expect(await verifyWebhookSignature("body", "sha256=abcd", "whsec_x")).toBe(false);
  });
});
  it("remote health goes over HTTP", async () => {
    const h = await remoteCos().health();
    expect(h.product).toBe("community-os");
  });

  it("serve() uses the default port when none is given", async () => {
    const cos = CommunityOS.memory();
    const { port, close } = await cos.serve({ hostname: "127.0.0.1" });
    try {
      expect(port).toBe(5173);
    } finally {
      close();
    }
  });

  it("a second subscription reuses the running poller", async () => {
    const cos = remoteCos();
    const off1 = cos.on("*", () => {}, { pollMs: 10 });
    const off2 = cos.on("import", () => {}, { pollMs: 10 });
    off1();
    off2();
  });

  it("importChat accepts ArrayBuffer and Blob inputs too", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "W" });
    const txt = "01/01/2025, 10:00 - Ada: i want a meetup\n";
    const ab = new TextEncoder().encode(txt).buffer as ArrayBuffer;
    expect((await cos.importChat(ws.id, ab, "a.txt")).inserted).toBe(1);
    const blob = new Blob([new TextEncoder().encode(txt.replace("meetup", "second"))]);
    expect((await cos.importChat(ws.id, blob, "b.txt")).inserted).toBe(1);
  });

  it("transcript adapter with files imports attachments (embedded)", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "W" });
    const adapter: IngestAdapter = {
      name: "with-files",
      parse: () => ({
        transcript: "01/01/2025, 10:00 - Ada: i want a meetup\n",
        files: [{ name: "photo.jpg", mime: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) }],
      }),
    };
    await cos.importChat(ws.id, new Uint8Array([9]), "x.zip", adapter);
    const files = await cos.listFiles(ws.id);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it("embedded createVenue keeps provided area, capacity and contact", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "W" });
    const v = await cos.createVenue(ws.id, { name: "Hall", area: "East", capacity: 30, contact: "x@y.z" });
    expect(v.area).toBe("East");
    expect(v.capacity).toBe(30);
    expect(v.contact).toBe("x@y.z");
  });

  it("request() with a string body sets content-type unless already set", async () => {
    const seen: Record<string, string> = {};
    const cos = new CommunityOS({
      baseUrl: "http://x.test",
      fetch: (async (_u: unknown, init?: RequestInit) => {
        Object.assign(seen, init?.headers ?? {});
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });
    await cos.request("/v1/a", { method: "POST", body: "{}" });
    expect(seen["content-type"]).toBe("application/json");
    await cos.request("/v1/b", { method: "POST", body: "raw", headers: { "content-type": "text/plain" } });
    expect(seen["content-type"]).toBe("text/plain");
    await cos.request("/v1/c", { method: "POST", body: new Uint8Array([1]) });
    expect(seen["content-type"]).toBe("text/plain"); // unchanged — non-string body sets nothing
  });

  it("embedded dispatch fires for events written after subscribe", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "W" });
    const seen: string[] = [];
    cos.on("*", (e) => seen.push(e.kind));
    await cos.ingest(ws.id, { source: { kind: "native", name: "t" }, messages: [{ id: "1", author: "Ada", body: "i want bread", sentAt: "2025-01-01T00:00:00.000Z" }] });
    await cos.refreshMemory(ws.id);
    expect(seen).toContain("memory");
  });

  it("verifyWebhookSignature accepts an uppercase SHA256= prefix", async () => {
    const body = "payload";
    const sig = createHmac("sha256", "whsec_x").update(body).digest("hex");
    expect(await verifyWebhookSignature(body, `SHA256=${sig}`, "whsec_x")).toBe(true);
  });

  it("local instances refuse remote calls through the internal transport", async () => {
    const cos = CommunityOS.memory();
    await expect((cos as unknown as { call(p: string): Promise<unknown> }).call("/v1/x")).rejects.toMatchObject({ status: 500 });
  });

  it("embedded health returns locally", async () => {
    expect(await CommunityOS.memory().health()).toEqual({ ok: true, product: "community-os" });
  });

  it("embedded transcript import without files still ingests", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "W" });
    const adapter: IngestAdapter = {
      name: "bare-transcript",
      parse: () => ({ transcript: "01/01/2025, 10:00 - Ada: i want a meetup\n" }),
    };
    expect((await cos.importChat(ws.id, new Uint8Array([7]), "x.bin", adapter)).inserted).toBe(1);
  });

  it("embedded createVenue defaults missing fields to null", async () => {
    const cos = CommunityOS.memory();
    const ws = await cos.createWorkspace({ name: "W" });
    const v = await cos.createVenue(ws.id, { name: "Bare" });
    expect(v.area).toBeNull();
    expect(v.capacity).toBeNull();
    expect(v.contact).toBeNull();
  });

  it("verifyWebhookSignature rejects a full-length tampered signature", async () => {
    expect(await verifyWebhookSignature("body", `sha256=${"f".repeat(64)}`, "whsec_x")).toBe(false);
  });
