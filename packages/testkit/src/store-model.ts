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
} from "@community-os/sdk";

/** A deliberately naive reference model of Store semantics — the executable
 *  spec used by model-based tests (the AWS ShardStore pattern). It is a second
 *  independent implementation: where a real adapter diverges from this model,
 *  one of them is wrong.
 *
 *  Model entities use the real entity shapes but carry stable *tags* in place
 *  of ids ("ws:1", "mem:3"). canon() translates a real store's returned ids
 *  into the same tags, so `canon(real.listX(w))` deep-equals `model.listX(w)`
 *  — different ids, identical semantics.
 */
export class StoreModel {
  /** realId -> stable tag */
  readonly tags = new Map<string, string>();
  /** tag -> realId — for translating model references into real calls. */
  readonly realFor = new Map<string, string>();
  private counters = new Map<string, number>();

  workspaces: (Workspace & { role?: string })[] = [];
  sources: Source[] = [];
  members: Member[] = [];
  messages: Message[] = [];
  files: FileRecord[] = [];
  citations: Citation[] = [];
  resources: Resource[] = [];
  demands: Demand[] = [];
  venues: Venue[] = [];
  sponsors: Sponsor[] = [];
  proposals: Proposal[] = [];
  events: EventRecord[] = [];
  guests: Guest[] = [];
  timeline: TimelineEvent[] = [];
  applications: Application[] = [];
  blocklist: BlocklistEntry[] = [];
  artifacts: AutopilotArtifact[] = [];
  webhooks: WebhookSubscription[] = [];
  private dedupe = new Set<string>();

  /** Mint a tag, bind it to the real id both ways. */
  bind(prefix: string, realId: string) {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    const tag = `${prefix}:${n}`;
    this.tags.set(realId, tag);
    this.realFor.set(tag, realId);
    return tag;
  }

  // ---- model-side operations (the spec, simplified) ----

  workspaceSlugTaken(baseSlug: string) {
    return this.workspaces.some((w) => w.slug === baseSlug);
  }

  upsertMember(communityId: string, displayName: string, lastActive: string | null) {
    const name = displayName.trim();
    const existing = this.members.find(
      (m) =>
        m.communityId === communityId &&
        (m.displayName.trim().toLowerCase() === name.toLowerCase() ||
          m.aliases.some((a) => a.trim().toLowerCase() === name.toLowerCase())),
    );
    if (existing) {
      if (lastActive && (!existing.lastActive || lastActive > existing.lastActive)) {
        existing.lastActive = canonIso(lastActive);
      }
      return { member: existing, created: false };
    }
    const member: Member = {
      id: "",
      communityId,
      displayName: name,
      aliases: [name],
      do: null,
      want: null,
      offer: null,
      notes: null,
      publicOptIn: false,
      publicSlug: null,
      lastActive: lastActive ? canonIso(lastActive) : null,
      leadLockedFields: [],
    };
    this.members.push(member);
    return { member, created: true };
  }

  updateMember(tag: string, patch: Partial<Member>, byLead: boolean) {
    const member = this.members.find((m) => m.id === tag);
    if (!member) throw new Error("member not found");
    if (patch.publicSlug != null && this.members.some((m) => m.id !== tag && m.publicSlug === patch.publicSlug)) {
      throw new Error("public slug taken");
    }
    if (patch.displayName != null && (byLead || !member.leadLockedFields.includes("displayName"))) {
      const norm = String(patch.displayName).trim().toLowerCase();
      if (
        this.members.some(
          (m) => m.id !== tag && m.communityId === member.communityId && m.displayName.trim().toLowerCase() === norm,
        )
      ) {
        throw new Error("display name taken");
      }
    }
    const editable = new Set(["do", "want", "offer", "notes", "displayName", "publicOptIn", "publicSlug"]);
    const lockable = new Set(["do", "want", "offer", "notes", "displayName"]);
    for (const key of Object.keys(patch) as Array<keyof Member>) {
      if (!editable.has(key)) continue;
      const value = patch[key];
      if (value === undefined) continue;
      if (!byLead && lockable.has(key) && member.leadLockedFields.includes(key as Member["leadLockedFields"][number])) {
        continue;
      }
      if (byLead && lockable.has(key)) {
        const lock = key as Member["leadLockedFields"][number];
        if (!member.leadLockedFields.includes(lock)) member.leadLockedFields.push(lock);
      }
      (member as Record<string, unknown>)[key] = value;
    }
    return member;
  }

