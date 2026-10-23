export type SourceKind = "whatsapp" | "discord" | "slack" | "native";
export type ProposalStatus = "draft" | "approved" | "live";
export type ApplicationDecision = "pending" | "accept" | "ask" | "decline";
export type LeadRole = "owner" | "admin" | "member";

export type ApiToken = {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  joinUrl: string | null;
  createdBy: string;
  createdAt: string;
};

export type User = {
  id: string;
  email: string;
};

export type Session = {
  token: string;
  userId: string;
  email: string;
  name?: string | null;
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
  userId: string | null;
};

export type Sponsor = {
  id: string;
  communityId: string;
  name: string;
  notes: string | null;
  userId: string | null;
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
