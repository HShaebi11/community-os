import { clipQuote, extractFromMessages, scoreApplication, titleFromTopic } from "./extract.ts";
import { createId, sha256Hex, slugify } from "./ids.ts";
import { draftOutreach, explainProposal, matchSpeakers, matchVenues, newsletter, promoPost, runSheet } from "./match.ts";
import { extractUrls, isNoiseMessage } from "./noise.ts";
import { qrSvg } from "./qr.ts";
import type { Store } from "./store.ts";
import type { Demand, EventRecord, FileRecord, Member, Message, Proposal } from "./types.ts";
import { parseWhatsAppTranscript } from "./whatsapp.ts";

export async function importWhatsApp(
  store: Store,
  communityId: string,
  transcript: string,
  attached: Array<{ name: string; storagePath: string; mime: string }>,
) {
  const parsed = parseWhatsAppTranscript(transcript);
  let source = (await store.listSources(communityId)).find((s) => s.kind === "whatsapp");
  if (!source) source = await store.createSource({ communityId, kind: "whatsapp", name: "WhatsApp export" });

  const messages: Message[] = [];
  for (const row of parsed) {
    const member = await store.upsertMember(communityId, row.authorRaw, row.sentAt);
    messages.push({
      id: createId(),
      communityId,
      sourceId: source.id,
      sourceMessageId: row.sourceMessageId,
      authorRaw: row.authorRaw,
      memberId: member.id,
      body: row.body,
      sentAt: row.sentAt,
      isNoise: isNoiseMessage(row.body, row.authorRaw),
    });
  }
  const result = await store.insertMessages(messages);

  const files: FileRecord[] = attached.map((file) => ({
    id: createId(),
    communityId,
    messageId: null,
    name: file.name,
    storagePath: file.storagePath,
    mime: file.mime,
  }));
  await store.insertFiles(files);
  await store.addTimeline({
    id: createId(),
    communityId,
    kind: "import",
    payload: { inserted: result.inserted, skipped: result.skipped, source: "whatsapp" },
    createdAt: new Date().toISOString(),
  });
  return { ...result, members: await store.listMembers(communityId) };
}

export async function ingestDiscord(
  store: Store,
  communityId: string,
  payload: { id: string; content: string; timestamp: string; author: { id: string; username: string } },
) {
  let source = (await store.listSources(communityId)).find((s) => s.kind === "discord");
  if (!source) source = await store.createSource({ communityId, kind: "discord", name: "Discord" });
  const member = await store.upsertMember(communityId, payload.author.username, payload.timestamp);
  const result = await store.insertMessages([
    {
      id: createId(),
      communityId,
      sourceId: source.id,
      sourceMessageId: payload.id,
      authorRaw: payload.author.username,
      memberId: member.id,
      body: payload.content,
      sentAt: payload.timestamp,
      isNoise: isNoiseMessage(payload.content, payload.author.username),
    },
  ]);
  return { ...result, member };
}

function citationKey(citation: { objectId: string; messageId: string; quote: string }) {
  return `${citation.objectId}\0${citation.messageId}\0${citation.quote}`;
}

