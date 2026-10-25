import type { ChannelAdapter, NormalizedMessage } from "@community-os/sdk";

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
