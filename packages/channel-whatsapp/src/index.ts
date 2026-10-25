import type { ChannelAdapter, NormalizedMessage, WebhookAdapter } from "@community-os/sdk";

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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
/* v8 ignore start -- only reachable inside the real Baileys runtime */
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
/* v8 ignore stop */

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

// --- Official Cloud API receiver -------------------------------------------
// Meta's webhook: GET verification handshake, then signed POSTs per message.
// Official coverage for everything the Cloud API can see — inbound messages to
// the business number (1:1), plus Groups API groups (OBA-only, ≤8 members).
// Existing community groups remain Baileys-only; see the caveat above.

type CloudWebhookValue = {
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: {
    from?: string;
    id?: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
  }[];
};

/** A Meta webhook payload → platform-neutral messages (text only). */
export function normalizeCloudWebhook(payload: { entry?: { changes?: { value?: CloudWebhookValue }[] }[] }): NormalizedMessage[] {
  const out: NormalizedMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const names = new Map((value?.contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? ""]));
      for (const m of value?.messages ?? []) {
        const body = (m.type === "text" ? m.text?.body : "")?.trim() ?? "";
        if (!body || !m.id || !m.from) continue;
        out.push({
          id: m.id,
          author: names.get(m.from) || m.from,
          body,
          sentAt: new Date(Number(m.timestamp ?? 0) * 1000).toISOString(),
        });
      }
    }
  }
  return out;
}

/** Official WhatsApp ingestion — Meta Cloud API webhooks. GET performs the
 *  subscribe handshake (hub.verify_token), POSTs are verified with
 *  x-hub-signature-256 when `appSecret` is set (recommended):
 *
 *    const hook = await cos.receive(whatsappCloud({ verifyToken, appSecret }), { workspaceId });
 *    // point Meta's callback URL at wherever you serve hook(request)      */
export function whatsappCloud(options: {
  /** The verify token you set in the Meta app dashboard. */
  verifyToken: string;
  /** App secret — enables x-hub-signature-256 verification when provided. */
  appSecret?: string;
}): WebhookAdapter {
  return {
    name: "whatsapp-cloud",
    kind: "whatsapp",
    async handle(request) {
      if (request.method === "GET") {
        const q = new URL(request.url).searchParams;
        if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === options.verifyToken) {
          return { messages: [], response: new Response(q.get("hub.challenge") ?? "", { status: 200 }) };
        }
        throw new Response("forbidden", { status: 403 });
      }
      const body = await request.text();
      if (options.appSecret) {
        const signature = request.headers.get("x-hub-signature-256") ?? "";
        const expected = `sha256=${await hmacSha256Hex(options.appSecret, body)}`;
        if (!safeEqual(signature, expected)) throw new Response("bad signature", { status: 403 });
      }
      return { messages: normalizeCloudWebhook(JSON.parse(body)) };
    },
  };
}
