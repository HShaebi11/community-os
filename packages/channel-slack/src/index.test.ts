import { describe, expect, it } from "vitest";
import { normalizeSlackEvent } from "./index.ts";

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

  it("drops subtypes, empty text, and filtered channels", () => {
    expect(normalizeSlackEvent(event({ subtype: "message_changed" }), id)).toBeNull();
    expect(normalizeSlackEvent(event({ subtype: "bot_message" }), id)).toBeNull();
    expect(normalizeSlackEvent(event({ text: "" }), id)).toBeNull();
    expect(normalizeSlackEvent(event(), id, { channelIds: ["C999"] })).toBeNull();
    expect(normalizeSlackEvent(event({ type: "reaction_added" }), id)).toBeNull();
  });
});
