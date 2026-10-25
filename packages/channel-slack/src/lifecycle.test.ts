import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket } from "@community-os/testkit";
import { slackChannel } from "./index.ts";

const envelope = (payload: unknown, envelope_id = "env-1") => ({ type: "events_api", envelope_id, payload });
const messageEvent = (over: Record<string, unknown> = {}) => ({
  event: { type: "message", ts: "1748732400.000100", user: "U1", channel: "C1", text: "hello slack", ...over },
});

/** Stub Slack's REST surface: connections.open + optional users.info. */
function stubSlackApi() {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("apps.connections.open")) {
      return Response.json({ ok: true, url: "wss://socket-mode.test" });
    }
    if (url.includes("users.info")) {
      return Response.json({ user: { profile: { display_name: "ada", real_name: "Ada L" } } });
    }
    return Response.json({ ok: false }, { status: 500 });
  }));
  return calls;
}

describe("slackChannel — socket mode lifecycle", () => {
  beforeEach(() => {
    FakeWebSocket.reset();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens a socket via apps.connections.open and acks every envelope", async () => {
    const calls = stubSlackApi();
    const adapter = slackChannel({ appToken: "xapp-t" });
    await adapter.start({ emit: async () => {} });
    expect(calls.some((u) => u.includes("apps.connections.open"))).toBe(true);
    const ws = FakeWebSocket.latest;
    expect(ws.url).toBe("wss://socket-mode.test");
    await ws.simulateMessage(envelope(messageEvent(), "env-42"));
    expect(ws.sent).toContain(JSON.stringify({ envelope_id: "env-42" }));
  });

  it("emits normalized messages and resolves user names via users.info", async () => {
    stubSlackApi();
    const emit = vi.fn(async (_msgs: unknown[]) => {});
    const adapter = slackChannel({ appToken: "xapp-t", botToken: "xoxb-t" });
    await adapter.start({ emit });
    await FakeWebSocket.latest.simulateMessage(envelope(messageEvent()));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject([
      { id: "C1:1748732400.000100", author: "ada", body: "hello slack", sentAt: "2025-05-31T23:00:00.000Z" },
    ]);
  });

  it("falls back to the user id without a bot token, ignores subtypes + non-messages", async () => {
    stubSlackApi();
    const emit = vi.fn(async (_msgs: unknown[]) => {});
    const adapter = slackChannel({ appToken: "xapp-t" });
    await adapter.start({ emit });
    const ws = FakeWebSocket.latest;
    await ws.simulateMessage(envelope(messageEvent({ user: "U9" })));
    expect(emit.mock.calls[0][0]).toMatchObject([{ author: "U9" }]);
    emit.mockClear();
    await ws.simulateMessage(envelope(messageEvent({ subtype: "message_changed" })));
    await ws.simulateMessage(envelope({ event: { type: "reaction_added" } }));
    expect(emit).not.toHaveBeenCalled();
  });

  it("reconnects after close — connections.open is fetched again", async () => {
    const calls = stubSlackApi();
    const adapter = slackChannel({ appToken: "xapp-t" });
    await adapter.start({ emit: async () => {} });
    FakeWebSocket.latest.simulateClose();
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls.filter((u) => u.includes("apps.connections.open"))).toHaveLength(2);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("does not reconnect after stop()", async () => {
    const calls = stubSlackApi();
    const adapter = slackChannel({ appToken: "xapp-t" });
    await adapter.start({ emit: async () => {} });
    await adapter.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.filter((u) => u.includes("apps.connections.open"))).toHaveLength(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("falls back to real_name when display_name is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("apps.connections.open")) return Response.json({ ok: true, url: "wss://socket-mode.test" });
      if (url.includes("users.info")) return Response.json({ user: { profile: { display_name: "", real_name: "Ada Lovelace" } } });
      return Response.json({ ok: false }, { status: 500 });
    }));
    const emit = vi.fn(async (_msgs: unknown[]) => {});
    const adapter = slackChannel({ appToken: "xapp-t", botToken: "xoxb-t" });
    await adapter.start({ emit });
    await FakeWebSocket.latest.simulateMessage(envelope(messageEvent({ user: "U42" })));
    expect(emit.mock.calls[0][0]).toMatchObject([{ author: "Ada Lovelace" }]);
  });

  it("keeps the user id when users.info fails — name resolution is best-effort", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("apps.connections.open")) return Response.json({ ok: true, url: "wss://socket-mode.test" });
      if (url.includes("users.info")) throw new Error("slack down");
      return Response.json({ ok: false }, { status: 500 });
    }));
    const emit = vi.fn(async (_msgs: unknown[]) => {});
    const adapter = slackChannel({ appToken: "xapp-t", botToken: "xoxb-t" });
    await adapter.start({ emit });
    await FakeWebSocket.latest.simulateMessage(envelope(messageEvent({ user: "U43" })));
    expect(emit.mock.calls[0][0]).toMatchObject([{ author: "U43" }]);
  });

  it("rejects start() when apps.connections.open fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false })));
    const adapter = slackChannel({ appToken: "xapp-t" });
    await expect(adapter.start({ emit: async () => {} })).rejects.toThrow("apps.connections.open failed");
  });

  it("ignores envelopes without an event", async () => {
    stubSlackApi();
    const emit = vi.fn(async (_msgs: unknown[]) => {});
    const adapter = slackChannel({ appToken: "xapp-t" });
    await adapter.start({ emit });
    await FakeWebSocket.latest.simulateMessage(envelope({}));
    expect(emit).not.toHaveBeenCalled();
  });
});
