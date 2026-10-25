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

export type SlackChannelOptions = {
  /** App-level token (xapp-…) with `connections:write` — opens Socket Mode. */
  appToken: string;
  /** Bot token (xoxb-…) — resolves user ids to display names via users.info.
   *  Without it, `author` is the Slack user id. */
  botToken?: string;
  /** Only ingest these channel ids; omit for all the app can see. */
  channelIds?: string[];
  /** Slack API base (tests/proxies). */
  apiBase?: string;
};

type SlackEvent = {
  type: string;
  subtype?: string;
  ts?: string;
  user?: string;
  channel?: string;
  text?: string;
};

/** A Slack `message` event → platform-neutral message, or null for things we
 *  shouldn't ingest (bot messages, edits/deletes subtypes, filtered channels,
 *  empty text). `authorName` comes from a resolved-users map when available. */
export function normalizeSlackEvent(
  event: SlackEvent,
  resolveAuthor: (userId: string) => string,
  filter?: { channelIds?: string[] },
): NormalizedMessage | null {
  if (event.type !== "message" || event.subtype) return null;
  if (filter?.channelIds?.length && !filter.channelIds.includes(event.channel ?? "")) return null;
  const body = (event.text ?? "").trim();
  if (!body || !event.ts || !event.user) return null;
  return {
    id: `${event.channel ?? "unknown"}:${event.ts}`,
    author: resolveAuthor(event.user),
    body,
    sentAt: new Date(Number.parseFloat(event.ts) * 1000).toISOString(),
  };
}

/** Live Slack ingestion over Socket Mode — outbound WebSocket, so it works
 *  behind NAT with no public endpoint. Raw protocol, no @slack/* deps. */
export function slackChannel(options: SlackChannelOptions): ChannelAdapter {
  let ws: WebSocket | null = null;
  let stopped = false;
  const userNames = new Map<string, string>();

  const resolveAuthor = (userId: string) => userNames.get(userId) ?? userId;

  const fetchName = async (userId: string) => {
    if (!options.botToken || userNames.has(userId)) return;
    try {
      const res = await fetch(`${options.apiBase ?? "https://slack.com"}/api/users.info?user=${userId}`, {
        headers: { authorization: `Bearer ${options.botToken}` },
      });
      const json = (await res.json()) as { user?: { profile?: { display_name?: string; real_name?: string } } };
      const name = json.user?.profile?.display_name || json.user?.profile?.real_name;
      if (name) userNames.set(userId, name);
    } catch {
      // name resolution is best-effort — user id still ingests fine
    }
  };

  const connect = async (emit: (m: NormalizedMessage[]) => Promise<void>) => {
    const res = await fetch(`${options.apiBase ?? "https://slack.com"}/api/apps.connections.open`, {
      method: "POST",
      headers: { authorization: `Bearer ${options.appToken}` },
    });
    const json = (await res.json()) as { ok: boolean; url?: string };
    if (!json.ok || !json.url) throw new Error("slack socket mode: apps.connections.open failed");

    ws = new WebSocket(json.url);
    ws.onmessage = async (ev) => {
      const envelope = JSON.parse(String(ev.data)) as {
        type: string;
        envelope_id?: string;
        payload?: { event?: SlackEvent };
      };
      if (envelope.envelope_id) ws?.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
      const event = envelope.payload?.event;
      if (!event) return;
      const msg = normalizeSlackEvent(event, resolveAuthor, options);
      if (!msg) return;
      if (event.user && !userNames.has(event.user)) {
        await fetchName(event.user);
        msg.author = resolveAuthor(event.user);
      }
      await emit([msg]);
    };
    ws.onclose = () => {
      if (!stopped) setTimeout(() => void connect(emit).catch(() => {}), 2000);
    };
  };

  return {
    name: "slack",
    kind: "slack",
    async start(ctx) {
      stopped = false;
      await connect(ctx.emit);
    },
    async stop() {
      stopped = true;
      ws?.close();
    },
  };
}

/** The official Events API path — Slack POSTs signed events to a public URL
 *  you host (Slack's recommended production transport; Socket Mode's sibling).
 *  Verifies X-Slack-Signature (HMAC of `v0:ts:body`), answers the
 *  url_verification handshake, and reuses the same normalizer:
 *
 *    const hook = await cos.receive(slackEvents({ signingSecret }), { workspaceId });
 *    // serve it: POST https://your.host/slack → hook(request)            */
export function slackEvents(options: {
  /** Signing secret from the app's Basic Information page. */
  signingSecret: string;
  /** Bot token (xoxb-…) — resolves user ids to display names via users.info. */
  botToken?: string;
  /** Only ingest these channel ids; omit for all. */
  channelIds?: string[];
  /** Slack API base (tests/proxies). */
  apiBase?: string;
}): WebhookAdapter {
  const userNames = new Map<string, string>();
  const resolveAuthor = (userId: string) => userNames.get(userId) ?? userId;

  const fetchName = async (userId: string) => {
    if (!options.botToken || userNames.has(userId)) return;
    try {
      const res = await fetch(`${options.apiBase ?? "https://slack.com"}/api/users.info?user=${userId}`, {
        headers: { authorization: `Bearer ${options.botToken}` },
      });
      const json = (await res.json()) as { user?: { profile?: { display_name?: string; real_name?: string } } };
      const name = json.user?.profile?.display_name || json.user?.profile?.real_name;
      if (name) userNames.set(userId, name);
    } catch {
      // best-effort
    }
  };

  return {
    name: "slack",
    kind: "slack",
    async handle(request) {
      const body = await request.text();
      const ts = request.headers.get("x-slack-request-timestamp") ?? "";
      const signature = request.headers.get("x-slack-signature") ?? "";
      const expected = `v0=${await hmacSha256Hex(options.signingSecret, `v0:${ts}:${body}`)}`;
      if (Math.abs(Date.now() / 1000 - Number(ts)) > 300 || !safeEqual(signature, expected)) {
        throw new Response("bad signature", { status: 403 });
      }
      const payload = JSON.parse(body) as { type: string; challenge?: string; event?: SlackEvent };
      if (payload.type === "url_verification") {
        return { messages: [], response: Response.json({ challenge: payload.challenge }) };
      }
      const event = payload.event;
      const msg = event ? normalizeSlackEvent(event, resolveAuthor, options) : null;
      if (msg && event?.user && !userNames.has(event.user)) {
        await fetchName(event.user);
        msg.author = resolveAuthor(event.user);
      }
      return { messages: msg ? [msg] : [] };
    },
  };
}