export async function refreshMemory(store: Store, communityId: string) {
  const messages = await store.listMessages(communityId);
  const members = await store.listMembers(communityId);
  const seen = new Set((await store.listCitations(communityId)).map(citationKey));
  const byMember = new Map<string, Message[]>();
  for (const message of messages) {
    if (!message.memberId || message.isNoise) continue;
    const list = byMember.get(message.memberId) ?? [];
    list.push(message);
    byMember.set(message.memberId, list);
  }

  const insertFresh = async (incoming: Array<{
    id: string;
    communityId: string;
    objectType: string;
    objectId: string;
    messageId: string;
    quote: string;
  }>) => {
    const fresh = incoming.filter((citation) => {
      const key = citationKey(citation);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (fresh.length) await store.insertCitations(fresh);
  };

  for (const member of members) {
    const theirs = byMember.get(member.id) ?? [];
    const extracted = extractFromMessages(theirs.map((m) => m.body));
    const patch: Partial<Pick<Member, "do" | "want" | "offer">> = {};
    if (extracted.do) patch.do = extracted.do;
    if (extracted.want) patch.want = extracted.want;
    if (extracted.offer) patch.offer = extracted.offer;
    if (Object.keys(patch).length) await store.updateMember(member.id, patch, false);
    await insertFresh(
      extracted.citations
        .map((c) => {
          const message = theirs.find((m) => clipQuote(m.body) === c.quote);
          if (!message) return null;
          return {
            id: createId(),
            communityId,
            objectType: "member",
            objectId: member.id,
            messageId: message.id,
            quote: c.quote,
          };
        })
        .filter((c) => c !== null),
    );
    for (const message of theirs) {
      for (const url of extractUrls(message.body)) {
        await store.upsertResource({
          id: createId(),
          communityId,
          url,
          title: url.replace(/^https?:\/\//, "").slice(0, 80),
          messageId: message.id,
        });
      }
    }
  }

  for (const message of messages) {
    if (message.isNoise || !message.memberId) continue;
    const extracted = extractFromMessages([message.body]);
    for (const topic of extracted.demandTopics) {
      const demand: Demand = {
        id: createId(),
        communityId,
        topic,
        title: null,
        oneLiner: null,
        memberIds: [message.memberId],
        messageIds: [message.id],
        updatedAt: message.sentAt,
      };
      const saved = await store.upsertDemand(demand);
      await insertFresh([
        {
          id: createId(),
          communityId,
          objectType: "demand",
          objectId: saved.id,
          messageId: message.id,
          quote: extracted.citations.find((c) => c.kind === "demand")?.quote ?? message.body.slice(0, 180),
        },
      ]);
    }
  }

  const result = {
    members: await store.listMembers(communityId),
    demands: await store.listDemands(communityId),
    resources: await store.listResources(communityId),
  };
  await store.addTimeline({
    id: createId(),
    communityId,
    kind: "memory",
    payload: {
      members: result.members.length,
      demands: result.demands.length,
      resources: result.resources.length,
    },
    createdAt: new Date().toISOString(),
  });
  return result;
}

export async function briefing(store: Store, communityId: string) {
  const members = await store.listMembers(communityId);
  const demands = await store.listDemands(communityId);
  const messages = await store.listMessages(communityId);
  const events = await store.listEvents(communityId);
  const resources = await store.listResources(communityId);
  return {
    people: members.length,
    messages: messages.length,
    topDemands: demands.slice(0, 5).map((d) => ({
      ...d,
      title: d.title ?? titleFromTopic(d.topic, d.memberIds.length),
      oneLiner: d.oneLiner ?? `${d.memberIds.length} members mentioned ${d.topic}.`,
    })),
    resources,
    nextEvents: events,
  };
}

export async function memberCard(store: Store, memberId: string) {
  const member = await store.getMember(memberId);
  if (!member) throw new Error("member not found");
  const citations = await store.listCitations(member.communityId, "member", member.id);
  return { ...member, citations };
}

export async function openDemand(store: Store, demandId: string) {
  const demand = await store.getDemand(demandId);
  if (!demand) throw new Error("demand not found");
  const title = titleFromTopic(demand.topic, demand.memberIds.length);
  const oneLiner = `${demand.memberIds.length} people asked for ${demand.topic} recently.`;
  const saved = await store.upsertDemand({ ...demand, title, oneLiner });
  const citations = await store.listCitations(saved.communityId, "demand", saved.id);
  return { ...saved, citations };
}

export async function createProposalFromDemand(store: Store, communityId: string, demandId: string) {
  const demand = await openDemand(store, demandId);
  const members = await store.listMembers(communityId);
  const venues = await store.listVenues(communityId);
  const speakers = matchSpeakers(members, demand.topic).slice(0, 3);
  const venue = matchVenues(venues, Math.max(demand.memberIds.length, 10))[0] ?? null;
  const quotes = (await store.listCitations(communityId, "demand", demand.id)).map((c) => c.quote);
  const proposal = await store.createProposal({
    id: createId(),
    communityId,
    demandId: demand.id,
    venueId: venue?.id ?? null,
    speakerIds: speakers.map((s) => s.id),
    status: "draft",
    explanation: explainProposal({ topic: demand.topic, speakers, venue, quotes }),
    outreachDraft: null,
  });
  await store.addTimeline({
    id: createId(),
    communityId,
    kind: "proposal",
    payload: { proposalId: proposal.id, demandId: demand.id },
    createdAt: new Date().toISOString(),
  });
  return openProposal(store, proposal.id);
}

export async function openProposal(store: Store, proposalId: string) {
  const proposal = await store.getProposal(proposalId);
  if (!proposal) throw new Error("proposal not found");
  const speakers = (await Promise.all(proposal.speakerIds.map((id) => store.getMember(id)))).filter(Boolean) as Member[];
  const venue = proposal.venueId ? await store.getVenue(proposal.venueId) : null;
  const citations = await store.listCitations(proposal.communityId, "demand", proposal.demandId);
  return { ...proposal, speakers, venue, citations };
}

export async function setProposalStatus(store: Store, proposalId: string, status: Proposal["status"]) {
  const proposal = await store.getProposal(proposalId);
  if (!proposal) throw new Error("proposal not found");
  if (status === "approved" && proposal.status !== "draft") {
    throw new Error("only a draft proposal can be approved");
  }
  if (status !== "approved") {
    throw new Error("use go-live to publish an approved proposal");
  }
  await store.updateProposal(proposalId, { status });
  return openProposal(store, proposalId);
}

export async function makeOutreachDraft(store: Store, proposalId: string, communityName: string) {
  const proposal = await store.getProposal(proposalId);
  if (!proposal) throw new Error("proposal not found");
  if (proposal.outreachDraft) return openProposal(store, proposalId);
  const pack = await openProposal(store, proposalId);
  const demand = await store.getDemand(proposal.demandId);
  const draft = draftOutreach({
    communityName,
    topic: demand?.topic ?? "this",
    speakers: pack.speakers.map((s) => s.displayName),
    venue: pack.venue?.name ?? null,
  });
  await store.updateProposal(proposalId, { outreachDraft: draft });
  return openProposal(store, proposalId);
}

export async function goLive(store: Store, proposalId: string, origin: string) {
  const proposal = await store.getProposal(proposalId);
  if (!proposal) throw new Error("proposal not found");
  if (proposal.status !== "approved") throw new Error("approve the proposal before going live");
  await store.updateProposal(proposalId, { status: "live" });
  const demand = await store.getDemand(proposal.demandId);
  const workspace = await store.getWorkspace(proposal.communityId);
  const title = demand?.title ?? `${workspace?.name ?? "Community"}: ${demand?.topic ?? "event"}`;
  const event: EventRecord = {
    id: createId(),
    communityId: proposal.communityId,
    proposalId: proposal.id,
    slug: `${slugify(title)}-${createId().slice(0, 6)}`,
    title,
    startsAt: null,
    qrSvg: "",
    publishedAt: new Date().toISOString(),
  };
  event.qrSvg = qrSvg(`${origin}/e/${event.slug}`);
  const saved = await store.createEvent(event);
  await store.addTimeline({
    id: createId(),
    communityId: proposal.communityId,
    kind: "published",
    payload: { eventId: saved.id, proposalId: proposal.id },
    createdAt: new Date().toISOString(),
  });
  return saved;
}

export async function rsvp(
  store: Store,
  slug: string,
  input: { name: string; email: string },
) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email || !email.includes("@")) throw new Error("name and email required");
  const event = await store.getEventBySlug(slug);
  if (!event) throw new Error("event not found");
  const members = await store.listMembers(event.communityId);
  const member =
    members.find((m) => m.displayName.toLowerCase() === name.toLowerCase()) ??
    members.find((m) => (m.notes ?? "").toLowerCase().includes(email)) ??
    null;
  const existing = (await store.listGuests(event.id)).find((g) => g.email === email);
  if (existing) {
    return store.updateGuest(existing.id, { name, memberId: member?.id ?? existing.memberId });
  }
  const guest = await store.createGuest({
    id: createId(),
    eventId: event.id,
    communityId: event.communityId,
    memberId: member?.id ?? null,
    name,
    email,
    source: "native",
  });
  await store.addTimeline({
    id: createId(),
    communityId: event.communityId,
    kind: "rsvp",
    payload: { eventId: event.id, guestId: guest.id, memberId: guest.memberId },
    createdAt: new Date().toISOString(),
  });
  return guest;
}

export async function eventChain(store: Store, slug: string) {
  const event = await store.getEventBySlug(slug);
  if (!event) throw new Error("event not found");
  return eventChainFromEvent(store, event);
}

export async function eventChainById(store: Store, eventId: string) {
  const event = await store.getEvent(eventId);
  if (!event) throw new Error("event not found");
  return eventChainFromEvent(store, event);
}

async function eventChainFromEvent(store: Store, event: EventRecord) {
  const proposal = await store.getProposal(event.proposalId);
  const demand = proposal ? await store.getDemand(proposal.demandId) : null;
  const messages = demand
    ? (await Promise.all(demand.messageIds.map((id) => store.getMessage(id)))).filter(Boolean)
    : [];
  return { event, proposal, demand, messages };
}

export async function publicCommunity(store: Store, slug: string, origin: string) {
  const workspace = await store.getWorkspaceBySlug(slug);
  if (!workspace) throw new Error("community not found");
  const events = await store.listEvents(workspace.id);
  return {
    name: workspace.name,
    slug: workspace.slug,
    joinUrl: workspace.joinUrl,
    qrSvg: qrSvg(`${origin}/c/${workspace.slug}`),
    events: events.map((e) => ({ slug: e.slug, title: e.title })),
  };
}

export async function publicEvent(store: Store, slug: string) {
  const event = await store.getEventBySlug(slug);
  if (!event) throw new Error("event not found");
  const workspace = await store.getWorkspace(event.communityId);
  const proposal = await store.getProposal(event.proposalId);
  const venue = proposal?.venueId ? await store.getVenue(proposal.venueId) : null;
  const speakers = proposal
    ? ((await Promise.all(proposal.speakerIds.map((id) => store.getMember(id)))).filter(Boolean) as Member[])
    : [];
  return {
    slug: event.slug,
    title: event.title,
    explanation: proposal?.explanation ?? null,
    qrSvg: event.qrSvg,
    startsAt: event.startsAt,
    publishedAt: event.publishedAt,
    community: { name: workspace?.name ?? "Community", slug: workspace?.slug ?? "" },
    venue: venue ? { name: venue.name, area: venue.area } : null,
    speakers: speakers.map((s) => ({
      name: s.displayName,
      slug: s.publicOptIn ? s.publicSlug : null,
    })),
  };
}

export async function publicMember(store: Store, slug: string) {
  const member = await store.getMemberByPublicSlug(slug);
  if (!member?.publicOptIn || !member.publicSlug) throw new Error("not found");
  return {
    name: member.displayName,
    slug: member.publicSlug,
    do: member.do,
    offer: member.offer,
  };
}

export async function recordEventPageView(store: Store, slug: string) {
  const event = await store.getEventBySlug(slug);
  if (!event) return;
  await store.addTimeline({
    id: createId(),
    communityId: event.communityId,
    kind: "page_view",
    payload: { eventId: event.id, slug },
    createdAt: new Date().toISOString(),
  });
}

export async function assignPublicSlug(store: Store, memberId: string) {
  const member = await store.getMember(memberId);
  if (!member) throw new Error("member not found");
  if (member.publicSlug) return member.publicSlug;
  const base = slugify(member.displayName);
  const taken = await store.getMemberByPublicSlug(base);
  const slug = taken && taken.id !== member.id ? `${base}-${member.id.slice(0, 6)}` : base;
  await store.updateMember(member.id, { publicSlug: slug }, true);
  return slug;
}

export async function generateAutopilot(store: Store, eventId: string, origin: string) {
  const event = await store.getEvent(eventId);
  if (!event) throw new Error("event not found");
  const proposal = await store.getProposal(event.proposalId);
  const workspace = await store.getWorkspace(event.communityId);
  const speakers = proposal
    ? ((await Promise.all(proposal.speakerIds.map((id) => store.getMember(id)))).filter(Boolean) as Member[])
    : [];
  const venue = proposal?.venueId ? await store.getVenue(proposal.venueId) : null;
  const url = `${origin}/e/${event.slug}`;
  const artifacts = await Promise.all([
    store.saveArtifact({
      id: createId(),
      eventId,
      communityId: event.communityId,
      kind: "run_sheet",
      body: runSheet({
        title: event.title,
        speakers: speakers.map((s) => s.displayName),
        venue: venue?.name ?? null,
        startsAt: event.startsAt,
      }),
    }),
    store.saveArtifact({
      id: createId(),
      eventId,
      communityId: event.communityId,
      kind: "post",
      body: promoPost({ title: event.title, url, communityName: workspace?.name ?? "Community" }),
    }),
    store.saveArtifact({
      id: createId(),
      eventId,
      communityId: event.communityId,
      kind: "newsletter",
      body: newsletter({ title: event.title, url, explanation: proposal?.explanation ?? event.title }),
    }),
  ]);
  return artifacts;
}

export async function submitApplication(
  store: Store,
  communityId: string,
  input: { applicant: string; answers: string; communityName: string },
) {
  const hashed = await sha256Hex(input.applicant.trim().toLowerCase());
  const blocked = await store.findBlocklist(communityId, hashed);
  if (blocked?.confirmed) {
    return store.createApplication({
      id: createId(),
      communityId,
      applicant: input.applicant,
      answers: input.answers,
      score: 0,
      decision: "decline",
      reason: "On the confirmed blocklist.",
    });
  }
  const scored = scoreApplication(input.answers, input.communityName);
  return store.createApplication({
    id: createId(),
    communityId,
    applicant: input.applicant,
    answers: input.answers,
    ...scored,
  });
}

/** Full workspace archive. Message bodies are excluded — the export carries
 *  metadata only; quoted text lives in citations. Webhook secrets are included
 *  (operator data). */
export async function exportWorkspace(store: Store, communityId: string) {
  const [
    workspace,
    sources,
    members,
    demands,
    proposals,
    venues,
    sponsors,
    resources,
    files,
    events,
    citations,
    messages,
    timeline,
    applications,
    blocklist,
    webhooks,
  ] = await Promise.all([
    store.getWorkspace(communityId),
    store.listSources(communityId),
    store.listMembers(communityId),
    store.listDemands(communityId),
    store.listProposals(communityId),
    store.listVenues(communityId),
    store.listSponsors(communityId),
    store.listResources(communityId),
    store.listFiles(communityId),
    store.listEvents(communityId),
    store.listCitations(communityId),
    store.listMessages(communityId),
    store.listTimeline(communityId),
    store.listApplications(communityId),
    store.listBlocklist(communityId),
    store.listWebhookSubscriptions(communityId),
  ]);
  const guests = (await Promise.all(events.map((event) => store.listGuests(event.id)))).flat();
  const artifacts = (await Promise.all(events.map((event) => store.listArtifacts(event.id)))).flat();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace,
    sources,
    members,
    demands,
    proposals,
    venues,
    sponsors,
    resources,
    files,
    events,
    guests,
    citations,
    timeline,
    applications,
    blocklist,
    artifacts,
    webhooks,
    messages: messages.map((m) => ({
      id: m.id,
      sourceId: m.sourceId,
      sourceMessageId: m.sourceMessageId,
      authorRaw: m.authorRaw,
      memberId: m.memberId,
      sentAt: m.sentAt,
      isNoise: m.isNoise,
    })),
  };
}
