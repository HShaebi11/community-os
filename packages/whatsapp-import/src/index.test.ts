import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { makeWhatsAppZip, transcripts } from "@community-os/testkit";
import { parseWhatsAppExport } from "./index.ts";

describe("parseWhatsAppExport — plain text", () => {
  it("accepts a raw .txt transcript", () => {
    const out = parseWhatsAppExport(strToU8(transcripts.ios), "export.txt");
    expect(out.messages).toHaveLength(2);
    expect(out.files).toHaveLength(0);
  });

  it("detects transcript-looking bytes even without a .txt name", () => {
    const out = parseWhatsAppExport(strToU8(transcripts.android), "export.bin");
    expect(out.messages).toHaveLength(2);
  });
});

describe("parseWhatsAppExport — zip archives", () => {
  it("extracts _chat.txt and parses the messages", () => {
    const out = parseWhatsAppExport(makeWhatsAppZip(transcripts.ios));
    expect(out.messages).toHaveLength(2);
    expect(out.messages[0].authorRaw).toBe("Ada");
  });

  it("prefers the chat-looking .txt when a zip holds several", () => {
    const zip = zipSync({
      "notes.txt": strToU8("not a transcript"),
      "_chat.txt": strToU8(transcripts.ios),
    });
    const out = parseWhatsAppExport(zip);
    expect(out.messages[0].authorRaw).toBe("Ada");
  });

  it("falls back to the only .txt when no chat-named file exists", () => {
    const zip = zipSync({ "whatever.txt": strToU8(transcripts.ios) });
    const out = parseWhatsAppExport(zip);
    expect(out.messages).toHaveLength(2);
  });

  it("collects attachment files with guessed mime types", () => {
    const zip = makeWhatsAppZip(transcripts.attachment, {
      "poster.jpg": new Uint8Array([1, 2, 3]),
      "doc.pdf": new Uint8Array([4, 5]),
    });
    const out = parseWhatsAppExport(zip);
    expect(out.files).toHaveLength(2);
    expect(out.files.find((f) => f.name === "poster.jpg")?.mime).toBe("image/jpeg");
    expect(out.files.find((f) => f.name === "doc.pdf")?.mime).toBe("application/pdf");
  });

  it("throws a clean error when the zip has no transcript", () => {
    const zip = zipSync({ "photo.jpg": new Uint8Array([1]) });
    expect(() => parseWhatsAppExport(zip)).toThrow("No chat.txt");
  });

  it("throws on corrupt zip bytes", () => {
    const garbage = new Uint8Array(64).fill(0x42);
    // Not text-looking → zip path → fflate rejects it.
    expect(() => parseWhatsAppExport(garbage, "export.zip")).toThrow();
  });
  it("guesses every known extension and falls back to octet-stream", () => {
    const zip = makeWhatsAppZip(transcripts.attachment, {
      "shot.webp": new Uint8Array([1]),
      "clip.mp4": new Uint8Array([2]),
      "logo.png": new Uint8Array([3]),
      "payload.bin": new Uint8Array([9]),
    });
    const out = parseWhatsAppExport(zip);
    expect(out.files.find((f) => f.name === "shot.webp")?.mime).toBe("image/webp");
    expect(out.files.find((f) => f.name === "clip.mp4")?.mime).toBe("video/mp4");
    expect(out.files.find((f) => f.name === "logo.png")?.mime).toBe("image/png");
    expect(out.files.find((f) => f.name === "payload.bin")?.mime).toBe("application/octet-stream");
  });
});
