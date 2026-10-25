import type { ChannelAdapter, NormalizedMessage } from "@community-os/sdk";

// WhatsApp has no official API for reading group messages — this adapter uses
// Baileys, the standard open-source multi-device client, paired via QR like
// WhatsApp Web. Honest caveat: it's unofficial, so it's isolated here as an
// optional package — nothing else in Community OS carries that dependency.

export type WhatsAppChannelOptions = {
  /** Directory for session credentials (pairing persists across restarts). */
  sessionDir?: string;
  /** Called with the QR string on pairing — render it however you want
   *  (terminal, UI). Defaults to logging it. */
  onQr?: (qr: string) => void;
  /** "groups" (default) ingests group chats only; "all" includes DMs. */
  include?: "groups" | "all";
};

type WaMessage = {
  key: { id?: string | null; remoteJid?: string | null; participant?: string | null; fromMe?: boolean | null };
  pushName?: string | null;
  message?: {
    conversation?: string | null;
    extendedTextMessage?: { text?: string | null } | null;
  } | null;
  messageTimestamp?: number | { toString(): string } | null;
};

/** A Baileys WAMessage → platform-neutral message, or null for things we
 *  shouldn't ingest (own messages, non-text, wrong scope). */
export function normalizeWhatsAppMessage(m: WaMessage, include: "groups" | "all" = "groups"): NormalizedMessage | null {
  if (!m.key?.id || m.key.fromMe) return null;
  const jid = m.key.remoteJid ?? "";
  if (include === "groups" && !jid.endsWith("@g.us")) return null;
  if (jid === "status@broadcast") return null;
  const body = (m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? "").trim();
  if (!body) return null;
  const ts =
    typeof m.messageTimestamp === "number"
      ? m.messageTimestamp
      : Number(m.messageTimestamp?.toString() ?? Date.now() / 1000);
  return {
    id: m.key.id,
    author: m.pushName || (m.key.participant ?? jid).split("@")[0] || "unknown",
    body,
    sentAt: new Date(ts * 1000).toISOString(),
  };
}

// Baileys expects a pino-style logger; we ship a silent one to avoid the dep.
const silentLogger = {
  level: "silent",
  child() {
    return this;
  },
  info() {},
  warn() {},
  error() {},
  debug() {},
  trace() {},
  fatal() {},
  silent() {},
};

/** Live WhatsApp ingestion via Baileys. `npm i @whiskeysockets/baileys` then:
 *  await cos.listen(whatsappChannel({ onQr: qr => showQr(qr) }), { workspaceId }) */
export function whatsappChannel(options: WhatsAppChannelOptions = {}): ChannelAdapter {
  let socket: { ev: { on(e: string, cb: (u: any) => void): void }; end(err?: Error): void } | null = null;
  let stopped = false;

  return {
    name: "whatsapp",
    kind: "whatsapp",
    async start(ctx) {
      stopped = false;
      const baileys = (await import("@whiskeysockets/baileys")) as any;
      const makeWASocket = baileys.default ?? baileys.makeWASocket;
      const { state, saveCreds } = await baileys.useMultiFileAuthState(options.sessionDir ?? ".cos-whatsapp");
      const { DisconnectReason } = baileys;

      const open = () => {
        socket = makeWASocket({ auth: state, logger: silentLogger });
        socket!.ev.on("creds.update", saveCreds);
        socket!.ev.on("connection.update", async (u: any) => {
          if (u.qr) (options.onQr ?? ((q) => console.log(`WhatsApp QR: ${q}`)))(u.qr);
          if (u.connection === "close") {
            const loggedOut = u.lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
            if (!stopped && !loggedOut) setTimeout(open, 2000);
          }
        });
        socket!.ev.on("messages.upsert", async (u: any) => {
          if (u.type !== "notify") return;
          const msgs = (u.messages as WaMessage[])
            .map((m) => normalizeWhatsAppMessage(m, options.include ?? "groups"))
            .filter((m): m is NormalizedMessage => m !== null);
          if (msgs.length) await ctx.emit(msgs);
        });
      };
      open();
    },
    async stop() {
      stopped = true;
      socket?.end(undefined);
      socket = null;
    },
  };
}
