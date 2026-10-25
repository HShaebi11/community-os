import {
  assignPublicSlug,
  briefing,
  createProposalFromDemand,
  eventChainById,
  exportWorkspace,
  generateAutopilot,
  goLive,
  importWhatsApp,
  ingestDiscord,
  ingestMessages,
  makeOutreachDraft,
  memberCard,
  MemoryStore,
  openDemand,
  openProposal,
  publicCommunity,
  publicEvent,
  publicMember,
  recordEventPageView,
  refreshMemory,
  rsvp,
  setProposalStatus,
  sha256Hex,
  submitApplication,
  type Store as CoreStore,
} from "@community-os/core";
import { parseWhatsAppExport } from "@community-os/whatsapp-import";
import type {
  Application,
  AutopilotArtifact,
  BlocklistEntry,
  ChannelAdapter,
  Citation,
  Demand,
  EventRecord,
  FileRecord,
  Guest,
  Member,
  Message,
  NormalizedMessage,
  Proposal,
  Resource,
  Source,
  SourceKind,
  Sponsor,
  Store,
  TimelineEvent,
  Venue,
  WebhookAdapter,
  WebhookSubscription,
  Workspace,
} from "./types.js";

export * from "./types.js";

/** Error thrown for non-2xx responses (remote) and domain failures (local). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// --- API response shapes that aren't bare core records ---------------------

export type WorkspaceListEntry = Workspace & { role: "owner" };
export type MemberCard = Member & { citations: Citation[] };
export type DemandCard = Demand & { citations: Citation[] };
export type ProposalPack = Proposal & { speakers: Member[]; venue: Venue | null; citations: Citation[] };
export type ImportResult = { inserted: number; skipped: number; members: Member[] };
export type IngestResult = { inserted: number; skipped: number; member: Member | null };
export type MemoryResult = { members: Member[]; demands: Demand[]; resources: Resource[] };
export type Briefing = {
  people: number;
  messages: number;
  topDemands: Demand[];
  resources: Resource[];
  nextEvents: EventRecord[];
};
export type SearchHit =
  | { type: "member"; workspaceId: string; member: Member }
  | { type: "demand"; workspaceId: string; demand: Demand };
export type EventChain = { event: EventRecord; proposal: Proposal | null; demand: Demand | null; messages: Message[] };
export type PublicCommunity = {
  name: string;
  slug: string;
  joinUrl: string | null;
  qrSvg: string;
  events: Array<{ slug: string; title: string }>;
};
export type PublicEvent = {
  slug: string;
  title: string;
  explanation: string | null;
  qrSvg: string;
  startsAt: string | null;
  publishedAt: string;
  community: { name: string; slug: string };
  venue: { name: string; area: string | null } | null;
  speakers: Array<{ name: string; slug: string | null }>;
};
export type PublicMember = { name: string; slug: string; do: string | null; offer: string | null };
export type WorkspaceExport = {
  version: number;
  exportedAt: string;
  workspace: Workspace | null;
  sources: Source[];
  members: Member[];
  demands: Demand[];
  proposals: Proposal[];
  venues: Venue[];
  sponsors: Sponsor[];
  resources: Resource[];
  files: FileRecord[];
  events: EventRecord[];
  guests: Guest[];
  citations: Citation[];
  timeline: TimelineEvent[];
  applications: Application[];
  blocklist: BlocklistEntry[];
  artifacts: AutopilotArtifact[];
  webhooks: WebhookSubscription[];
  messages: Array<Omit<Message, "body" | "communityId">>;
};

/** Pluggable one-shot ingest for importChat. Two output shapes, adapter's
 *  choice:
 *  - `transcript` + `files` — a WhatsApp-format transcript; the kernel parses
 *    it (what @community-os/whatsapp-import produces — the default).
 *  - `messages` — NormalizedMessage[] you mapped yourself; goes through the
 *    same dedupe path as channels and webhooks. This is the portable shape —
 *    Slack exports, Telegram dumps, a CSV, whatever.
 *  `name`/`kind` label the source row (default: "native" + filename). */
export type IngestAdapter = {
  name?: string;
  kind?: SourceKind;
  parse(data: Uint8Array, filename: string): {
    transcript?: string;
    files?: Array<{ name: string; mime: string; bytes: Uint8Array }>;
    messages?: NormalizedMessage[];
  };
};

