import { describe, expect, it } from "vitest";
import { normalizeDiscordMessage } from "./index.ts";

const msg = (over: Record<string, unknown> = {}) => ({
  id: "1234567890",
  channel_id: "c1",
  guild_id: "g1",
  content: "anyone up for a meetup?",
  timestamp: "2025-01-01T10:00:00.000Z",
  author: { id: "u1", username: "ada", global_name: "Ada", bot: false },
  ...over,
});

describe("normalizeDiscordMessage", () => {
  it("normalizes a guild message", () => {
    expect(normalizeDiscordMessage(msg())).toEqual({
      id: "1234567890",
      author: "Ada",
      body: "anyone up for a meetup?",
      sentAt: "2025-01-01T10:00:00.000Z",
    });
  });

  it("drops bots and empty content", () => {
    expect(normalizeDiscordMessage(msg({ author: { username: "b", bot: true } }))).toBeNull();
    expect(normalizeDiscordMessage(msg({ content: "  " }))).toBeNull();
    expect(normalizeDiscordMessage(msg({ content: undefined }))).toBeNull();
  });

  it("honors channel/guild filters", () => {
    expect(normalizeDiscordMessage(msg(), { channelIds: ["other"] })).toBeNull();
    expect(normalizeDiscordMessage(msg(), { channelIds: ["c1"] })).not.toBeNull();
    expect(normalizeDiscordMessage(msg(), { guildIds: ["g2"] })).toBeNull();
  });
  it("falls back to 'unknown' author and the current time", () => {
    const m = normalizeDiscordMessage({ id: "7", content: "hi", author: {} });
    expect(m?.author).toBe("unknown");
    expect(m?.sentAt).toMatch(/^\d{4}-/);
  });
});
