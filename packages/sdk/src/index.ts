import type {
  Application,
  AutopilotArtifact,
  BlocklistEntry,
  Citation,
  Demand,
  EventRecord,
  FileRecord,
  Guest,
  Member,
  Message,
  Proposal,
  Resource,
  Source,
  Sponsor,
  TimelineEvent,
  Venue,
  WebhookSubscription,
  Workspace,
} from "@community-os/core";

export * from "@community-os/core";

/** Error thrown for non-2xx responses. `status` mirrors the HTTP status. */
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
  messages: Array<Omit<Message, "body" | "communityId">>;
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
  /** Base URL of the API, e.g. "http://localhost:5173" or your deployment origin. */
  baseUrl: string;
  /** Sent as X-Public-Origin — the public hostname used when the API builds
   *  QR codes and outreach links. Set when the API sits behind a proxy. */
  publicOrigin?: string;
  /** Injectable fetch (tests, custom agents). Defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
};

export class CommunityOS {
  private base: string;
  private origin: string | undefined;
  private http: typeof globalThis.fetch;

  constructor(options: CommunityOSOptions) {
    this.base = options.baseUrl.replace(/\/+$/, "");
    this.origin = options.publicOrigin;
    this.http = options.fetch ?? globalThis.fetch;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
    if (init.body && typeof init.body === "string") headers["content-type"] ??= "application/json";
    if (this.origin) headers["x-public-origin"] = this.origin;
    const res = await this.http(`${this.base}${path}`, { ...init, headers });
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

  // -- Meta ----------------------------------------------------------------

  health() {
    return this.get<{ ok: boolean; product: string }>("/v1/health");
  }

  // -- Workspaces ----------------------------------------------------------

  createWorkspace(input: { name: string; joinUrl?: string }) {
    return this.post<Workspace>("/v1/workspaces", input);
  }
  listWorkspaces() {
    return this.get<WorkspaceListEntry[]>("/v1/workspaces");
  }
  getWorkspaceBySlug(slug: string) {
    return this.get<WorkspaceListEntry>(`/v1/workspaces/by-slug/${encodeURIComponent(slug)}`);
  }
  getWorkspace(id: string) {
    return this.get<Workspace>(`/v1/workspaces/${id}`);
  }
  updateWorkspace(id: string, patch: { name?: string; joinUrl?: string | null }) {
    return this.patch<Workspace>(`/v1/workspaces/${id}`, patch);
  }

  // -- Evidence ------------------------------------------------------------

  /** Import a WhatsApp export — raw .txt transcript or .zip with media. */
  importChat(workspaceId: string, data: Blob | ArrayBuffer | Uint8Array, filename = "_chat.txt") {
    const body = data instanceof Uint8Array && !(data instanceof Blob) ? data.slice().buffer : data;
    return this.call<ImportResult>(`/v1/workspaces/${workspaceId}/imports?filename=${encodeURIComponent(filename)}`, {
      method: "POST",
      body: body as BodyInit,
    });
  }
  ingestDiscord(message: {
    communityId: string;
    id: string;
    content: string;
    timestamp: string;
    author: { id: string; username: string };
  }) {
    return this.post<IngestResult>("/v1/ingest/discord", message);
  }
  listMessages(workspaceId: string) {
    return this.get<Message[]>(`/v1/workspaces/${workspaceId}/messages`);
  }
  listFiles(workspaceId: string) {
    return this.get<FileRecord[]>(`/v1/workspaces/${workspaceId}/files`);
  }
  listTimeline(workspaceId: string) {
    return this.get<TimelineEvent[]>(`/v1/workspaces/${workspaceId}/timeline`);
  }
  exportWorkspace(workspaceId: string) {
    return this.get<WorkspaceExport>(`/v1/workspaces/${workspaceId}/export`);
  }

  // -- Memory ---------------------------------------------------------------

  refreshMemory(workspaceId: string) {
    return this.post<MemoryResult>(`/v1/workspaces/${workspaceId}/memory`);
  }
  listMembers(workspaceId: string) {
    return this.get<Member[]>(`/v1/workspaces/${workspaceId}/members`);
  }
  getMember(memberId: string) {
    return this.get<MemberCard>(`/v1/members/${memberId}`);
  }
  updateMember(
    memberId: string,
    patch: Partial<Pick<Member, "do" | "want" | "offer" | "notes" | "displayName" | "publicOptIn" | "publicSlug">>,
  ) {
    return this.patch<Member>(`/v1/members/${memberId}`, patch);
  }
  briefing(workspaceId: string) {
    return this.get<Briefing>(`/v1/workspaces/${workspaceId}/briefing`);
  }
  listDemands(workspaceId: string) {
    return this.get<Demand[]>(`/v1/workspaces/${workspaceId}/demands`);
  }
  getDemand(demandId: string) {
    return this.get<DemandCard>(`/v1/demands/${demandId}`);
  }
  listResources(workspaceId: string) {
    return this.get<Resource[]>(`/v1/workspaces/${workspaceId}/resources`);
  }
  search(query: string) {
    return this.get<SearchHit[]>(`/v1/search?q=${encodeURIComponent(query)}`);
  }

  // -- Venues & sponsors ----------------------------------------------------

  createVenue(workspaceId: string, venue: { name: string; area?: string; capacity?: number; contact?: string }) {
    return this.post<Venue>(`/v1/workspaces/${workspaceId}/venues`, venue);
  }
  listVenues(workspaceId: string) {
    return this.get<Venue[]>(`/v1/workspaces/${workspaceId}/venues`);
  }
  createSponsor(workspaceId: string, sponsor: { name: string; notes?: string }) {
    return this.post<Sponsor>(`/v1/workspaces/${workspaceId}/sponsors`, sponsor);
  }
  listSponsors(workspaceId: string) {
    return this.get<Sponsor[]>(`/v1/workspaces/${workspaceId}/sponsors`);
  }

  // -- Proposals → events ----------------------------------------------------

  createProposal(workspaceId: string, demandId: string) {
    return this.post<ProposalPack>(`/v1/workspaces/${workspaceId}/proposals`, { demandId });
  }
  listProposals(workspaceId: string) {
    return this.get<Proposal[]>(`/v1/workspaces/${workspaceId}/proposals`);
  }
  getProposal(proposalId: string) {
    return this.get<ProposalPack>(`/v1/proposals/${proposalId}`);
  }
  approveProposal(proposalId: string) {
    return this.post<ProposalPack>(`/v1/proposals/${proposalId}/approve`);
  }
  /** Returns the outreach draft. Drafts only — nothing is ever sent. */
  draftOutreach(proposalId: string) {
    return this.post<ProposalPack>(`/v1/proposals/${proposalId}/outreach`);
  }
  goLive(proposalId: string) {
    return this.post<EventRecord>(`/v1/proposals/${proposalId}/go-live`);
  }
  listEvents(workspaceId: string) {
    return this.get<EventRecord[]>(`/v1/workspaces/${workspaceId}/events`);
  }
  /** Full provenance chain including raw chat messages — operator surface. */
  getEventChain(eventId: string) {
    return this.get<EventChain>(`/v1/events/${eventId}/chain`);
  }
  listGuests(eventId: string) {
    return this.get<Guest[]>(`/v1/events/${eventId}/guests`);
  }
  autopilot(eventId: string) {
    return this.post<AutopilotArtifact[]>(`/v1/events/${eventId}/autopilot`);
  }

  // -- Public front door -----------------------------------------------------

  publicCommunity(slug: string) {
    return this.get<PublicCommunity>(`/v1/public/communities/${encodeURIComponent(slug)}`);
  }
  publicEvent(slug: string) {
    return this.get<PublicEvent>(`/v1/public/events/${encodeURIComponent(slug)}`);
  }
  rsvp(slug: string, guest: { name: string; email: string }) {
    return this.post<Guest>(`/v1/public/events/${encodeURIComponent(slug)}/rsvp`, guest);
  }
  publicMember(slug: string) {
    return this.get<PublicMember>(`/v1/public/members/${encodeURIComponent(slug)}`);
  }

  // -- Gatekeeper ------------------------------------------------------------

  submitApplication(workspaceId: string, application: { applicant: string; answers: string }) {
    return this.post<Application>(`/v1/workspaces/${workspaceId}/applications`, application);
  }
  listApplications(workspaceId: string) {
    return this.get<Application[]>(`/v1/workspaces/${workspaceId}/applications`);
  }
  addBlocklist(workspaceId: string, entry: { applicant: string; evidence: string; confirmed?: boolean }) {
    return this.post<BlocklistEntry>(`/v1/workspaces/${workspaceId}/blocklist`, entry);
  }

  // -- Webhooks ---------------------------------------------------------------

  /** Creates a subscription. The `secret` is returned once, here, and is
   *  omitted by `listWebhooks` — store it to verify signatures. Empty `kinds`
   *  means all event kinds. */
  createWebhook(workspaceId: string, input: { url: string; kinds?: WebhookKind[] }) {
    return this.post<WebhookSubscription>(`/v1/workspaces/${workspaceId}/webhooks`, input);
  }
  listWebhooks(workspaceId: string) {
    return this.get<Array<Omit<WebhookSubscription, "secret">>>(`/v1/workspaces/${workspaceId}/webhooks`);
  }
  deleteWebhook(id: string) {
    return this.call<{ ok: boolean }>(`/v1/webhooks/${id}`, { method: "DELETE" });
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
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const computed = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return computed === match[1]!.toLowerCase();
}