export type WebhookKind = "import" | "memory" | "proposal" | "published" | "rsvp" | "application";
export type WebhookPayload<T = unknown> = {
  id: string;
  kind: string;
  workspaceId: string;
  occurredAt: string;
  data: T;
};

// --- Client ----------------------------------------------------------------

export type CommunityOSOptions = {
  /** Base URL of a deployed API, e.g. "http://localhost:5173". Omit for
   *  `CommunityOS.memory()`-style local use — see the static factory. */
  baseUrl: string;
  /** Sent as X-Public-Origin — the public hostname used when building QR
   *  codes and outreach links. Set when the API sits behind a proxy. In local
   *  mode it's the origin baked into QR codes and event URLs. */
  publicOrigin?: string;
  /** Injectable fetch (tests, custom agents). Defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
};

const DEFAULT_ORIGIN = "http://localhost:5173";

/**
 * Community OS as a library.
 *
 * Remote mode — client for a deployed API:
 *   const cos = new CommunityOS({ baseUrl: "http://localhost:5173" });
 *
 * Embedded mode — the whole product runs in-process on an in-memory store
 * (great for tests, scripts, prototypes, agents):
 *   const cos = CommunityOS.memory();
 *
 * Same methods either way. Local mode is volatile and does not deliver
 * webhooks — persistence and delivery happen on the server transport.
 */
/** The no-platform-needed receiver: wrap any POSTed JSON into a
 *  WebhookAdapter with one `map` function. Omni, n8n, Zapier, a cron
 *  job, a forwarding service — if it can send JSON, it can feed a
 *  workspace:
 *    const handler = await cos.receive(jsonWebhook({ map: (p) => [...] }), { workspaceId });
 *    serve({ fetch: (req) => req.url.endsWith("/hook") ? handler(req) : cos.fetch(req) }) */
export function jsonWebhook(options: {
  name?: string;
  kind?: SourceKind;
  /** Optional gate — return false to reject the request with 403. */
  verify?: (request: Request) => boolean | Promise<boolean>;
  map(payload: unknown, request: Request): NormalizedMessage[] | Promise<NormalizedMessage[]>;
}): WebhookAdapter {
  return {
    name: options.name ?? "webhook",
    kind: options.kind ?? "native",
    async handle(request) {
      if (request.method !== "POST") throw new Response("method not allowed", { status: 405 });
      if (options.verify && !(await options.verify(request))) throw new Response("forbidden", { status: 403 });
      return { messages: await options.map(await request.json(), request) };
    },
  };
}

export class CommunityOS {
  private remote?: { base: string; origin: string | undefined; fetch: typeof globalThis.fetch };
  private local?: { store: CoreStore; origin: string };
  private handlers: Map<string, Set<{ fn: (event: TimelineEvent) => void; since: string }>>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private seenIds: Set<string>;
  private appPromise?: Promise<{ fetch(request: Request): Response | Promise<Response> }>;

  constructor(options: CommunityOSOptions) {
    this.remote = {
      base: options.baseUrl.replace(/\/+$/, ""),
      origin: options.publicOrigin,
      fetch: options.fetch ?? globalThis.fetch,
    };
    this.handlers = new Map();
    this.seenIds = new Set();
  }

  /** The whole kernel in-process on a volatile in-memory store. */
  static memory(options: { publicOrigin?: string } = {}): CommunityOS {
    return CommunityOS.store(new MemoryStore(), options);
  }

  /** The whole kernel in-process on YOUR store — any implementation of the
   *  Store contract: SQLite (@community-os/store-sqlite), Postgres
   *  (createDrizzleStore in @community-os/db), or your own. Persistence is
   *  the developer's choice; the product is the same. */
  static store(store: Store, options: { publicOrigin?: string } = {}): CommunityOS {
    const cos = Object.create(CommunityOS.prototype) as CommunityOS;
    const wrapped = new Proxy(store as CoreStore, {
      get: (target, prop, receiver) =>
        prop === "addTimeline"
          ? async (event: TimelineEvent) => {
              await store.addTimeline(event);
              cos.dispatch(event);
            }
          : Reflect.get(target, prop, receiver),
    });
    cos.local = { store: wrapped, origin: options.publicOrigin ?? DEFAULT_ORIGIN };
    cos.handlers = new Map();
    cos.seenIds = new Set();
    return cos;
  }

  /** Serve the real HTTP API (every /v1 route + /mcp) in-process on this
   *  instance's store. Requires @hono/node-server (peer dep, Node only). */
  async serve(options: { port?: number; hostname?: string } = {}): Promise<{ port: number; close: () => void }> {
    if (!this.local) throw new ApiError(500, "serve() needs an embedded instance — CommunityOS.memory() or CommunityOS.store()");
    const { serve } = await import("@hono/node-server");
    const app = await this.getApp();
    const server = serve({ fetch: app.fetch, port: options.port ?? 5173, hostname: options.hostname });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : (options.port ?? 5173);
    return { port, close: () => server.close() };
  }

  // -- plumbing ---------------------------------------------------------------

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.remote) throw new ApiError(500, "no remote transport — this instance is local");
    const { base, origin, fetch } = this.remote;
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
    if (init.body && typeof init.body === "string") headers["content-type"] ??= "application/json";
    if (origin) headers["x-public-origin"] = origin;
    const res = await fetch(`${base}${path}`, { ...init, headers });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(res.status, err?.error ?? res.statusText);
    }
    return (await res.json()) as T;
  }

  private get<T>(path: string) {
    return this.call<T>(path);
  }
  private post<T>(path: string, body?: unknown, init: RequestInit = {}) {
    return this.call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), ...init });
  }
  private patch<T>(path: string, body: unknown) {
    return this.call<T>(path, { method: "PATCH", body: JSON.stringify(body) });
  }

  /** Raw escape hatch — call any /v1 route the SDK hasn't wrapped yet.
   *  Remote mode goes over HTTP; embedded mode runs it through this.fetch()
   *  on the real app, so the contract is identical. */
  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    if (this.remote) return this.call<T>(path, init);
    const res = await this.fetch(new Request(`http://local${path}`, init));
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(res.status, err?.error ?? res.statusText);
    }
    return (await res.json()) as T;
  }

  /** The real Community OS app as a fetch handler — mount it into anything
   *  that speaks fetch: Bun.serve, Deno.serve, a Worker export, a Next.js
   *  route handler, tests. Embedded instances only; remote already has a URL. */
  fetch(request: Request): Promise<Response> {
    if (!this.local) return Promise.reject(new ApiError(500, "fetch() needs an embedded instance — remote mode already has a baseUrl"));
    return Promise.resolve(this.getApp()).then((app) => app.fetch(request));
  }

  private getApp() {
    this.appPromise ??= import("@community-os/server").then(
      (m) => m.createApp(this.local!.store) as { fetch(request: Request): Response | Promise<Response> },
    );
    return this.appPromise;
  }

  /** Continuously ingest a channel — Discord, Slack, WhatsApp, or your own
   *  adapter — into a workspace. Messages flow through the same dedupe +
   *  member-resolution path as imports; works on any store. */
  async listen(
    channel: ChannelAdapter,
    options: { workspaceId: string; sourceName?: string },
  ): Promise<{ stop: () => Promise<void> }> {
    await this.getWorkspace(options.workspaceId); // 404 early, both modes
    const emit = this.emitter(options.workspaceId, { kind: channel.kind, name: options.sourceName ?? channel.name });
    await channel.start({ emit });
    return { stop: () => channel.stop() };
  }

  /** Mount a passive platform webhook — Slack Events API, WhatsApp Cloud API,
   *  Omni, n8n, a custom poller, anything that POSTs. Returns a fetch handler
   *  you serve on any public URL: `cos.serve`, `cos.fetch`, Bun, a Worker,
   *  a Next.js route. Ingest goes through the same path as `listen` —
   *  embedded writes the store directly, remote POSTs to /v1/ingest.
   *  Ingest failures return 500 so the platform retries (dedupe makes
   *  replays safe). The workspace is validated up front, both modes. */
  async receive(
    adapter: WebhookAdapter,
    options: { workspaceId: string; sourceName?: string },
  ): Promise<(request: Request) => Promise<Response>> {
    await this.getWorkspace(options.workspaceId);
    const emit = this.emitter(options.workspaceId, { kind: adapter.kind, name: options.sourceName ?? adapter.name });
    return async (request) => {
      try {
        const { messages, response } = await adapter.handle(request);
        try {
          await emit(messages);
        } catch {
          return Response.json({ error: "ingest failed" }, { status: 500 });
        }
        return response ?? Response.json({ ok: true, ingested: messages.length });
      } catch (err) {
        if (err instanceof Response) return err;
        throw err;
      }
    };
  }

  private emitter(workspaceId: string, source: { kind: SourceKind; name: string }) {
    return async (messages: NormalizedMessage[]) => {
      if (!messages.length) return;
      if (this.local) {
        await ingestMessages(this.store, workspaceId, source, messages);
      } else {
        await this.post("/v1/ingest", { communityId: workspaceId, source, messages });
      }
    };
  }

  /** React to kernel events (import, memory, proposal, published, rsvp,
   *  page_view, application — or "*" for all). Embedded dispatches as the
   *  kernel writes the timeline; remote polls the timeline (`pollMs`,
   *  default 5s) and fires on new events only. Returns an unsubscribe fn. */
  on(kind: string, handler: (event: TimelineEvent) => void, options: { pollMs?: number } = {}): () => void {
    let set = this.handlers.get(kind);
    if (!set) {
      set = new Set();
      this.handlers.set(kind, set);
    }
    // Watermark: only events written after this subscribe fire the handler.
    set.add({ fn: handler, since: new Date().toISOString() });
    if (this.remote) this.ensurePoller(options.pollMs ?? 5000);
    return () => this.off(kind, handler);
  }

  off(kind: string, handler: (event: TimelineEvent) => void): void {
    const set = this.handlers.get(kind);
    if (set) {
      for (const entry of [...set]) if (entry.fn === handler) set.delete(entry);
      if (!set.size) this.handlers.delete(kind);
    }
    if (!this.handlers.size && this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private dispatch(event: TimelineEvent) {
    for (const kind of [event.kind, "*"]) {
      for (const entry of this.handlers.get(kind) ?? []) {
        if (event.createdAt < entry.since) continue;
        try {
          entry.fn(event);
        } catch (err) {
          console.error(JSON.stringify({ message: "event handler failed", error: String(err) }));
        }
      }
    }
  }

  private ensurePoller(pollMs: number) {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      try {
        for (const ws of await this.listWorkspaces()) {
          for (const event of await this.listTimeline(ws.id)) {
            if (this.seenIds.has(event.id)) continue;
            this.seenIds.add(event.id);
            this.dispatch(event);
          }
        }
      } catch {
        // polling is best-effort — a dead remote just means quiet handlers
      }
    }, pollMs);
    this.pollTimer.unref?.();
  }

  private get store(): CoreStore {
    if (!this.local) throw new ApiError(500, "no local store — this instance is remote");
    return this.local.store;
  }

  private need<T>(value: T | null, what: string): T {
    if (value === null || value === undefined) throw new ApiError(404, `${what} not found`);
    return value;
  }

  /** Kernel errors map to domain 400s, matching the remote API. */
  private async domainCall<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(400, err instanceof Error ? err.message : "error");
    }
  }

  private domainParse(bytes: Uint8Array, filename: string, adapter?: IngestAdapter) {
    try {
      return adapter ? adapter.parse(bytes, filename) : parseWhatsAppExport(bytes, filename);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "error");
    }
  }

  // -- Meta ----------------------------------------------------------------

  health(): Promise<{ ok: boolean; product: string }> {
    if (this.local) return Promise.resolve({ ok: true, product: "community-os" });
    return this.get("/v1/health");
  }

  // -- Workspaces ----------------------------------------------------------

  createWorkspace(input: { name: string; joinUrl?: string }): Promise<Workspace> {
    if (this.local) return this.store.createWorkspace({ ...input, createdBy: "local" });
    return this.post("/v1/workspaces", input);
  }
  listWorkspaces(): Promise<WorkspaceListEntry[]> {
    if (this.local) return this.store.listWorkspaces() as Promise<WorkspaceListEntry[]>;
    return this.get("/v1/workspaces");
  }
  async getWorkspaceBySlug(slug: string): Promise<WorkspaceListEntry> {
    if (this.local) {
      const ws = this.need(await this.store.getWorkspaceBySlug(slug), "workspace");
      return { ...ws, role: "owner" };
    }
    return this.get(`/v1/workspaces/by-slug/${encodeURIComponent(slug)}`);
  }
  async getWorkspace(id: string): Promise<Workspace> {
    if (this.local) return this.need(await this.store.getWorkspace(id), "workspace");
    return this.get(`/v1/workspaces/${id}`);
  }
  updateWorkspace(id: string, patch: { name?: string; joinUrl?: string | null }): Promise<Workspace> {
    if (this.local) return this.store.updateWorkspace(id, patch);
    return this.patch(`/v1/workspaces/${id}`, patch);
  }

  // -- Evidence ------------------------------------------------------------

  /** Import a chat export — .txt transcript (string or bytes) or .zip with
   *  media, parsed as WhatsApp format by default. Pass an `adapter` to
   *  parse anything else — adapters that produce `messages` go through
   *  ingest() (works remote too, parsed client-side); adapters that
   *  produce `transcript` use the WhatsApp kernel path. */
  async importChat(
    workspaceId: string,
    data: string | Blob | ArrayBuffer | Uint8Array,
    filename = "_chat.txt",
    adapter?: IngestAdapter,
  ): Promise<ImportResult> {
    if (!adapter && this.remote) {
      const body = data instanceof Uint8Array ? (data.slice().buffer as ArrayBuffer) : data;
      return this.call(`/v1/workspaces/${workspaceId}/imports?filename=${encodeURIComponent(filename)}`, {
        method: "POST",
        body,
      });
    }
    const bytes =
      typeof data === "string" ? new TextEncoder().encode(data)
      : data instanceof Uint8Array ? data
      : data instanceof ArrayBuffer ? new Uint8Array(data)
      : new Uint8Array(await data.arrayBuffer());
    const parsed = this.domainParse(bytes, filename, adapter);
    const source = { kind: adapter?.kind ?? ("native" as SourceKind), name: adapter?.name ?? filename };
    // Transcript wins when present — the WhatsApp parser emits internal
    // message rows alongside it that aren't NormalizedMessage-shaped.
    if (parsed.transcript) {
      if (this.local) {
        this.need(await this.store.getWorkspace(workspaceId), "workspace");
        return this.domainCall(() => importWhatsApp(
          this.store,
          workspaceId,
          parsed.transcript!,
          (parsed.files ?? []).map((f) => ({ name: f.name, storagePath: `memory://${f.name}`, mime: f.mime })),
        ));
      }
      // Remote + adapter produced a transcript — the server parses WhatsApp format.
      return this.call(`/v1/workspaces/${workspaceId}/imports?filename=${encodeURIComponent(filename)}`, {
        method: "POST",
        body: parsed.transcript,
      });
    }
    if (parsed.messages?.length) {
      return this.ingest(workspaceId, { source, messages: parsed.messages as NormalizedMessage[] });
    }
    throw new ApiError(400, "adapter produced neither messages nor transcript");
  }

  /** The bare ingest primitive — no adapter needed. Map whatever you have
   *  (a CSV, a database table, a scraped feed) to NormalizedMessage[] and
   *  push. Same dedupe + member-resolution path as channels and webhooks,
   *  on your store or over POST /v1/ingest remotely. */
  async ingest(
    workspaceId: string,
    input: { source?: { kind?: SourceKind; name?: string }; messages: NormalizedMessage[] },
  ): Promise<ImportResult> {
    const source = { kind: input.source?.kind ?? ("native" as SourceKind), name: input.source?.name ?? "sdk" };
    if (this.local) {
      this.need(await this.store.getWorkspace(workspaceId), "workspace");
      return this.domainCall(() => ingestMessages(this.store, workspaceId, source, input.messages));
    }
    return this.post("/v1/ingest", { communityId: workspaceId, source, messages: input.messages });
  }
  async ingestDiscord(message: {
    communityId: string;
    id: string;
    content: string;
    timestamp: string;
    author: { id: string; username: string };
  }): Promise<IngestResult> {
    if (this.local) {
      this.need(await this.store.getWorkspace(message.communityId), "workspace");
      return ingestDiscord(this.store, message.communityId, message);
    }
    return this.post("/v1/ingest/discord", message);
  }
  listMessages(workspaceId: string): Promise<Message[]> {
    if (this.local) return this.store.listMessages(workspaceId);
    return this.get(`/v1/workspaces/${workspaceId}/messages`);
  }
  listFiles(workspaceId: string): Promise<FileRecord[]> {
    if (this.local) return this.store.listFiles(workspaceId);
    return this.get(`/v1/workspaces/${workspaceId}/files`);
  }
  listTimeline(workspaceId: string): Promise<TimelineEvent[]> {
    if (this.local) return this.store.listTimeline(workspaceId);
    return this.get(`/v1/workspaces/${workspaceId}/timeline`);
  }
  exportWorkspace(workspaceId: string): Promise<WorkspaceExport> {
    if (this.local) return exportWorkspace(this.store, workspaceId) as Promise<WorkspaceExport>;
    return this.get(`/v1/workspaces/${workspaceId}/export`);
  }

  // -- Memory ---------------------------------------------------------------

  refreshMemory(workspaceId: string): Promise<MemoryResult> {
    if (this.local) return refreshMemory(this.store, workspaceId);
    return this.post(`/v1/workspaces/${workspaceId}/memory`);
  }
  listMembers(workspaceId: string): Promise<Member[]> {
    if (this.local) return this.store.listMembers(workspaceId);
    return this.get(`/v1/workspaces/${workspaceId}/members`);
  }
  async getMember(memberId: string): Promise<MemberCard> {
    if (this.local) {
      const member = this.need(await this.store.getMember(memberId), "member");
      return memberCard(this.store, member.id) as Promise<MemberCard>;
    }
    return this.get(`/v1/members/${memberId}`);
  }
  async updateMember(
    memberId: string,
    patch: Partial<Pick<Member, "do" | "want" | "offer" | "notes" | "displayName" | "publicOptIn" | "publicSlug">>,
  ): Promise<Member> {
    if (this.local) {
      const member = this.need(await this.store.getMember(memberId), "member");
      const updated = await this.store.updateMember(member.id, patch, true);
      if (updated.publicOptIn && !updated.publicSlug) {
        await assignPublicSlug(this.store, updated.id);
        return this.need(await this.store.getMember(updated.id), "member");
      }
      return updated;
    }
    return this.patch(`/v1/members/${memberId}`, patch);
  }
  briefing(workspaceId: string): Promise<Briefing> {
    if (this.local) return briefing(this.store, workspaceId) as Promise<Briefing>;
    return this.get(`/v1/workspaces/${workspaceId}/briefing`);
  }
  listDemands(workspaceId: string): Promise<Demand[]> {
    if (this.local) return this.store.listDemands(workspaceId);
    return this.get(`/v1/workspaces/${workspaceId}/demands`);
  }
  async getDemand(demandId: string): Promise<DemandCard> {
    if (this.local) {
      const demand = this.need(await this.store.getDemand(demandId), "demand");
      return openDemand(this.store, demand.id) as Promise<DemandCard>;
    }
    return this.get(`/v1/demands/${demandId}`);
  }
  listResources(workspaceId: string): Promise<Resource[]> {
    if (this.local) return this.store.listResources(workspaceId);
    return this.get(`/v1/workspaces/${workspaceId}/resources`);
  }
  async search(query: string): Promise<SearchHit[]> {
    const q = query.toLowerCase();
    if (this.local) {
      const hits: SearchHit[] = [];
      for (const ws of await this.store.listWorkspaces()) {
        for (const member of await this.store.listMembers(ws.id)) {
          const blob = `${member.displayName} ${member.do} ${member.want} ${member.offer}`.toLowerCase();
          if (blob.includes(q)) hits.push({ type: "member", workspaceId: ws.id, member });
        }
        for (const demand of await this.store.listDemands(ws.id)) {
          if (demand.topic.toLowerCase().includes(q)) hits.push({ type: "demand", workspaceId: ws.id, demand });
        }
      }
      return hits;
    }
    return this.get(`/v1/search?q=${encodeURIComponent(query)}`);
  }

  // -- Venues & sponsors ----------------------------------------------------

  createVenue(
    workspaceId: string,
    venue: { name: string; area?: string; capacity?: number; contact?: string },
  ): Promise<Venue> {
    if (this.local) {
      return this.store.upsertVenue({
        id: crypto.randomUUID(),
        communityId: workspaceId,
        name: venue.name,
        area: venue.area ?? null,
        capacity: venue.capacity ?? null,
        contact: venue.contact ?? null,
      });
    }
    return this.post(`/v1/workspaces/${workspaceId}/venues`, venue);
  }
  listVenues(workspaceId: string): Promise<Venue[]> {
    if (this.local) return this.store.listVenues(workspaceId);
    return this.get(`/v1/workspaces/${workspaceId}/venues`);
  }
  createSponsor(workspaceId: string, sponsor: { name: string; notes?: string }): Promise<Sponsor> {
    if (this.local) {
      return this.store.upsertSponsor({
        id: crypto.randomUUID(),
        communityId: workspaceId,
        name: sponsor.name,
        notes: sponsor.notes ?? null,
      });
    }
    return this.post(`/v1/workspaces/${workspaceId}/sponsors`, sponsor);
  }
  listSponsors(workspaceId: string): Promise<Sponsor[]> {
    if (this.local) return this.store.listSponsors(workspaceId);
    return this.get(`/v1/workspaces/${workspaceId}/sponsors`);
  }

  // -- Proposals → events ----------------------------------------------------

  async createProposal(workspaceId: string, demandId: string): Promise<ProposalPack> {
    if (this.local) {
      this.need(await this.store.getWorkspace(workspaceId), "workspace");
      return this.domainCall(() => createProposalFromDemand(this.store, workspaceId, demandId)) as Promise<ProposalPack>;
    }
    return this.post(`/v1/workspaces/${workspaceId}/proposals`, { demandId });
  }
  listProposals(workspaceId: string): Promise<Proposal[]> {
    if (this.local) return this.store.listProposals(workspaceId);
    return this.get(`/v1/workspaces/${workspaceId}/proposals`);
  }
  async getProposal(proposalId: string): Promise<ProposalPack> {
    if (this.local) {
      const proposal = this.need(await this.store.getProposal(proposalId), "proposal");
      return openProposal(this.store, proposal.id) as Promise<ProposalPack>;
    }
    return this.get(`/v1/proposals/${proposalId}`);
  }
  async approveProposal(proposalId: string): Promise<ProposalPack> {
    if (this.local) {
      const proposal = this.need(await this.store.getProposal(proposalId), "proposal");
      return this.domainCall(() => setProposalStatus(this.store, proposal.id, "approved")) as Promise<ProposalPack>;
    }
    return this.post(`/v1/proposals/${proposalId}/approve`);
  }
  /** Returns the outreach draft. Drafts only — nothing is ever sent. */
  async draftOutreach(proposalId: string): Promise<ProposalPack> {
    if (this.local) {
      const proposal = this.need(await this.store.getProposal(proposalId), "proposal");
      const workspace = await this.store.getWorkspace(proposal.communityId);
      return makeOutreachDraft(this.store, proposal.id, workspace?.name ?? "Community") as Promise<ProposalPack>;
    }
    return this.post(`/v1/proposals/${proposalId}/outreach`);
  }
  async goLive(proposalId: string): Promise<EventRecord> {
    if (this.local) {
      const proposal = this.need(await this.store.getProposal(proposalId), "proposal");
      return this.domainCall(() => goLive(this.store, proposal.id, this.local!.origin));
    }
    return this.post(`/v1/proposals/${proposalId}/go-live`);
  }
  listEvents(workspaceId: string): Promise<EventRecord[]> {
    if (this.local) return this.store.listEvents(workspaceId);
    return this.get(`/v1/workspaces/${workspaceId}/events`);
  }
  /** Full provenance chain including raw chat messages — operator surface. */
  async getEventChain(eventId: string): Promise<EventChain> {
    if (this.local) {
      const event = this.need(await this.store.getEvent(eventId), "event");
      return eventChainById(this.store, event.id) as Promise<EventChain>;
    }
    return this.get(`/v1/events/${eventId}/chain`);
  }
  async listGuests(eventId: string): Promise<Guest[]> {
    if (this.local) {
      const event = this.need(await this.store.getEvent(eventId), "event");
      return this.store.listGuests(event.id);
    }
    return this.get(`/v1/events/${eventId}/guests`);
  }
  async autopilot(eventId: string): Promise<AutopilotArtifact[]> {
    if (this.local) {
      const event = this.need(await this.store.getEvent(eventId), "event");
      return generateAutopilot(this.store, event.id, this.local.origin);
    }
    return this.post(`/v1/events/${eventId}/autopilot`);
  }

  // -- Public front door -----------------------------------------------------

  publicCommunity(slug: string): Promise<PublicCommunity> {
    if (this.local) return this.publicOr404(() => publicCommunity(this.store, slug, this.local!.origin));
    return this.get(`/v1/public/communities/${encodeURIComponent(slug)}`);
  }
  async publicEvent(slug: string): Promise<PublicEvent> {
    if (this.local) {
      const event = await this.publicOr404(() => publicEvent(this.store, slug));
      await recordEventPageView(this.store, event.slug);
      return event;
    }
    return this.get(`/v1/public/events/${encodeURIComponent(slug)}`);
  }
  rsvp(slug: string, guest: { name: string; email: string }): Promise<Guest> {
    if (this.local) return this.domainCall(() => rsvp(this.store, slug, guest));
    return this.post(`/v1/public/events/${encodeURIComponent(slug)}/rsvp`, guest);
  }
  publicMember(slug: string): Promise<PublicMember> {
    if (this.local) return this.publicOr404(() => publicMember(this.store, slug) as Promise<PublicMember>);
    return this.get(`/v1/public/members/${encodeURIComponent(slug)}`);
  }

  private async publicOr404<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw new ApiError(404, err instanceof Error ? err.message : "not found");
    }
  }

  // -- Gatekeeper ------------------------------------------------------------

  async submitApplication(
    workspaceId: string,
    application: { applicant: string; answers: string },
  ): Promise<Application> {
    if (this.local) {
      const workspace = this.need(await this.store.getWorkspace(workspaceId), "workspace");
      return submitApplication(this.store, workspaceId, { ...application, communityName: workspace.name });
    }
    return this.post(`/v1/workspaces/${workspaceId}/applications`, application);
  }
  listApplications(workspaceId: string): Promise<Application[]> {
    if (this.local) return this.store.listApplications(workspaceId);
    return this.get(`/v1/workspaces/${workspaceId}/applications`);
  }
  async addBlocklist(
    workspaceId: string,
    entry: { applicant: string; evidence: string; confirmed?: boolean },
  ): Promise<BlocklistEntry> {
    if (this.local) {
      this.need(await this.store.getWorkspace(workspaceId), "workspace");
      const hash = await sha256Hex(entry.applicant.trim().toLowerCase());
      return this.store.addBlocklist({
        id: crypto.randomUUID(),
        communityId: workspaceId,
        hash,
        evidence: entry.evidence,
        reporter: "local",
        confirmed: entry.confirmed ?? false,
      });
    }
    return this.post(`/v1/workspaces/${workspaceId}/blocklist`, entry);
  }

  // -- Webhooks ---------------------------------------------------------------

  /** Creates a subscription. The `secret` is returned once, here, and is
   *  omitted by `listWebhooks` — store it to verify signatures. Empty `kinds`
   *  means all event kinds. Local mode registers subscriptions but does not
   *  deliver — delivery is a server concern. */
  async createWebhook(workspaceId: string, input: { url: string; kinds?: WebhookKind[] }): Promise<WebhookSubscription> {
    if (this.local) {
      this.need(await this.store.getWorkspace(workspaceId), "workspace");
      const url = new URL(input.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new ApiError(400, "url must be http or https");
      return this.store.createWebhookSubscription({
        communityId: workspaceId,
        url: url.toString(),
        secret: `whsec_${[...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("")}`,
        kinds: input.kinds ?? [],
      });
    }
    return this.post(`/v1/workspaces/${workspaceId}/webhooks`, input);
  }
  async listWebhooks(workspaceId: string): Promise<Array<Omit<WebhookSubscription, "secret">>> {
    if (this.local) {
      const subs = await this.store.listWebhookSubscriptions(workspaceId);
      return subs.map(({ secret: _secret, ...rest }) => rest);
    }
    return this.get(`/v1/workspaces/${workspaceId}/webhooks`);
  }
  async deleteWebhook(id: string): Promise<{ ok: boolean }> {
    if (this.local) {
      if (!(await this.store.deleteWebhookSubscription(id))) throw new ApiError(404, "webhook not found");
      return { ok: true };
    }
    return this.call(`/v1/webhooks/${id}`, { method: "DELETE" });
  }
}

// --- Webhook verification ---------------------------------------------------

/** Verify the `X-CommunityOS-Signature` header of a webhook delivery.
 *  Pass the raw request body and the `whsec_` secret returned at
 *  subscription creation. Works in Node (>=20), Workers, Deno, browsers. */
export async function verifyWebhookSignature(
  body: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
  if (!match) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const computed = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expected = match[1]!.toLowerCase();
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
