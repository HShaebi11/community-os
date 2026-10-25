import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket } from "@community-os/testkit";
import { discordChannel } from "./index.ts";

const hello = (interval = 45000) => ({ op: 10, d: { heartbeat_interval: interval }, s: null, t: null });
const dispatch = (t: string | null, d: unknown, s = 1) => ({ op: 0, d, s, t });

describe("discordChannel — gateway lifecycle", () => {
  beforeEach(() => {
    FakeWebSocket.reset();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("identifies on HELLO with token + GUILD_MESSAGES|MESSAGE_CONTENT intents", async () => {
    const adapter = discordChannel({ token: "bot-token" });
    await adapter.start({ emit: async () => {} });
    const ws = FakeWebSocket.latest;
    expect(ws.url).toContain("gateway.discord.gg");
    await ws.simulateMessage(hello());
    const identify = ws.sentFrames<{ op: number; d: { token: string; intents: number } }>()[0];
    expect(identify.op).toBe(2);
    expect(identify.d.token).toBe("bot-token");
    expect(identify.d.intents).toBe(512 | 32768);
  });

  it("answers heartbeats with op 1 carrying the last seq", async () => {
    const adapter = discordChannel({ token: "t" });
    await adapter.start({ emit: async () => {} });
    const ws = FakeWebSocket.latest;
    await ws.simulateMessage(hello(1000));
    await ws.simulateMessage(dispatch(null, null, 42));
    await vi.advanceTimersByTimeAsync(1000);
    const frames = ws.sentFrames<{ op: number; d: number | null }>();
    const hb = frames.find((f) => f.op === 1);
    expect(hb?.d).toBe(42);
  });

  it("emits normalized messages on MESSAGE_CREATE, ignores other dispatches", async () => {
    const emit = vi.fn(async (_msgs: unknown[]) => {});
    const adapter = discordChannel({ token: "t" });
    await adapter.start({ emit });
    const ws = FakeWebSocket.latest;
    await ws.simulateMessage(hello());
    await ws.simulateMessage(dispatch("MESSAGE_CREATE", {
      id: "m1",
      content: "hello discord",
      timestamp: "2025-06-01T00:00:00Z",
      channel_id: "c1",
      author: { id: "u1", username: "ada" },
    }));
    await ws.simulateMessage(dispatch("TYPING_START", {}));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject([{ id: "m1", author: "ada", body: "hello discord" }]);
  });

  it("resumes on reconnect once it has a session, with the resume URL", async () => {
    const adapter = discordChannel({ token: "t" });
    await adapter.start({ emit: async () => {} });
    const ws = FakeWebSocket.latest;
    await ws.simulateMessage(hello());
    await ws.simulateMessage(dispatch("READY", { session_id: "sess-1" }, 7));

    ws.simulateClose();
    await vi.advanceTimersByTimeAsync(2000);
    const reopened = FakeWebSocket.latest;
    expect(reopened).not.toBe(ws);
    expect(reopened.url).toContain("resume=1");
    await reopened.simulateMessage(hello());
    const frames = reopened.sentFrames<{ op: number; d: { session_id: string; seq: number } }>();
    const resume = frames.find((f) => f.op === 6);
    expect(resume?.d).toMatchObject({ session_id: "sess-1", seq: 7 });
  });

  it("falls back to a full identify after INVALID_SESSION", async () => {
    const adapter = discordChannel({ token: "t" });
    await adapter.start({ emit: async () => {} });
    const ws = FakeWebSocket.latest;
    await ws.simulateMessage(hello());
    await ws.simulateMessage(dispatch("READY", { session_id: "sess-1" }));
    await ws.simulateMessage({ op: 9, d: false, s: null, t: null });
    await vi.advanceTimersByTimeAsync(2000);
    const reopened = FakeWebSocket.latest;
    expect(reopened.url).not.toContain("resume=1");
    await reopened.simulateMessage(hello());
    expect(reopened.sentFrames<{ op: number }>()[0].op).toBe(2); // IDENTIFY, not RESUME
  });

  it("does not reconnect after stop()", async () => {
    const adapter = discordChannel({ token: "t" });
    await adapter.start({ emit: async () => {} });
    const ws = FakeWebSocket.latest;
    await adapter.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("handles RESUMED, heartbeat-ack, reconnect and unknown opcodes", async () => {
    const adapter = discordChannel({ token: "t" });
    await adapter.start({ emit: async () => {} });
    const ws = FakeWebSocket.latest;
    await ws.onmessage?.({ data: JSON.stringify(hello()) });
    await ws.onmessage?.({ data: JSON.stringify(dispatch("READY", { session_id: "s1" })) });
    await ws.onmessage?.({ data: JSON.stringify(dispatch("RESUMED", {})) });
    await ws.onmessage?.({ data: JSON.stringify({ op: 11, d: null, s: null, t: null }) });
    await ws.onmessage?.({ data: JSON.stringify({ op: 99, d: null, s: null, t: null }) });
    await ws.onmessage?.({ data: JSON.stringify({ op: 7, d: null, s: null, t: null }) });
    expect(ws.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.latest.url).toContain("resume=1");
  });

  it("clears the heartbeat timer on stop()", async () => {
    const adapter = discordChannel({ token: "t" });
    await adapter.start({ emit: async () => {} });
    const ws = FakeWebSocket.latest;
    await ws.onmessage?.({ data: JSON.stringify(hello(60000)) });
    await adapter.stop();
    const sent = ws.sent.length;
    await vi.advanceTimersByTimeAsync(120000);
    expect(ws.sent.length).toBe(sent);
  });
});
