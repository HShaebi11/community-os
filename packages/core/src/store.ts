import type {
  Application,
  AutopilotArtifact,
  BlocklistEntry,
  Citation,
  Demand,
  EventRecord,
  FileRecord,
  Guest,
  LeadRole,
  Member,
  Message,
  Proposal,
  Source,
  Sponsor,
  TimelineEvent,
  Venue,
  WebhookSubscription,
  Workspace,
} from "./types.ts";

export type Store = {
  createWorkspace(input: { name: string; createdBy: string; joinUrl?: string }): Promise<Workspace>;
  getWorkspace(id: string): Promise<Workspace | null>;
  getWorkspaceBySlug(slug: string): Promise<Workspace | null>;
  updateWorkspace(id: string, patch: { name?: string; joinUrl?: string | null }): Promise<Workspace>;
  listWorkspaces(): Promise<Array<Workspace & { role: LeadRole }>>;

  createSource(input: { communityId: string; kind: Source["kind"]; name: string }): Promise<Source>;
  listSources(communityId: string): Promise<Source[]>;

  insertMessages(messages: Message[]): Promise<{ inserted: number; skipped: number }>;
  listMessages(communityId: string): Promise<Message[]>;
  getMessage(id: string): Promise<Message | null>;
  insertFiles(files: FileRecord[]): Promise<void>;
  listFiles(communityId: string): Promise<FileRecord[]>;

  upsertMember(communityId: string, displayName: string, lastActive: string | null): Promise<Member>;
  listMembers(communityId: string): Promise<Member[]>;
  getMember(id: string): Promise<Member | null>;
  getMemberBySlug(communityId: string, slug: string): Promise<Member | null>;
  getMemberByPublicSlug(slug: string): Promise<Member | null>;
  updateMember(
    id: string,
    patch: Partial<Pick<Member, "do" | "want" | "offer" | "notes" | "displayName" | "publicOptIn" | "publicSlug">>,
    byLead: boolean,
  ): Promise<Member>;

  insertCitations(citations: Citation[]): Promise<void>;
  listCitations(communityId: string, objectType?: string, objectId?: string): Promise<Citation[]>;

  upsertResource(resource: Resource): Promise<Resource>;
  listResources(communityId: string): Promise<Resource[]>;

  upsertDemand(demand: Demand): Promise<Demand>;
  listDemands(communityId: string): Promise<Demand[]>;
  getDemand(id: string): Promise<Demand | null>;

  upsertVenue(venue: Venue): Promise<Venue>;
  listVenues(communityId: string): Promise<Venue[]>;
  getVenue(id: string): Promise<Venue | null>;
  upsertSponsor(sponsor: Sponsor): Promise<Sponsor>;
  getSponsor(id: string): Promise<Sponsor | null>;
  listSponsors(communityId: string): Promise<Sponsor[]>;

  createProposal(proposal: Proposal): Promise<Proposal>;
  updateProposal(id: string, patch: Partial<Proposal>): Promise<Proposal>;
  getProposal(id: string): Promise<Proposal | null>;
  listProposals(communityId: string): Promise<Proposal[]>;

  createEvent(event: EventRecord): Promise<EventRecord>;
  getEventBySlug(slug: string): Promise<EventRecord | null>;
  getEvent(id: string): Promise<EventRecord | null>;
  listEvents(communityId: string): Promise<EventRecord[]>;

  createGuest(guest: Guest): Promise<Guest>;
  updateGuest(id: string, patch: Partial<Pick<Guest, "name" | "memberId">>): Promise<Guest>;
  listGuests(eventId: string): Promise<Guest[]>;

  addTimeline(event: TimelineEvent): Promise<void>;
  listTimeline(communityId: string): Promise<TimelineEvent[]>;

  createApplication(application: Application): Promise<Application>;
  updateApplication(id: string, patch: Partial<Application>): Promise<Application>;
  listApplications(communityId: string): Promise<Application[]>;
  addBlocklist(entry: BlocklistEntry): Promise<BlocklistEntry>;
  listBlocklist(communityId: string): Promise<BlocklistEntry[]>;
  findBlocklist(communityId: string, hash: string): Promise<BlocklistEntry | null>;

  saveArtifact(artifact: AutopilotArtifact): Promise<AutopilotArtifact>;
  listArtifacts(eventId: string): Promise<AutopilotArtifact[]>;

  createWebhookSubscription(input: {
    communityId: string;
    url: string;
    secret: string;
    kinds: string[];
  }): Promise<WebhookSubscription>;
  listWebhookSubscriptions(communityId: string): Promise<WebhookSubscription[]>;
  deleteWebhookSubscription(id: string): Promise<boolean>;
};

type Resource = import("./types.ts").Resource;
