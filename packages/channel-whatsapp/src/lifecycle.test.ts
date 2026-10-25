import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Baileys is an optional peer — mock the whole module so the adapter's
 *  `await import("@whiskeysockets/baileys")` resolves to our fake socket. */
const sockets: Array<{ ev: { on: (e: string, cb: (u: any) => void) => void }; ended: unknown[] }> = [];
const handlers: Array<Record<string, (u: any) => unknown>> = [];
const saveCreds = vi.fn(async () => {});
const endCalls: unknown[][] = [];

function makeSocket() {
  const registered: Record<string, (u: any) => unknown> = {};
  const socket = {
    ev: { on: (e: string, cb: (u: any) => void) => void (registered[e] = cb) },
    end: (...args: unknown[]) => void endCalls.push(args),
  };
  sockets.push(socket as never);
  handlers.push(registered);
  return socket;
}

vi.mock("@whiskeysockets/baileys", () => ({
  default: () => makeSocket(),
  makeWASocket: () => makeSocket(),
  useMultiFileAuthState: async () => ({ state: {}, saveCreds }),
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
}));

const { whatsappChannel } = await import("./index.ts");

const groupMessage = (body = "hello group", remoteJid = "123@g.us") => ({
  key: { id: "m1", remoteJid, fromMe: false, participant: "p1" },
  pushName: "Ada",
  messageTimestamp: 1748732400,
  message: { conversation: body },
});

describe("whatsappChannel — baileys lifecycle", () => {
  beforeEach(() => {
    sockets.length = 0;
    handlers.length = 0;
    endCalls.length = 0;
    saveCreds.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers creds/connection/message handlers on start", async () => {
    const adapter = whatsappChannel({ sessionDir: "/tmp/cos-wa-test" });
    await adapter.start({ emit: async () => {} });
    expect(sockets).toHaveLength(1);
    expect(Object.keys(handlers[0])).toEqual(expect.arrayContaining(["creds.update", "connection.update", "messages.upsert"]));
    handlers[0]["creds.update"]!({});
    expect(saveCreds).toHaveBeenCalled();
    await adapter.stop();
  });

  it("emits normalized group messages on notify upserts only", async () => {
    const emit = vi.fn(async (_msgs: unknown[]) => {});
    const adapter = whatsappChannel({ sessionDir: "/tmp/cos-wa-test" });
    await adapter.start({ emit });
    await handlers[0]["messages.upsert"]!({ type: "notify", messages: [groupMessage()] });
    expect(emit).toHaveBeenCalledTimes(1);
    expect((emit.mock.calls[0][0] as any[])[0]).toMatchObject({ author: "Ada", body: "hello group" });
    emit.mockClear();
    await handlers[0]["messages.upsert"]!({ type: "append", messages: [groupMessage()] });
    expect(emit).not.toHaveBeenCalled();
    await adapter.stop();
  });

  it("fires onQr when a qr payload arrives", async () => {
    const onQr = vi.fn();
    const adapter = whatsappChannel({ sessionDir: "/tmp/cos-wa-test", onQr });
    await adapter.start({ emit: async () => {} });
    handlers[0]["connection.update"]!({ qr: "qr-string" });
    expect(onQr).toHaveBeenCalledWith("qr-string");
    await adapter.stop();
  });

  it("reconnects on a normal disconnect, stays down on loggedOut", async () => {
    const adapter = whatsappChannel({ sessionDir: "/tmp/cos-wa-test" });
    await adapter.start({ emit: async () => {} });
    await handlers[0]["connection.update"]!({ connection: "close", lastDisconnect: { error: { output: { statusCode: 500 } } } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(sockets).toHaveLength(2);

    await handlers[1]["connection.update"]!({ connection: "close", lastDisconnect: { error: { output: { statusCode: 401 } } } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(sockets).toHaveLength(2); // loggedOut — no retry
    await adapter.stop();
  });

  it("uses the default session dir and logs QR to the console", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const adapter = whatsappChannel();
    await adapter.start({ emit: async () => {} });
    handlers[0]["connection.update"]!({ qr: "default-qr" });
    expect(log).toHaveBeenCalledWith("WhatsApp QR: default-qr");
    await adapter.stop();
    log.mockRestore();
  });

  it("stop() ends the socket and prevents reconnect", async () => {
    const adapter = whatsappChannel({ sessionDir: "/tmp/cos-wa-test" });
    await adapter.start({ emit: async () => {} });
    await adapter.stop();
    expect(endCalls).toHaveLength(1);
    await handlers[0]["connection.update"]!({ connection: "close", lastDisconnect: {} });
    await vi.advanceTimersByTimeAsync(5000);
    expect(sockets).toHaveLength(1);
  });
});
