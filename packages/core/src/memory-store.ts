import { createId, slugify } from "./ids.ts";
import type { Store } from "./store.ts";
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
  Session,
  Source,
  Sponsor,
  TimelineEvent,
  User,
  Venue,
  Workspace,
} from "./types.ts";

export class MemoryStore implements Store {
  users = new Map<string, User>();
  sessions = new Map<string, Session>();
  workspaces = new Map<string, Workspace>();
  leads = new Map<string, Set<string>>();
  sources = new Map<string, Source>();
  messages = new Map<string, Message>();
  files = new Map<string, FileRecord>();
  members = new Map<string, Member>();
  citations = new Map<string, Citation>();
  resources = new Map<string, import("./types.ts").Resource>();
  demands = new Map<string, Demand>();
  venues = new Map<string, Venue>();
  sponsors = new Map<string, Sponsor>();
  proposals = new Map<string, Proposal>();
  events = new Map<string, EventRecord>();
  guests = new Map<string, Guest>();
  timeline = new Map<string, TimelineEvent>();
  applications = new Map<string, Application>();
  blocklist = new Map<string, BlocklistEntry>();
  artifacts = new Map<string, AutopilotArtifact>();

  async upsertUser(email: string): Promise<User> {
    const existing = [...this.users.values()].find((u) => u.email === email.toLowerCase());
    if (existing) return existing;
    const user = { id: createId(), email: email.toLowerCase() };
    this.users.set(user.id, user);
    return user;
  }

  async createSession(user: User): Promise<Session> {
    const session = { token: createId(), userId: user.id, email: user.email, createdAt: new Date().toISOString() };
    this.sessions.set(session.token, session);
    return session;
  }

  async getSession(token: string): Promise<Session | null> {
    return this.sessions.get(token) ?? null;
  }

