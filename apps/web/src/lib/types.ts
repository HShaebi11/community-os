export type Workspace = {
  id: string;
  name: string;
  slug: string;
  joinUrl: string | null;
};

export type Citation = { quote?: string };

export type MemberCard = {
  id: string;
  displayName: string;
  do: string | null;
  want: string | null;
  offer: string | null;
  publicOptIn: boolean;
  publicSlug: string | null;
  citations?: Citation[];
};

export type Demand = {
  id: string;
  topic: string;
  title?: string | null;
  oneLiner?: string | null;
  memberIds: string[];
};

export type Venue = {
  id: string;
  name: string;
  area: string | null;
  capacity: number | null;
};

export type ProposalPack = {
  id: string;
  status: string;
  explanation: string | null;
  outreachDraft?: string | null;
  speakers: Array<{ displayName: string }>;
  venue: { name: string } | null;
};

export type CommunityEvent = {
  id: string;
  slug: string;
  title: string;
};

export type Guest = { name: string; email: string };

export type Briefing = {
  people: number;
  messages: number;
  resources?: Array<{ url: string; title?: string | null }>;
  topDemands?: Demand[];
  nextEvents?: CommunityEvent[];
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
  member?: { displayName: string };
  demand?: { title?: string | null; topic: string };
};

export type Application = {
  applicant: string;
  decision: string;
  reason: string;
};
