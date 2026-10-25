import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CommunityOS, jsonWebhook, type ChannelAdapter } from "@community-os/sdk";
import { SqliteStore } from "@community-os/store-sqlite";
import { makeWhatsAppZip, normalizedMessage, slackSign, transcripts } from "@community-os/testkit";
import { slackEvents } from "@community-os/channel-slack";

/** A scripted channel — no socket, just pushes a batch then idles. Proves the
 *  listen() plumbing end-to-end against the running server. */
const scriptedChannel = (messages: ReturnType<typeof normalizedMessage>[]): ChannelAdapter => ({
  name: "scripted",
  kind: "discord",
  async start(ctx) {
    await ctx.emit(messages);
  },
  async stop() {},
});

describe("e2e: a day in the life of a community", () => {
  const dirs: string[] = [];
  const servers: Array<() => void> = [];
  afterAll(() => {
    for (const close of servers.splice(0)) close();
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("runs the whole loop over real HTTP and a real SQLite file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cos-e2e-"));
    dirs.push(dir);
    const dbPath = join(dir, "community.db");
    const store = new SqliteStore(dbPath);

    // 1. Serve the OS over real HTTP.
    const kernel = CommunityOS.store(store, { publicOrigin: "http://os.test" });
    const { port, close } = await kernel.serve({ port: 0 });
    servers.push(close);
    const cos = new CommunityOS({ baseUrl: `http://127.0.0.1:${port}`, publicOrigin: "http://os.test" });
    expect((await cos.health()).product).toBe("community-os");

    // 2. A workspace, fed by every ingest surface.
    const ws = await cos.createWorkspace({ name: "Bread Town" });

    //    a) one-shot WhatsApp export (real zip bytes over /v1/imports)
    await cos.importChat(ws.id, makeWhatsAppZip(transcripts.ios), "export.zip");

    //    b) a live channel listener
    const handle = await cos.listen(
      scriptedChannel([normalizedMessage({ id: "d1", author: "Grace", body: "i can host, i have a venue" })]),
      { workspaceId: ws.id },
    );
    await handle.stop();

    //    c) a signature-verified Slack Events webhook, mounted on the same server
    const secret = "slack-signing-secret";
    const hook = await cos.receive(slackEvents({ signingSecret: secret }), { workspaceId: ws.id });
    const slackBody = JSON.stringify({
      type: "event_callback",
      event: { type: "message", ts: "1748732400.000100", user: "UADA", channel: "C1", text: "i want a bread workshop" },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await hook(
      new Request("https://incoming.test/slack", {
        method: "POST",
        headers: { "x-slack-signature": slackSign(secret, ts, slackBody), "x-slack-request-timestamp": ts },
        body: slackBody,
      }),
    );
    expect(res.status).toBe(200);

    //    d) the bare primitive — a script pushing normalized rows
    await cos.ingest(ws.id, { source: { kind: "slack", name: "script" }, messages: [
      normalizedMessage({ id: "s9", author: "Lin", body: "i want a bread workshop" }),
    ] });

    // Replay dedupe: deliver the same slack event again → nothing new lands.
    const replayed = await hook(
      new Request("https://incoming.test/slack", {
        method: "POST",
        headers: { "x-slack-signature": slackSign(secret, ts, slackBody), "x-slack-request-timestamp": ts },
        body: slackBody,
      }),
    );
    expect(replayed.status).toBe(200);

    // 3. Four sources, four members, five stored messages (the replay deduped).
    const members = await cos.listMembers(ws.id);
    expect(members.length).toBe(4); // Ada, Lin, Grace, UADA — script "Lin" aliases to the same member
    expect(await cos.listMessages(ws.id)).toHaveLength(5);

    // 4. Memory → demand → proposal → live event → public page → RSVP.
    const memory = await cos.refreshMemory(ws.id);
    const demand = memory.demands.find((d) => d.topic.includes("workshop"))!;
    expect(demand.memberIds.length).toBeGreaterThanOrEqual(2);
    const pack = await cos.createProposal(ws.id, demand.id);
    await cos.approveProposal(pack.id);
    const event = await cos.goLive(pack.id);

    const pub = await cos.publicEvent(event.slug);
    expect(pub.title).toBeTruthy();
    const guest = await cos.rsvp(event.slug, { name: "Ada", email: "ada@bakers.test" });
    expect(guest.memberId).toBeTruthy();

    // 5. Export → import into a second store over the same API → parity.
    const out = await cos.exportWorkspace(ws.id);
    expect(out.members).toHaveLength(4);
    expect(out.messages).toHaveLength(5);
    expect(out.events).toHaveLength(1);
    expect(out.guests).toHaveLength(1);

    const store2 = new SqliteStore(join(dir, "community-2.db"));
    const kernel2 = CommunityOS.store(store2);
    const { port: port2, close: close2 } = await kernel2.serve({ port: 0 });
    servers.push(close2);
    const cos2 = new CommunityOS({ baseUrl: `http://127.0.0.1:${port2}` });
    const ws2 = await cos2.createWorkspace({ name: "Bread Town Fork" });
    // Re-ingest the export's normalized view (platform ids preserved → dedupe-safe).
    await cos2.ingest(ws2.id, {
      source: { kind: "whatsapp", name: "reimport" },
      messages: out.messages.map((m) => ({ id: m.sourceMessageId, author: m.authorRaw, body: "", sentAt: m.sentAt })),
    });
    expect(await cos2.listMessages(ws2.id)).toHaveLength(5);
    expect(await cos2.listMembers(ws2.id)).toHaveLength(4);
  });

  it("jsonWebhook receives an arbitrary JSON service on the same mount", async () => {
    const store = new SqliteStore(":memory:");
    const kernel = CommunityOS.store(store);
    const { port, close } = await kernel.serve({ port: 0 });
    servers.push(close);
    const cos = new CommunityOS({ baseUrl: `http://127.0.0.1:${port}` });
    const ws = await cos.createWorkspace({ name: "Hooked" });

    const hook = await cos.receive(
      jsonWebhook({
        map: (p) => {
          const rows = (p as { rows?: Array<{ key: string; who: string; what: string }> }).rows ?? [];
          return rows.map((r) => ({ id: r.key, author: r.who, body: r.what, sentAt: "2025-06-01T00:00:00Z" }));
        },
      }),
      { workspaceId: ws.id },
    );
    const res = await hook(
      new Request("https://gw.test/n8n", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: [{ key: "k1", who: "Ada", what: "from n8n" }] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await cos.listMessages(ws.id)).toHaveLength(1);
  });
});
