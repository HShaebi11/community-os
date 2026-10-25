import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeCloudWebhook, normalizeWhatsAppMessage, whatsappCloud } from "./index.ts";

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

const CLOUD_PAYLOAD = {
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ wa_id: "1555123", profile: { name: "Ada" } }],
            messages: [
              { from: "1555123", id: "wamid.AB12", timestamp: "1735711200", type: "text", text: { body: "meetup friday?" } },
              { from: "1555999", id: "wamid.CD34", timestamp: "1735711260", type: "image" },
            ],
          },
        },
      ],
    },
  ],
};


  it("drops status broadcasts, falls back to jid/unknown authors", () => {
    expect(normalizeWhatsAppMessage({ key: { id: "1", remoteJid: "status@broadcast" }, message: { conversation: "x" }, messageTimestamp: 1 }, "all")).toBeNull();
    const noPush = normalizeWhatsAppMessage(
      { key: { id: "2", remoteJid: "123@g.us" }, message: { conversation: "hi" }, messageTimestamp: 1 },
    );
    expect(noPush?.author).toBe("123");
    const nobody = normalizeWhatsAppMessage(
      { key: { id: "3", remoteJid: "456@s.whatsapp.net" }, message: { extendedTextMessage: {} }, messageTimestamp: 1 },
      "all",
    );
    expect(nobody).toBeNull(); // empty text after ??.trim()
    const bare = normalizeWhatsAppMessage(
      { key: { id: "4", remoteJid: "789@s.whatsapp.net" }, message: { conversation: "yo" }, messageTimestamp: { toString: () => "1700000000" } },
      "all",
    );
    expect(bare?.sentAt).toBe("2023-11-14T22:13:20.000Z");
    const noTs = normalizeWhatsAppMessage(
      { key: { id: "5", remoteJid: "789@s.whatsapp.net" }, message: { conversation: "yo" } },
      "all",
    );
    expect(noTs?.sentAt).toBeTruthy();
    const unknown = normalizeWhatsAppMessage(
      { key: { id: "6" }, message: { conversation: "yo" }, messageTimestamp: 1 },
      "all",
    );
    expect(unknown?.author).toBe("unknown");
  });

describe("whatsappCloud — official Cloud API receiver", () => {
  it("answers the GET subscribe handshake, rejects bad tokens", async () => {
    const adapter = whatsappCloud({ verifyToken: "vtok" });
    const ok = await adapter.handle(
      new Request("https://local/wa?hub.mode=subscribe&hub.verify_token=vtok&hub.challenge=ch123"),
    );
    expect(await ok.response?.text()).toBe("ch123");
    await expect(
      adapter.handle(new Request("https://local/wa?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=x")),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("normalizes text messages, names authors from contacts, skips non-text", () => {
    expect(normalizeCloudWebhook(CLOUD_PAYLOAD)).toEqual([
      { id: "wamid.AB12", author: "Ada", body: "meetup friday?", sentAt: "2025-01-01T06:00:00.000Z" },
    ]);
  });

  it("verifies x-hub-signature-256 when appSecret is set", async () => {
    const adapter = whatsappCloud({ verifyToken: "vtok", appSecret: "appsec" });
    const body = JSON.stringify(CLOUD_PAYLOAD);
    const sig = `sha256=${createHmac("sha256", "appsec").update(body).digest("hex")}`;
    const ok = await adapter.handle(
      new Request("https://local/wa", { method: "POST", headers: { "x-hub-signature-256": sig }, body }),
    );
    expect(ok.messages.length).toBe(1);
    await expect(
      adapter.handle(new Request("https://local/wa", { method: "POST", headers: { "x-hub-signature-256": "sha256=bad" }, body })),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("normalizeCloudWebhook — fallbacks", () => {
  it("handles sparse payloads — missing entry/changes/contacts/messages", () => {
    expect(normalizeCloudWebhook({})).toEqual([]);
    expect(normalizeCloudWebhook({ entry: [{}] })).toEqual([]);
    expect(normalizeCloudWebhook({ entry: [{ changes: [{}] }] })).toEqual([]);
    const out = normalizeCloudWebhook({
      entry: [{ changes: [{ value: { messages: [{ from: "1555", id: "w1", type: "text", text: { body: "hi" } }] } }] }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].author).toBe("1555"); // no contacts → author is the raw sender
    expect(out[0].sentAt).toBe("1970-01-01T00:00:00.000Z"); // missing timestamp → 0
  });

  it("skips messages without id/from and empty bodies", () => {
    const out = normalizeCloudWebhook({
      entry: [{
        changes: [{
          value: {
            contacts: [{ profile: { name: "NoId" } }, { wa_id: "9" }],
            messages: [
              { from: "1", type: "text", text: { body: "no id" } },
              { id: "m2", type: "text", text: { body: "no from" } },
              { from: "2", id: "m3", type: "text" },
              { from: "3", id: "m4", type: "image", text: { body: "not text" } },
            ],
          },
        }],
      }],
    });
    expect(out).toEqual([]);
  });
});
describe("whatsappCloud — request edge cases", () => {
  it("returns an empty challenge body when hub.challenge is absent", async () => {
    const adapter = whatsappCloud({ verifyToken: "vtok" });
    const res = await adapter.handle(new Request("https://local/wa?hub.mode=subscribe&hub.verify_token=vtok"));
    expect((await res.response?.text()) ?? "").toBe("");
  });

  it("rejects signed webhooks that arrive without the signature header", async () => {
    const adapter = whatsappCloud({ verifyToken: "vtok", appSecret: "sec" });
    await expect(
      adapter.handle(new Request("https://local/wa", { method: "POST", body: "{}" })),
    ).rejects.toMatchObject({ status: 403 });
  });
});
