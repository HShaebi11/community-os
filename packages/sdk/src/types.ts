// Public wire types for the Community OS API. These are the SDK's contract —
// they mirror the domain records in packages/core but are declared here so the
// published package is fully self-contained (no dependency types to resolve).
// Drift between this file and core types is caught at typecheck by drift-check.ts.

export type SourceKind = "whatsapp" | "discord" | "slack" | "native";
export type ProposalStatus = "draft" | "approved" | "live";
export type ApplicationDecision = "pending" | "accept" | "ask" | "decline";
export type LeadRole = "owner" | "admin" | "member";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  joinUrl: string | null;
  createdBy: string;
  createdAt: string;
};

export type Source = {
  id: string;
  communityId: string;
  kind: SourceKind;
  name: string;
};

export type Message = {
  id: string;
  communityId: string;
  sourceId: string;
  sourceMessageId: string;
  authorRaw: string;
  memberId: string | null;
  body: string;
  sentAt: string;
  isNoise: boolean;
};

export type FileRecord = {
  id: string;
  communityId: string;
  messageId: string | null;
  name: string;
  storagePath: string;
  mime: string;
};

export type Member = {
  id: string;
  communityId: string;
  displayName: string;
  aliases: string[];
  do: string | null;
  want: string | null;
  offer: string | null;
  notes: string | null;
  publicOptIn: boolean;
  publicSlug: string | null;
  lastActive: string | null;
  leadLockedFields: Array<"do" | "want" | "offer" | "notes" | "displayName">;
};

export type Citation = {
  id: string;
  communityId: string;
  objectType: string;
  objectId: string;
  messageId: string;
  quote: string;
};

export type Resource = {
  id: string;
  communityId: string;
  url: string;
  title: string;
  messageId: string | null;
};

export type Demand = {
  id: string;
  communityId: string;
  topic: string;
  title: string | null;
  oneLiner: string | null;
  memberIds: string[];
  messageIds: string[];
  updatedAt: string;
};

export type Venue = {
  id: string;
  communityId: string;
  name: string;
  area: string | null;
  capacity: number | null;
  contact: string | null;
};

export type Sponsor = {
  id: string;
  communityId: string;
  name: string;
  notes: string | null;
};

export type Proposal = {
  id: string;
  communityId: string;
  demandId: string;
  venueId: string | null;
  speakerIds: string[];
  status: ProposalStatus;
  explanation: string | null;
  outreachDraft: string | null;
};

export type EventRecord = {
  id: string;
  communityId: string;
  proposalId: string;
  slug: string;
  title: string;
  startsAt: string | null;
  qrSvg: string;
  publishedAt: string;
};

export type Guest = {
  id: string;
  eventId: string;
  communityId: string;
  memberId: string | null;
  name: string;
  email: string;
  source: "native";
};

export type TimelineEvent = {
  id: string;
  communityId: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type Application = {
  id: string;
  communityId: string;
  applicant: string;
  answers: string;
  score: number;
  decision: ApplicationDecision;
  reason: string;
};

export type BlocklistEntry = {
  id: string;
  communityId: string;
  hash: string;
  evidence: string;
  reporter: string;
  confirmed: boolean;
};

export type AutopilotArtifact = {
  id: string;
  eventId: string;
  communityId: string;
  kind: "run_sheet" | "post" | "newsletter";
  body: string;
};

export type WebhookSubscription = {
  id: string;
  communityId: string;
  url: string;
  secret: string;
  kinds: string[];
  createdAt: string;
};

// The persistence contract — implement this to bring your own database
// (Postgres, SQLite, Turso, D1, files, whatever). CommunityOS.store(store)
// runs the whole product on it. MemoryStore and @community-os/store-sqlite
// are the in-repo implementations; createDrizzleStore in @community-os/db
// is the Postgres one.

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
