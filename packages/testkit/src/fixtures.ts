import type {
  Application,
  AutopilotArtifact,
  BlocklistEntry,
  Citation,
  Demand,
  EventRecord,
  FileRecord,
  Guest,
  Message,
  NormalizedMessage,
  Proposal,
  Resource,
  Sponsor,
  Store,
  TimelineEvent,
  Venue,
} from "@community-os/sdk";

export const makeId = () => crypto.randomUUID();
export const iso = (s: string) => new Date(s).toISOString();

export function normalizedMessage(over: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    id: over.id ?? `ext-${makeId()}`,
    author: over.author ?? "Ada",
    body: over.body ?? "hello",
    sentAt: over.sentAt ?? "2025-01-01T00:00:00.000Z",
  };
}

export function message(over: Partial<Message> = {}): Message {
  return {
    id: makeId(),
    communityId: "c1",
    sourceId: "s1",
    sourceMessageId: `ext-${makeId()}`,
    authorRaw: "Ada",
    memberId: null,
    body: "hello",
    sentAt: "2025-01-01T00:00:00.000Z",
    isNoise: false,
    ...over,
  };
}

export function fileRecord(over: Partial<FileRecord> = {}): FileRecord {
  return {
    id: makeId(),
    communityId: "c1",
    messageId: null,
    name: "flyer.png",
    storagePath: "files/flyer.png",
    mime: "image/png",
    ...over,
  };
}

export function citation(over: Partial<Citation> = {}): Citation {
  return {
    id: makeId(),
    communityId: "c1",
    objectType: "member",
    objectId: "m1",
    messageId: "msg1",
    quote: "i bake bread",
    ...over,
  };
}

export function resource(over: Partial<Resource> = {}): Resource {
  return {
    id: makeId(),
    communityId: "c1",
    url: "https://example.com",
    title: "Example",
    messageId: null,
    ...over,
  };
}

export function demand(over: Partial<Demand> = {}): Demand {
  return {
    id: makeId(),
    communityId: "c1",
    topic: "meetup",
    title: null,
    oneLiner: null,
    memberIds: [],
    messageIds: [],
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...over,
  };
}

export function venue(over: Partial<Venue> = {}): Venue {
  return {
    id: makeId(),
    communityId: "c1",
    name: "Town Hall",
    area: null,
    capacity: null,
    contact: null,
    ...over,
  };
}

export function sponsor(over: Partial<Sponsor> = {}): Sponsor {
  return { id: makeId(), communityId: "c1", name: "Bakery Co", notes: null, ...over };
}

export function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    id: makeId(),
    communityId: "c1",
    demandId: "d1",
    venueId: null,
    speakerIds: [],
    status: "draft",
    explanation: null,
    outreachDraft: null,
    ...over,
  };
}

export function eventRecord(over: Partial<EventRecord> = {}): EventRecord {
  return {
    id: makeId(),
    communityId: "c1",
    proposalId: "p1",
    slug: `evt-${makeId().slice(0, 8)}`,
    title: "Meetup",
    startsAt: null,
    qrSvg: "<svg/>",
    publishedAt: "2025-01-01T00:00:00.000Z",
    ...over,
  };
}

export function guest(over: Partial<Guest> = {}): Guest {
  return {
    id: makeId(),
    eventId: "e1",
    communityId: "c1",
    memberId: null,
    name: "Grace",
    email: "grace@example.com",
    source: "native",
    ...over,
  };
}

export function timelineEvent(over: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: makeId(),
    communityId: "c1",
    kind: "import",
    payload: {},
    createdAt: "2025-01-01T00:00:00.000Z",
    ...over,
  };
}

export function application(over: Partial<Application> = {}): Application {
  return {
    id: makeId(),
    communityId: "c1",
    applicant: "Lin",
    answers: "i organize meetups",
    score: 0,
    decision: "pending",
    reason: "",
    ...over,
  };
}

export function blocklistEntry(over: Partial<BlocklistEntry> = {}): BlocklistEntry {
  return {
    id: makeId(),
    communityId: "c1",
    hash: `hash-${makeId()}`,
    evidence: "spam",
    reporter: "lead",
    confirmed: false,
    ...over,
  };
}

export function artifact(over: Partial<AutopilotArtifact> = {}): AutopilotArtifact {
  return {
    id: makeId(),
    eventId: "e1",
    communityId: "c1",
    kind: "run_sheet",
    body: "schedule",
    ...over,
  };
}

/** WhatsApp export transcript variants — one line per message unless noted. */
export const transcripts = {
  /** iOS bracketed 12h clock */
  ios: `[15/06/2025, 9:30:00 AM] Ada: morning all
[15/06/2025, 9:31:00 AM] Lin: hi!`,
  /** Android unbracketed 24h clock with dash */
  android: `15/06/2025, 09:30 - Ada: morning all
15/06/2025, 09:31 - Lin: hi!`,
  /** M/D/Y ambiguous-order dates */
  usFormat: `6/15/2025, 9:30 AM - Ada: hello`,
  /** A body that wraps onto a second line */
  multiline: `15/06/2025, 09:30 - Ada: first line
second line of the same message
15/06/2025, 09:31 - Lin: next message`,
  /** System events that must be skipped */
  system: `15/06/2025, 09:29 - WhatsApp: You joined using this group's invite link
15/06/2025, 09:30 - Ada: hello`,
  /** Attachment markers */
  attachment: `15/06/2025, 09:30 - Ada: <attached: poster.jpg> check this out`,
  /** BOM + CRLF line endings */
  crlf: `﻿15/06/2025, 09:30 - Ada: hello\r\n15/06/2025, 09:31 - Lin: hi`,
};

/** Seed a store with a workspace + source + two members + three messages. */
export async function seedCommunity(store: Store) {
  const workspace = await store.createWorkspace({ name: "Test Community", createdBy: "lead" });
  const source = await store.createSource({ communityId: workspace.id, kind: "whatsapp", name: "chat" });
  const ada = await store.upsertMember(workspace.id, "Ada", "2025-01-01T00:00:00Z");
  const lin = await store.upsertMember(workspace.id, "Lin", "2025-01-01T00:01:00Z");
  const messages = [
    message({ communityId: workspace.id, sourceId: source.id, authorRaw: "Ada", memberId: ada.id, body: "i bake bread", sentAt: "2025-01-01T00:00:00Z" }),
    message({ communityId: workspace.id, sourceId: source.id, authorRaw: "Lin", memberId: lin.id, body: "i want a meetup", sentAt: "2025-01-01T00:01:00Z" }),
    message({ communityId: workspace.id, sourceId: source.id, authorRaw: "Ada", memberId: ada.id, body: "i can offer the kitchen", sentAt: "2025-01-01T00:02:00Z" }),
  ];
  await store.insertMessages(messages);
  return { workspace, source, members: { ada, lin }, messages };
}
