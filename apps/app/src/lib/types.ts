export type LeadRole = "owner" | "admin" | "member";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  joinUrl: string | null;
  createdBy?: string;
  role?: LeadRole;
};

export type Citation = {
  id?: string;
  quote?: string;
  objectType?: string;
  messageId?: string;
};

export type MemberCard = {
  id: string;
  displayName: string;
  do: string | null;
  want: string | null;
  offer: string | null;
  notes: string | null;
  publicOptIn: boolean;
  publicSlug: string | null;
  lastActive: string | null;
  citations?: Citation[];
};

export type Demand = {
  id: string;
  topic: string;
  title?: string | null;
  oneLiner?: string | null;
  memberIds: string[];
  citations?: Citation[];
};

export type Venue = {
  id: string;
  name: string;
  area: string | null;
  capacity: number | null;
  contact?: string | null;
};

export type ProposalPack = {
  id: string;
  demandId: string;
  status: "draft" | "approved" | "live";
  explanation: string | null;
  outreachDraft?: string | null;
  speakers: Array<{ id: string; displayName: string; publicSlug?: string | null }>;
  venue: { id: string; name: string; area?: string | null; capacity?: number | null } | null;
  citations?: Citation[];
};

export type CommunityEvent = {
  id: string;
  proposalId: string;
  slug: string;
  title: string;
  startsAt: string | null;
  publishedAt?: string;
};

export type Guest = { id?: string; name: string; email: string; memberId?: string | null };

export type Briefing = {
  people: number;
  messages: number;
  resources?: Array<{ url: string; title?: string | null }>;
  topDemands?: Demand[];
  nextEvents?: CommunityEvent[];
};

export type TimelineEvent = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type EventChain = {
  event: CommunityEvent;
  proposal: { id: string; status: string; explanation: string | null } | null;
  demand: { id: string; topic: string; title: string | null } | null;
  messages: Array<{ id: string; authorRaw: string; body: string; sentAt: string }>;
};

export type AutopilotArtifact = {
  id: string;
  kind: "run_sheet" | "post" | "newsletter";
  body: string;
};

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
  publishedAt?: string;
  community: { name: string; slug: string };
  venue: { name: string; area: string | null } | null;
  speakers: Array<{ name: string; slug: string | null }>;
};

export type PublicMember = {
  name: string;
  do: string | null;
  offer: string | null;
};

export type SearchHit = {
  type: string;
  workspaceId: string;
  member?: { id: string; displayName: string };
  demand?: { id: string; title?: string | null; topic: string };
};

export type Application = {
  id?: string;
  applicant: string;
  decision: "pending" | "accept" | "ask" | "decline";
  reason: string;
  score?: number;
};
