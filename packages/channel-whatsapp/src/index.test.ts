import { describe, expect, it } from "vitest";
import { normalizeWhatsAppMessage } from "./index.ts";

const msg = (over: Record<string, any> = {}) => ({
  pushName: "Ada",
  message: { conversation: "see you at the venue" },
  messageTimestamp: 1735711200,
  ...over,
  key: { id: "AB12", remoteJid: "12345@g.us", participant: "1555123@s.whatsapp.net", fromMe: false, ...(over.key ?? {}) },
});

describe("normalizeWhatsAppMessage", () => {
  it("normalizes a group message", () => {
    expect(normalizeWhatsAppMessage(msg())).toEqual({
      id: "AB12",
      author: "Ada",
      body: "see you at the venue",
      sentAt: "2025-01-01T06:00:00.000Z",
    });
  });

  it("skips own messages, empty bodies, and non-group jids by default", () => {
    expect(normalizeWhatsAppMessage(msg({ key: { fromMe: true } }))).toBeNull();
    expect(normalizeWhatsAppMessage(msg({ message: { conversation: "" } }))).toBeNull();
    expect(normalizeWhatsAppMessage(msg({ key: { remoteJid: "1555@s.whatsapp.net" } }))).toBeNull();
    expect(normalizeWhatsAppMessage(msg({ key: { remoteJid: "status@broadcast" } }))).toBeNull();
  });

  it("reads extendedTextMessage and honors include:'all'", () => {
    const extended = msg({ message: { extendedTextMessage: { text: "with a link" } } });
    expect(normalizeWhatsAppMessage(extended)?.body).toBe("with a link");
    const dm = msg({ key: { remoteJid: "1555@s.whatsapp.net" } });
    expect(normalizeWhatsAppMessage(dm, "all")?.author).toBe("Ada");
  });
});
