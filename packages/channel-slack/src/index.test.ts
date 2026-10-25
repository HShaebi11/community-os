import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { normalizeSlackEvent, slackEvents } from "./index.ts";

const event = (over: Record<string, unknown> = {}) => ({
  type: "message",
  ts: "1735711200.000100",
  user: "U123",
  channel: "C456",
  text: "meetup friday?",
  ...over,
});

const id = (u: string) => u;

describe("normalizeSlackEvent", () => {
  it("normalizes a message event — ts becomes the ISO timestamp and id", () => {
    expect(normalizeSlackEvent(event(), id)).toEqual({
      id: "C456:1735711200.000100",
      author: "U123",
      body: "meetup friday?",
      sentAt: "2025-01-01T06:00:00.000Z",
    });
  });

  it("resolves author names via the lookup", () => {
    const resolved = normalizeSlackEvent(event(), () => "Ada");
    expect(resolved?.author).toBe("Ada");
  });


  it("treats missing channel/text as empty and unknown", () => {
    const missingText = normalizeSlackEvent(event({ text: undefined }), id);
    expect(missingText).toBeNull();
    const noChannel = normalizeSlackEvent(event({ channel: undefined }), id);
    expect(noChannel?.id.startsWith("unknown:")).toBe(true);
    const filtered = normalizeSlackEvent(event({ channel: undefined }), id, { channelIds: ["C1"] });
    expect(filtered).toBeNull();
  });

  it("drops subtypes, empty text, and filtered channels", () => {
    expect(normalizeSlackEvent(event({ subtype: "message_changed" }), id)).toBeNull();
    expect(normalizeSlackEvent(event({ subtype: "bot_message" }), id)).toBeNull();
    expect(normalizeSlackEvent(event({ text: "" }), id)).toBeNull();
    expect(normalizeSlackEvent(event(), id, { channelIds: ["C999"] })).toBeNull();
    expect(normalizeSlackEvent(event({ type: "reaction_added" }), id)).toBeNull();
  });
});

const SECRET = "test-signing-secret";
const signedRequest = (body: string, secret = SECRET, ts = String(Math.floor(Date.now() / 1000))) => {
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;
  return new Request("https://local/slack", {
    method: "POST",
    headers: { "x-slack-request-timestamp": ts, "x-slack-signature": signature },
    body,
  });
};

describe("slackEvents — passive Events API receiver", () => {
  it("answers url_verification with the challenge, no messages", async () => {
    const adapter = slackEvents({ signingSecret: SECRET });
    const res = await adapter.handle(signedRequest(JSON.stringify({ type: "url_verification", challenge: "abc123" })));
    expect(await res.response?.json()).toEqual({ challenge: "abc123" });
    expect(res.messages).toEqual([]);
  });

  it("verifies the signature and normalizes the event", async () => {
    const adapter = slackEvents({ signingSecret: SECRET });
    const res = await adapter.handle(signedRequest(JSON.stringify({ type: "event_callback", event: event() })));
    expect(res.messages).toEqual([
      { id: "C456:1735711200.000100", author: "U123", body: "meetup friday?", sentAt: "2025-01-01T06:00:00.000Z" },
    ]);
  });

  it("rejects bad signatures and stale timestamps with 403", async () => {
    const adapter = slackEvents({ signingSecret: SECRET });
    const body = JSON.stringify({ type: "event_callback", event: event() });
    await expect(adapter.handle(signedRequest(body, "wrong-secret"))).rejects.toMatchObject({ status: 403 });
    await expect(adapter.handle(signedRequest(body, SECRET, "1000"))).rejects.toMatchObject({ status: 403 });
  });

  it("rejects requests with missing signature headers", async () => {
    const adapter = slackEvents({ signingSecret: SECRET });
    const req = new Request("https://x.test/slack", { method: "POST", body: "{}" });
    await expect(adapter.handle(req)).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a well-formed signature of the wrong length", async () => {
    const adapter = slackEvents({ signingSecret: SECRET });
    const body = JSON.stringify({ type: "event_callback", event: event() });
    const ts = String(Math.floor(Date.now() / 1000));
    const req = new Request("https://x.test/slack", {
      method: "POST",
      body,
      headers: { "x-slack-request-timestamp": ts, "x-slack-signature": "v0=abcd" },
    });
    await expect(adapter.handle(req)).rejects.toMatchObject({ status: 403 });
  });

  it("resolves unknown users via users.info when a botToken is configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("users.info?user=U999");
      return Response.json({ user: { profile: { real_name: "Real Name" } } });
    }));
    const adapter = slackEvents({ signingSecret: SECRET, botToken: "xoxb-t" });
    const res = await adapter.handle(signedRequest(JSON.stringify({ type: "event_callback", event: event({ user: "U999" }) })));
    expect(res.messages[0]?.author).toBe("Real Name");
    // Second event for the same user skips the API call.
    const res2 = await adapter.handle(signedRequest(JSON.stringify({ type: "event_callback", event: event({ user: "U999", ts: "1735711300.0" }) })));
    expect(res2.messages[0]?.author).toBe("Real Name");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("keeps the raw user id when users.info fails or has no name", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const adapter = slackEvents({ signingSecret: SECRET, botToken: "xoxb-t" });
    const res = await adapter.handle(signedRequest(JSON.stringify({ type: "event_callback", event: event({ user: "U888" }) })));
    expect(res.messages[0]?.author).toBe("U888");
    vi.unstubAllGlobals();
  });

  it("returns no messages when the payload has no event", async () => {
    const adapter = slackEvents({ signingSecret: SECRET });
    const res = await adapter.handle(signedRequest(JSON.stringify({ type: "event_callback" })));
    expect(res.messages).toEqual([]);
  });

  it("returns no messages for non-normalizable events", async () => {
    const adapter = slackEvents({ signingSecret: SECRET });
    const res = await adapter.handle(
      signedRequest(JSON.stringify({ type: "event_callback", event: event({ subtype: "bot_message" }) })),
    );
    expect(res.messages).toEqual([]);
  });
});