  async createWorkspace(input: { name: string; createdBy: string; joinUrl?: string }): Promise<Workspace> {
    let slug = slugify(input.name);
    if ([...this.workspaces.values()].some((w) => w.slug === slug)) slug = `${slug}-${createId().slice(0, 6)}`;
    const workspace: Workspace = {
      id: createId(),
      name: input.name,
      slug,
      joinUrl: input.joinUrl ?? null,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    this.workspaces.set(workspace.id, workspace);
    this.leads.set(workspace.id, new Set([input.createdBy]));
    return workspace;
  }

  async getWorkspace(id: string) {
    return this.workspaces.get(id) ?? null;
  }

  async getWorkspaceBySlug(slug: string) {
    return [...this.workspaces.values()].find((w) => w.slug === slug) ?? null;
  }

  async listWorkspacesForUser(userId: string) {
    return [...this.workspaces.values()].filter((w) => this.leads.get(w.id)?.has(userId));
  }

  async isLead(workspaceId: string, userId: string) {
    return this.leads.get(workspaceId)?.has(userId) ?? false;
  }

  async createSource(input: { communityId: string; kind: Source["kind"]; name: string }) {
    const source: Source = { id: createId(), ...input };
    this.sources.set(source.id, source);
    return source;
  }

  async listSources(communityId: string) {
    return [...this.sources.values()].filter((s) => s.communityId === communityId);
  }

  async insertMessages(messages: Message[]) {
    let inserted = 0;
    let skipped = 0;
    for (const message of messages) {
      const dup = [...this.messages.values()].some(
        (m) => m.communityId === message.communityId && m.sourceMessageId === message.sourceMessageId,
      );
      if (dup) {
        skipped++;
        continue;
      }
      this.messages.set(message.id, message);
      inserted++;
    }
    return { inserted, skipped };
  }

  async listMessages(communityId: string) {
    return [...this.messages.values()]
      .filter((m) => m.communityId === communityId)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  }

  async getMessage(id: string) {
    return this.messages.get(id) ?? null;
  }

  async insertFiles(files: FileRecord[]) {
    for (const file of files) this.files.set(file.id, file);
  }

  async listFiles(communityId: string) {
    return [...this.files.values()].filter((f) => f.communityId === communityId);
  }

  async upsertMember(communityId: string, displayName: string, lastActive: string | null) {
    const existing = [...this.members.values()].find(
      (m) => m.communityId === communityId && m.aliases.some((a) => a.toLowerCase() === displayName.toLowerCase()),
    );
    if (existing) {
      if (lastActive && (!existing.lastActive || lastActive > existing.lastActive)) existing.lastActive = lastActive;
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
    this.members.set(member.id, member);
    return member;
  }

  async listMembers(communityId: string) {
    return [...this.members.values()].filter((m) => m.communityId === communityId);
  }

  async getMember(id: string) {
    return this.members.get(id) ?? null;
  }

  async getMemberBySlug(communityId: string, slug: string) {
    return [...this.members.values()].find((m) => m.communityId === communityId && m.publicSlug === slug) ?? null;
  }

  async getMemberByPublicSlug(slug: string) {
    return [...this.members.values()].find((m) => m.publicSlug === slug && m.publicOptIn) ?? null;
  }

  async updateMember(id: string, patch: Parameters<Store["updateMember"]>[1], byLead: boolean) {
    const member = this.members.get(id);
    if (!member) throw new Error("member not found");
    const keys = Object.keys(patch) as Array<keyof typeof patch>;
    for (const key of keys) {
      const value = patch[key];
      if (value === undefined) continue;
      if (!byLead && (key === "do" || key === "want" || key === "offer" || key === "notes" || key === "displayName")) {
        if (member.leadLockedFields.includes(key)) continue;
      }
      if (byLead && (key === "do" || key === "want" || key === "offer" || key === "notes" || key === "displayName")) {
        if (!member.leadLockedFields.includes(key)) member.leadLockedFields.push(key);
      }
      (member as unknown as Record<string, unknown>)[key] = value;
    }
    return member;
  }

  async insertCitations(citations: Citation[]) {
    for (const citation of citations) this.citations.set(citation.id, citation);
  }

  async listCitations(communityId: string, objectType?: string, objectId?: string) {
    return [...this.citations.values()].filter(
      (c) =>
        c.communityId === communityId &&
        (!objectType || c.objectType === objectType) &&
        (!objectId || c.objectId === objectId),
    );
  }

  async upsertResource(resource: import("./types.ts").Resource) {
    const existing = [...this.resources.values()].find((r) => r.communityId === resource.communityId && r.url === resource.url);
    if (existing) return existing;
    this.resources.set(resource.id, resource);
    return resource;
  }

  async listResources(communityId: string) {
    return [...this.resources.values()].filter((r) => r.communityId === communityId);
  }

  async upsertDemand(demand: Demand) {
    const existing = [...this.demands.values()].find((d) => d.communityId === demand.communityId && d.topic === demand.topic);
    if (existing) {
      existing.memberIds = [...new Set([...existing.memberIds, ...demand.memberIds])];
      existing.messageIds = [...new Set([...existing.messageIds, ...demand.messageIds])];
      existing.updatedAt = demand.updatedAt;
      existing.title = demand.title ?? existing.title;
      existing.oneLiner = demand.oneLiner ?? existing.oneLiner;
      return existing;
    }
    this.demands.set(demand.id, demand);
    return demand;
  }

  async listDemands(communityId: string) {
    return [...this.demands.values()]
      .filter((d) => d.communityId === communityId)
      .sort((a, b) => b.memberIds.length - a.memberIds.length || b.updatedAt.localeCompare(a.updatedAt));
  }

  async getDemand(id: string) {
    return this.demands.get(id) ?? null;
  }

  async upsertVenue(venue: Venue) {
    this.venues.set(venue.id, venue);
    return venue;
  }

  async listVenues(communityId: string) {
    return [...this.venues.values()].filter((v) => v.communityId === communityId);
  }

  async getVenue(id: string) {
    return this.venues.get(id) ?? null;
  }

  async upsertSponsor(sponsor: Sponsor) {
    this.sponsors.set(sponsor.id, sponsor);
    return sponsor;
  }

  async getSponsor(id: string) {
    return this.sponsors.get(id) ?? null;
  }

  async listSponsors(communityId: string) {
    return [...this.sponsors.values()].filter((s) => s.communityId === communityId);
  }

  async createProposal(proposal: Proposal) {
    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  async updateProposal(id: string, patch: Partial<Proposal>) {
    const proposal = this.proposals.get(id);
    if (!proposal) throw new Error("proposal not found");
    Object.assign(proposal, patch);
    return proposal;
  }

  async getProposal(id: string) {
    return this.proposals.get(id) ?? null;
  }

  async listProposals(communityId: string) {
    return [...this.proposals.values()].filter((p) => p.communityId === communityId);
  }

  async createEvent(event: EventRecord) {
    this.events.set(event.id, event);
    return event;
  }

  async getEventBySlug(slug: string) {
    return [...this.events.values()].find((e) => e.slug === slug) ?? null;
  }

  async getEvent(id: string) {
    return this.events.get(id) ?? null;
  }

  async listEvents(communityId: string) {
    return [...this.events.values()].filter((e) => e.communityId === communityId);
  }

  async createGuest(guest: Guest) {
    this.guests.set(guest.id, guest);
    return guest;
  }

  async updateGuest(id: string, patch: Partial<Pick<Guest, "name" | "memberId">>) {
    const guest = this.guests.get(id);
    if (!guest) throw new Error("guest not found");
    Object.assign(guest, patch);
    return guest;
  }

  async listGuests(eventId: string) {
    return [...this.guests.values()].filter((g) => g.eventId === eventId);
  }

  async addTimeline(event: TimelineEvent) {
    this.timeline.set(event.id, event);
  }

  async listTimeline(communityId: string) {
    return [...this.timeline.values()]
      .filter((t) => t.communityId === communityId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createApplication(application: Application) {
    this.applications.set(application.id, application);
    return application;
  }

  async updateApplication(id: string, patch: Partial<Application>) {
    const application = this.applications.get(id);
    if (!application) throw new Error("application not found");
    Object.assign(application, patch);
    return application;
  }

  async listApplications(communityId: string) {
    return [...this.applications.values()].filter((a) => a.communityId === communityId);
  }

  async addBlocklist(entry: BlocklistEntry) {
    this.blocklist.set(entry.id, entry);
    return entry;
  }

  async listBlocklist(communityId: string) {
    return [...this.blocklist.values()].filter((b) => b.communityId === communityId);
  }

  async findBlocklist(communityId: string, hash: string) {
    return [...this.blocklist.values()].find((b) => b.communityId === communityId && b.hash === hash) ?? null;
  }

  async saveArtifact(artifact: AutopilotArtifact) {
    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }

  async listArtifacts(eventId: string) {
    return [...this.artifacts.values()].filter((a) => a.eventId === eventId);
  }
}