  insertMessages(batch: Message[]) {
    let inserted = 0;
    let skipped = 0;
    for (const m of batch) {
      const key = `${m.communityId}||${m.sourceId}||${m.sourceMessageId}`;
      if (this.dedupe.has(key)) {
        skipped++;
        continue;
      }
      this.dedupe.add(key);
      this.messages.push(m);
      inserted++;
    }
    return { inserted, skipped };
  }

  upsertDemand(input: Demand) {
    const existing = this.demands.find((d) => d.communityId === input.communityId && d.topic === input.topic);
    if (existing) {
      existing.memberIds = [...new Set([...existing.memberIds, ...input.memberIds])];
      existing.messageIds = [...new Set([...existing.messageIds, ...input.messageIds])];
      existing.updatedAt = input.updatedAt;
      existing.title = input.title ?? existing.title;
      existing.oneLiner = input.oneLiner ?? existing.oneLiner;
      return existing;
    }
    this.demands.push(input);
    return input;
  }

  upsertResource(input: Resource) {
    const existing = this.resources.find((r) => r.communityId === input.communityId && r.url === input.url);
    if (existing) return existing;
    this.resources.push(input);
    return input;
  }

  upsertVenue(input: Venue) {
    const i = this.venues.findIndex((v) => v.id === input.id);
    if (i >= 0) this.venues[i] = input;
    else this.venues.push(input);
    return input;
  }

  upsertSponsor(input: Sponsor) {
    const i = this.sponsors.findIndex((s) => s.id === input.id);
    if (i >= 0) this.sponsors[i] = input;
    else this.sponsors.push(input);
    return input;
  }

  updateProposal(tag: string, patch: Partial<Proposal>) {
    const p = this.proposals.find((x) => x.id === tag);
    if (!p) throw new Error("proposal not found");
    Object.assign(p, patch);
    return p;
  }

  updateGuest(tag: string, patch: { name?: string; memberId?: string | null }) {
    const g = this.guests.find((x) => x.id === tag);
    if (!g) throw new Error("guest not found");
    if (patch.name !== undefined) g.name = patch.name;
    if (patch.memberId !== undefined) g.memberId = patch.memberId;
    return g;
  }

  updateApplication(tag: string, patch: Partial<Application>) {
    const a = this.applications.find((x) => x.id === tag);
    if (!a) throw new Error("application not found");
    Object.assign(a, patch);
    return a;
  }

  // ---- ordered reads mirroring the contract ----

  listMessages(communityId: string) {
    return this.messages
      .filter((m) => m.communityId === communityId)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  }

  listDemands(communityId: string) {
    return this.demands
      .filter((d) => d.communityId === communityId)
      .sort((a, b) => b.memberIds.length - a.memberIds.length || b.updatedAt.localeCompare(a.updatedAt));
  }

  listTimeline(communityId: string) {
    return this.timeline
      .filter((t) => t.communityId === communityId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

/** Canonicalize a real-store value into model space: real ids -> tags, and
 *  timestamps -> canonical ISO (Postgres emits .000Z where a verbatim store
 *  echoes input — same instant, different representation). */
export function canon(v: unknown, tags: Map<string, string>): unknown {
  if (typeof v === "string") {
    const mapped = tags.get(v);
    if (mapped) return mapped;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) && !Number.isNaN(Date.parse(v))) {
      return canonIso(v);
    }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => canon(x, tags));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, canon(x, tags)]));
  }
  return v;
}

export function canonIso(v: string) {
  return new Date(v).toISOString();
}
