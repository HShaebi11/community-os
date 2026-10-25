import { createRequire } from "node:module";

// node:sqlite via createRequire — bundlers that predate the builtin
// (esbuild <0.26) rewrite `from "node:sqlite"` to bare "sqlite" and break
// the published dist. createRequire is in every builtin table, so the
// specifier reaches the runtime untouched.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSync>;
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
  Source,
  Sponsor,
  Store,
  TimelineEvent,
  Venue,
  WebhookSubscription,
  Workspace,
} from "@community-os/sdk";

// Self-contained helpers (same implementations as @community-os/core/ids.ts —
// inlined so this package publishes dependency-free against the sdk contract).
function createId(): string {
  return crypto.randomUUID();
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
  return slug || "community";
}

const LEAD_LOCKABLE_FIELDS: Set<string> = new Set(["do", "want", "offer", "notes", "displayName"]);
const EDITABLE_MEMBER_FIELDS: Set<string> = new Set([...LEAD_LOCKABLE_FIELDS, "publicOptIn", "publicSlug"]);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, joinUrl TEXT, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);
CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sources_ws ON sources(communityId);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, sourceId TEXT NOT NULL, sourceMessageId TEXT NOT NULL, authorRaw TEXT NOT NULL, memberId TEXT, body TEXT NOT NULL, sentAt TEXT NOT NULL, isNoise INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_messages_ws ON messages(communityId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedup_v2 ON messages(communityId, sourceId, sourceMessageId);
DROP INDEX IF EXISTS idx_messages_dedup;
CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, messageId TEXT, name TEXT NOT NULL, storagePath TEXT NOT NULL, mime TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_files_ws ON files(communityId);
CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, displayName TEXT NOT NULL, aliases TEXT NOT NULL, "do" TEXT, want TEXT, offer TEXT, notes TEXT, publicOptIn INTEGER NOT NULL, publicSlug TEXT, lastActive TEXT, leadLockedFields TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_members_ws ON members(communityId);
CREATE TABLE IF NOT EXISTS citations (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, objectType TEXT NOT NULL, objectId TEXT NOT NULL, messageId TEXT NOT NULL, quote TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_citations_ws ON citations(communityId);
CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, messageId TEXT);
CREATE INDEX IF NOT EXISTS idx_resources_ws ON resources(communityId);
CREATE TABLE IF NOT EXISTS demands (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, topic TEXT NOT NULL, title TEXT, oneLiner TEXT, memberIds TEXT NOT NULL, messageIds TEXT NOT NULL, updatedAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_demands_ws ON demands(communityId);
CREATE TABLE IF NOT EXISTS venues (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, name TEXT NOT NULL, area TEXT, capacity INTEGER, contact TEXT);
CREATE INDEX IF NOT EXISTS idx_venues_ws ON venues(communityId);
CREATE TABLE IF NOT EXISTS sponsors (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, name TEXT NOT NULL, notes TEXT);
CREATE INDEX IF NOT EXISTS idx_sponsors_ws ON sponsors(communityId);
CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, demandId TEXT NOT NULL, venueId TEXT, speakerIds TEXT NOT NULL, status TEXT NOT NULL, explanation TEXT, outreachDraft TEXT);
CREATE INDEX IF NOT EXISTS idx_proposals_ws ON proposals(communityId);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, proposalId TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, startsAt TEXT, qrSvg TEXT NOT NULL, publishedAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_events_ws ON events(communityId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE TABLE IF NOT EXISTS guests (id TEXT PRIMARY KEY, eventId TEXT NOT NULL, communityId TEXT NOT NULL, memberId TEXT, name TEXT NOT NULL, email TEXT NOT NULL, source TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_guests_event ON guests(eventId);
CREATE TABLE IF NOT EXISTS timeline (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_timeline_ws ON timeline(communityId);
CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, applicant TEXT NOT NULL, answers TEXT NOT NULL, score INTEGER NOT NULL, decision TEXT NOT NULL, reason TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_applications_ws ON applications(communityId);
CREATE TABLE IF NOT EXISTS blocklist (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, hash TEXT NOT NULL, evidence TEXT NOT NULL, reporter TEXT NOT NULL, confirmed INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_blocklist_ws ON blocklist(communityId);
CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, eventId TEXT NOT NULL, communityId TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_artifacts_event ON artifacts(eventId);
CREATE TABLE IF NOT EXISTS webhookSubscriptions (id TEXT PRIMARY KEY, communityId TEXT NOT NULL, url TEXT NOT NULL, secret TEXT NOT NULL, kinds TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_webhooks_ws ON webhookSubscriptions(communityId);
`;

// Columns that are stored as JSON text / integer booleans. Everything else is
// a plain string/number/null column.
const JSON_COLS: Record<string, string[]> = {
  members: ["aliases", "leadLockedFields"],
  demands: ["memberIds", "messageIds"],
  proposals: ["speakerIds"],
  timeline: ["payload"],
  webhookSubscriptions: ["kinds"],
};
const BOOL_COLS: Record<string, string[]> = {
  messages: ["isNoise"],
  members: ["publicOptIn"],
  blocklist: ["confirmed"],
};

type Row = Record<string, unknown>;

function encode(table: string, obj: Record<string, unknown>): Record<string, string | number | null> {
  const json = new Set(JSON_COLS[table] ?? []);
  const bool = new Set(BOOL_COLS[table] ?? []);
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (json.has(k)) out[k] = JSON.stringify(v ?? (k === "payload" ? {} : []));
    else if (bool.has(k)) out[k] = v ? 1 : 0;
    else out[k] = (v ?? null) as string | number | null;
  }
  return out;
}

function decode<T>(table: string, row: Row): T {
  const json = new Set(JSON_COLS[table] ?? []);
  const bool = new Set(BOOL_COLS[table] ?? []);
  const out: Row = { ...row };
  for (const k of json) out[k] = JSON.parse(row[k] as string);
  for (const k of bool) out[k] = !!row[k];
  return out as T;
}

/** Store backed by SQLite via node:sqlite (Node 22.5+). Durable embedded
 *  storage with zero services — pass ":memory:" for a scratch store or a file
 *  path for persistence. Implements the same contract as MemoryStore. */
export class SqliteStore implements Store {
  private db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  private ins(table: string, obj: Record<string, unknown>) {
    const e = encode(table, obj);
    const cols = Object.keys(e);
    this.db
      .prepare(`INSERT OR REPLACE INTO ${table} (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
      .run(...cols.map((c) => e[c]!));
  }

  private all<T>(table: string, where = "", args: (string | number)[] = [], order = ""): T[] {
    const sql = `SELECT * FROM ${table} ${where ? `WHERE ${where}` : ""} ${order ? `ORDER BY ${order}` : ""}`;
    return (this.db.prepare(sql).all(...args) as Row[]).map((r) => decode<T>(table, r));
  }

  private one<T>(table: string, where: string, args: (string | number)[] = []): T | null {
    const rows = this.all<T>(table, where, args);
    return rows[0] ?? null;
  }

  private upd(table: string, id: string, patch: Record<string, unknown>) {
    const e = encode(table, patch);
    const cols = Object.keys(e).filter((c) => patch[c] !== undefined);
    if (!cols.length) return;
    this.db
      .prepare(`UPDATE ${table} SET ${cols.map((c) => `"${c}" = ?`).join(", ")} WHERE id = ?`)
      .run(...cols.map((c) => e[c]!), id);
  }

  close() {
    this.db.close();
  }

  async createWorkspace(input: { name: string; createdBy: string; joinUrl?: string }): Promise<Workspace> {
    let slug = slugify(input.name);
    if (this.one("workspaces", "slug = ?", [slug])) slug = `${slug}-${createId().slice(0, 6)}`;
    const workspace: Workspace = {
      id: createId(),
      name: input.name,
      slug,
      joinUrl: input.joinUrl ?? null,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    this.ins("workspaces", { ...workspace });
    return workspace;
  }

  async getWorkspace(id: string) {
    return this.one<Workspace>("workspaces", "id = ?", [id]);
  }

  async getWorkspaceBySlug(slug: string) {
    return this.one<Workspace>("workspaces", "slug = ?", [slug]);
  }

  async updateWorkspace(id: string, patch: { name?: string; joinUrl?: string | null }) {
    const workspace = await this.getWorkspace(id);
    if (!workspace) throw new Error("workspace not found");
    this.upd("workspaces", id, patch);
    return (await this.getWorkspace(id))!;
  }

  async listWorkspaces() {
    return this.all<Workspace>("workspaces").map((w) => ({ ...w, role: "owner" as const }));
  }

  async createSource(input: { communityId: string; kind: Source["kind"]; name: string }) {
    const source: Source = { id: createId(), ...input };
    this.ins("sources", { ...source });
    return source;
  }

  async listSources(communityId: string) {
    return this.all<Source>("sources", "communityId = ?", [communityId]);
  }

  async insertMessages(messages: Message[]) {
    let inserted = 0;
    let skipped = 0;
    for (const message of messages) {
      if (
        this.one("messages", "communityId = ? AND sourceId = ? AND sourceMessageId = ?", [
          message.communityId,
          message.sourceId,
          message.sourceMessageId,
        ])
      ) {
        skipped++;
        continue;
      }
      this.ins("messages", { ...message });
      inserted++;
    }
    return { inserted, skipped };
  }

  async listMessages(communityId: string) {
    return this.all<Message>("messages", "communityId = ?", [communityId], "sentAt");
  }

  async getMessage(id: string) {
    return this.one<Message>("messages", "id = ?", [id]);
  }

  async insertFiles(files: FileRecord[]) {
    for (const file of files) this.ins("files", { ...file });
  }

  async listFiles(communityId: string) {
    return this.all<FileRecord>("files", "communityId = ?", [communityId]);
  }

  async upsertMember(communityId: string, displayName: string, lastActive: string | null) {
    displayName = displayName.trim();
    const existing = this.one<Member>(
      "members",
      `communityId = ? AND EXISTS (SELECT 1 FROM json_each(members.aliases) WHERE lower(trim(value)) = lower(?))`,
      [communityId, displayName],
    );
    if (existing) {
      if (lastActive && (!existing.lastActive || lastActive > existing.lastActive)) {
        this.upd("members", existing.id, { lastActive });
        existing.lastActive = lastActive;
      }
      return existing;
    }
    const member: Member = {
      id: createId(),
      communityId,
      displayName,
      aliases: [displayName],
      do: null,
      want: null,
      offer: null,
      notes: null,
      publicOptIn: false,
      publicSlug: null,
      lastActive,
      leadLockedFields: [],
    };
    this.ins("members", { ...member });
    return member;
  }

  async listMembers(communityId: string) {
    return this.all<Member>("members", "communityId = ?", [communityId]);
  }

  async getMember(id: string) {
    return this.one<Member>("members", "id = ?", [id]);
  }

  async getMemberBySlug(communityId: string, slug: string) {
    return this.one<Member>("members", "communityId = ? AND publicSlug = ?", [communityId, slug]);
  }

  async getMemberByPublicSlug(slug: string) {
    return this.one<Member>("members", "publicSlug = ? AND publicOptIn = 1", [slug]);
  }

  async updateMember(id: string, patch: Parameters<Store["updateMember"]>[1], byLead: boolean) {
    const member = await this.getMember(id);
    if (!member) throw new Error("member not found");
    const applied: Record<string, unknown> = {};
    const locked = [...member.leadLockedFields];
    for (const key of Object.keys(patch)) {
      if (!EDITABLE_MEMBER_FIELDS.has(key)) continue;
      const value = (patch as Record<string, unknown>)[key];
      if (value === undefined) continue;
      if (LEAD_LOCKABLE_FIELDS.has(key)) {
        const lockable = key as Member["leadLockedFields"][number];
        if (!byLead && locked.includes(lockable)) continue;
        if (byLead && !locked.includes(lockable)) locked.push(lockable);
      }
      applied[key] = value;
    }
    this.upd("members", id, { ...applied, leadLockedFields: locked });
    return (await this.getMember(id))!;
  }

  async insertCitations(citations: Citation[]) {
    for (const citation of citations) this.ins("citations", { ...citation });
  }

  async listCitations(communityId: string, objectType?: string, objectId?: string) {
    const where = ["communityId = ?"];
    const args: string[] = [communityId];
    if (objectType) {
      where.push("objectType = ?");
      args.push(objectType);
    }
    if (objectId) {
      where.push("objectId = ?");
      args.push(objectId);
    }
    return this.all<Citation>("citations", where.join(" AND "), args);
  }

  async upsertResource(resource: Resource) {
    const existing = this.one<Resource>("resources", "communityId = ? AND url = ?", [resource.communityId, resource.url]);
    if (existing) return existing;
    this.ins("resources", { ...resource });
    return resource;
  }

  async listResources(communityId: string) {
    return this.all<Resource>("resources", "communityId = ?", [communityId]);
  }

  async upsertDemand(demand: Demand) {
    const existing = this.one<Demand>("demands", "communityId = ? AND topic = ?", [demand.communityId, demand.topic]);
    if (existing) {
      this.upd("demands", existing.id, {
        memberIds: [...new Set([...existing.memberIds, ...demand.memberIds])],
        messageIds: [...new Set([...existing.messageIds, ...demand.messageIds])],
        updatedAt: demand.updatedAt,
        title: demand.title ?? existing.title,
        oneLiner: demand.oneLiner ?? existing.oneLiner,
      });
      return (await this.getDemand(existing.id))!;
    }
    this.ins("demands", { ...demand });
    return demand;
  }

  async listDemands(communityId: string) {
    return this.all<Demand>(
      "demands",
      "communityId = ?",
      [communityId],
      "json_array_length(memberIds) DESC, updatedAt DESC",
    );
  }

  async getDemand(id: string) {
    return this.one<Demand>("demands", "id = ?", [id]);
  }

  async upsertVenue(venue: Venue) {
    this.ins("venues", { ...venue });
    return venue;
  }

  async listVenues(communityId: string) {
    return this.all<Venue>("venues", "communityId = ?", [communityId]);
  }

  async getVenue(id: string) {
    return this.one<Venue>("venues", "id = ?", [id]);
  }

  async upsertSponsor(sponsor: Sponsor) {
    this.ins("sponsors", { ...sponsor });
    return sponsor;
  }

  async getSponsor(id: string) {
    return this.one<Sponsor>("sponsors", "id = ?", [id]);
  }

  async listSponsors(communityId: string) {
    return this.all<Sponsor>("sponsors", "communityId = ?", [communityId]);
  }

  async createProposal(proposal: Proposal) {
    this.ins("proposals", { ...proposal });
    return proposal;
  }

  async updateProposal(id: string, patch: Partial<Proposal>) {
    const proposal = await this.getProposal(id);
    if (!proposal) throw new Error("proposal not found");
    this.upd("proposals", id, { ...patch });
    return (await this.getProposal(id))!;
  }

  async getProposal(id: string) {
    return this.one<Proposal>("proposals", "id = ?", [id]);
  }

  async listProposals(communityId: string) {
    return this.all<Proposal>("proposals", "communityId = ?", [communityId]);
  }

  async createEvent(event: EventRecord) {
    this.ins("events", { ...event });
    return event;
  }

  async getEventBySlug(slug: string) {
    return this.one<EventRecord>("events", "slug = ?", [slug]);
  }

  async getEvent(id: string) {
    return this.one<EventRecord>("events", "id = ?", [id]);
  }

  async listEvents(communityId: string) {
    return this.all<EventRecord>("events", "communityId = ?", [communityId]);
  }

  async createGuest(guest: Guest) {
    this.ins("guests", { ...guest });
    return guest;
  }

  async updateGuest(id: string, patch: Partial<Pick<Guest, "name" | "memberId">>) {
    const guest = this.all<Guest>("guests", "id = ?", [id])[0];
    if (!guest) throw new Error("guest not found");
    this.upd("guests", id, { ...patch });
    return this.all<Guest>("guests", "id = ?", [id])[0]!;
  }

  async listGuests(eventId: string) {
    return this.all<Guest>("guests", "eventId = ?", [eventId]);
  }

  async addTimeline(event: TimelineEvent) {
    this.ins("timeline", { ...event });
  }

  async listTimeline(communityId: string) {
    return this.all<TimelineEvent>("timeline", "communityId = ?", [communityId], "createdAt");
  }

  async createApplication(application: Application) {
    this.ins("applications", { ...application });
    return application;
  }

  async updateApplication(id: string, patch: Partial<Application>) {
    const application = this.one<Application>("applications", "id = ?", [id]);
    if (!application) throw new Error("application not found");
    this.upd("applications", id, { ...patch });
    return this.one<Application>("applications", "id = ?", [id])!;
  }

  async listApplications(communityId: string) {
    return this.all<Application>("applications", "communityId = ?", [communityId]);
  }

  async addBlocklist(entry: BlocklistEntry) {
    this.ins("blocklist", { ...entry });
    return entry;
  }

  async listBlocklist(communityId: string) {
    return this.all<BlocklistEntry>("blocklist", "communityId = ?", [communityId]);
  }

  async findBlocklist(communityId: string, hash: string) {
    return this.one<BlocklistEntry>("blocklist", "communityId = ? AND hash = ?", [communityId, hash]);
  }

  async saveArtifact(artifact: AutopilotArtifact) {
    this.ins("artifacts", { ...artifact });
    return artifact;
  }

  async listArtifacts(eventId: string) {
    return this.all<AutopilotArtifact>("artifacts", "eventId = ?", [eventId]);
  }

  async createWebhookSubscription(input: { communityId: string; url: string; secret: string; kinds: string[] }) {
    const sub: WebhookSubscription = { id: createId(), createdAt: new Date().toISOString(), ...input };
    this.ins("webhookSubscriptions", { ...sub });
    return sub;
  }

  async listWebhookSubscriptions(communityId: string) {
    return this.all<WebhookSubscription>("webhookSubscriptions", "communityId = ?", [communityId]);
  }

  async deleteWebhookSubscription(id: string) {
    const res = this.db.prepare("DELETE FROM webhookSubscriptions WHERE id = ?").run(id);
    return res.changes > 0;
  }
}

type Resource = import("@community-os/core").Resource;
