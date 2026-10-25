import type { ChannelAdapter, NormalizedMessage } from "@community-os/sdk";

// Discord Gateway opcodes we use.
const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_RESUME = 6;
const OP_RECONNECT = 7;
const OP_INVALID_SESSION = 9;
const OP_HELLO = 10;
const OP_HEARTBEAT_ACK = 11;

const INTENTS = 512 | 32768; // GUILD_MESSAGES | MESSAGE_CONTENT (privileged — enable in the dev portal)

export type DiscordChannelOptions = {
  /** Bot token (Bot … is not needed — pass the raw token). */
  token: string;
  /** Only ingest these channel ids; omit for all channels the bot can see. */
  channelIds?: string[];
  /** Only ingest these guild ids; omit for all guilds. */
  guildIds?: string[];
  /** Gateway URL override (tests, proxies). */
  gatewayUrl?: string;
};

/** A Discord MESSAGE_CREATE payload → platform-neutral message, or null for
 *  messages we shouldn't ingest (bots, empty content, filtered channels). */
export function normalizeDiscordMessage(
  d: Record<string, any>,
  filter?: { channelIds?: string[]; guildIds?: string[] },
): NormalizedMessage | null {
  if (d?.author?.bot) return null;
  if (filter?.channelIds?.length && !filter.channelIds.includes(d.channel_id)) return null;
  if (filter?.guildIds?.length && !filter.guildIds.includes(d.guild_id)) return null;
  const body = (d.content ?? "").trim();
  if (!body) return null;
  return {
    id: String(d.id),
    author: d.author?.global_name || d.author?.username || "unknown",
    body,
    sentAt: d.timestamp ?? new Date().toISOString(),
  };
}

/** Live Discord ingestion over the Gateway WebSocket — no discord.js.
 *  const handle = await cos.listen(discordChannel({ token }), { workspaceId }); */
export function discordChannel(options: DiscordChannelOptions): ChannelAdapter {
  let ws: WebSocket | null = null;
  let stopped = false;
  let seq: number | null = null;
  let sessionId: string | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const gateway = options.gatewayUrl ?? "wss://gateway.discord.gg/?v=10&encoding=json";

  const connect = (emit: (m: NormalizedMessage[]) => Promise<void>) => {
    ws = new WebSocket(sessionId ? `${gateway}&resume=1` : gateway);
    ws.onmessage = async (ev) => {
      const packet = JSON.parse(String(ev.data)) as { op: number; d: any; s: number | null; t: string | null };
      if (packet.s !== null) seq = packet.s;
      switch (packet.op) {
        case OP_HELLO:
          heartbeat = setInterval(() => {
            ws?.send(JSON.stringify({ op: OP_HEARTBEAT, d: seq }));
          }, packet.d.heartbeat_interval);
          if (sessionId) {
            ws!.send(JSON.stringify({ op: OP_RESUME, d: { token: options.token, session_id: sessionId, seq } }));
          } else {
            ws!.send(
              JSON.stringify({
                op: OP_IDENTIFY,
                d: {
                  token: options.token,
                  intents: INTENTS,
                  properties: { os: "community-os", browser: "community-os", device: "community-os" },
                },
              }),
            );
          }
          break;
        case OP_DISPATCH:
          if (packet.t === "READY") sessionId = packet.d.session_id;
          if (packet.t === "RESUMED") break;
          if (packet.t === "MESSAGE_CREATE") {
            const msg = normalizeDiscordMessage(packet.d, options);
            if (msg) await emit([msg]);
          }
          break;
        case OP_INVALID_SESSION:
          sessionId = null;
          seq = null;
          ws?.close();
          break;
        case OP_RECONNECT:
          ws?.close();
          break;
        case OP_HEARTBEAT_ACK:
          break;
        default:
          break;
      }
    };
    ws.onclose = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      if (!stopped) setTimeout(() => connect(emit), 2000); // resume next connect
    };
  };

  return {
    name: "discord",
    kind: "discord",
    async start(ctx) {
      stopped = false;
      connect(ctx.emit);
    },
    async stop() {
      stopped = true;
      if (heartbeat) clearInterval(heartbeat);
      ws?.close();
    },
  };
}
