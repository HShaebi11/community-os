import { describe, expect, it } from "vitest";
import { extractUrls, isNoiseMessage } from "./noise.ts";

describe("isNoiseMessage", () => {
  it.each([
    ["", "Ada"],
    ["  ", "Ada"],
    ["ok", "Ada"],
    ["lol", "Ada"],
    ["👍", "Ada"],
    ["<media omitted>", "Ada"],
    ["this message was deleted", "Ada"],
    ["Messages and calls are end-to-end encrypted", "Ada"],
    ["anything at all", "WhatsApp"],
    ["hi", "Ada"],
  ])("flags %j from %j as noise", (body, author) => {
    expect(isNoiseMessage(body, author)).toBe(true);
  });

  it.each(["real discussion here", "i want a workshop", "yes we should do that!", "looking for a venue downtown"])(
    "keeps %j as signal",
    (body) => {
      expect(isNoiseMessage(body, "Ada")).toBe(false);
    },
  );
});

describe("extractUrls", () => {
  it("pulls http and https urls out of a body", () => {
    expect(extractUrls("see http://a.co/x and https://b.co/y too")).toEqual(["http://a.co/x", "https://b.co/y"]);
  });

  it("strips trailing punctuation from urls", () => {
    expect(extractUrls("it's at https://a.co/x.")).toEqual(["https://a.co/x"]);
    expect(extractUrls("https://a.co/x, then https://b.co/y;")).toEqual(["https://a.co/x", "https://b.co/y"]);
  });

  it("returns [] when there is nothing", () => {
    expect(extractUrls("no links")).toEqual([]);
  });
});

describe("noise boundaries", () => {
  it("treats exactly-3-char bodies as signal, shorter as noise", () => {
    expect(isNoiseMessage("run", "Ada")).toBe(false);
    expect(isNoiseMessage("hi", "Ada")).toBe(true);
  });
  it("flags noise even when padded with whitespace", () => {
    expect(isNoiseMessage("  lol  ", "Ada")).toBe(true);
  });
  it("flags anything authored by the whatsapp system account, any case", () => {
    expect(isNoiseMessage("a perfectly long real sentence", "WhatsApp")).toBe(true);
    expect(isNoiseMessage("a perfectly long real sentence", "whatsapp")).toBe(true);
  });
  it("extractUrls strips runs of trailing punctuation", () => {
    expect(extractUrls("see https://a.com/x...")).toEqual(["https://a.com/x"]);
    expect(extractUrls("see https://a.com/y;,.")).toEqual(["https://a.com/y"]);
  });
});
