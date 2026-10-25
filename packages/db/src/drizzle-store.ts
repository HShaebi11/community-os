import { createId, slugify, type Store } from "@community-os/core";
import {
  applications,
  artifacts,
  blocklist,
  citations,
  demands,
  events,
  files,
  guests,
  members,
  messages,
  proposals,
  resources,
  sources,
  sponsors,
  timeline,
  venues,
  webhookSubscriptions,
  workspaces,
  } from "./schema.ts";
import type { Database } from "./index.ts";
import { and, eq, lt, sql } from "drizzle-orm";

export function createDrizzleStore(db: Database): Store {
  return {
    async createWorkspace(input) {
      let slug = slugify(input.name);
      const id = createId();
      const createdAt = new Date();
      const slugTaken = async (s: string) => {
        const ws = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, s)).limit(1);
        return Boolean(ws[0]);
      };
      if (await slugTaken(slug)) slug = `${slug}-${id.slice(0, 6)}`;
      await db.insert(workspaces).values({
        id,
        name: input.name,
        slug,
        joinUrl: input.joinUrl ?? null,
        createdBy: input.createdBy,
        createdAt,
      });
      return { id, name: input.name, slug, joinUrl: input.joinUrl ?? null, createdBy: input.createdBy, createdAt: createdAt.toISOString() };
    },
    async getWorkspace(id) {
      const rows = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
      return rows[0] ? mapWorkspace(rows[0]) : null;
    },
    async getWorkspaceBySlug(slug) {
      const rows = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
      return rows[0] ? mapWorkspace(rows[0]) : null;
    },
    async updateWorkspace(id, patch) {
      const rows = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
      if (!rows[0]) throw new Error("workspace not found");
      const set: Partial<typeof workspaces.$inferInsert> = {};
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.joinUrl !== undefined) set.joinUrl = patch.joinUrl;
      if (Object.keys(set).length) await db.update(workspaces).set(set).where(eq(workspaces.id, id));
      return { ...mapWorkspace(rows[0]), ...set };
    },
    async listWorkspaces() {
      const rows = await db.select().from(workspaces);
      return rows.map((r) => ({ ...mapWorkspace(r), role: "owner" as const }));
    },
    async createSource(input) {
      const id = createId();
      await db.insert(sources).values({ id, ...input });
      return { id, ...input };
    },
    async listSources(communityId) {
      return db.select().from(sources).where(eq(sources.communityId, communityId));
    },
    async insertMessages(list) {
      let inserted = 0;
      let skipped = 0;
      for (const message of list) {
        try {
          await db.insert(messages).values({
            ...message,
            sentAt: new Date(message.sentAt),
          });
          inserted++;
        } catch (error) {
          // Only unique-violation counts as a dedupe skip; real failures (FK,
          // connection, schema) must surface instead of being silently eaten.
          // Drizzle wraps driver errors — the SQLSTATE lives on the cause.
          const e = error as { code?: string; cause?: { code?: string } };
          if (e.code === "23505" || e.cause?.code === "23505") skipped++;
          else throw error;
        }
      }
      return { inserted, skipped };
    },
    async listMessages(communityId) {
      const rows = await db.select().from(messages).where(eq(messages.communityId, communityId));
      return rows.map(mapMessage).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    },
    async getMessage(id) {
      const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
      return rows[0] ? mapMessage(rows[0]) : null;
    },
    async insertFiles(list) {
      if (!list.length) return;
      await db.insert(files).values(list);
    },
    async listFiles(communityId) {
      return db.select().from(files).where(eq(files.communityId, communityId));
    },
    async upsertMember(communityId, displayName, lastActive) {
      displayName = displayName.trim();
      const rows = await db.select().from(members).where(eq(members.communityId, communityId));
      const byName = (m: (typeof rows)[number]) =>
        m.displayName.trim().toLowerCase() === displayName.toLowerCase() ||
        /* v8 ignore next -- aliases is notNull with default [] */
        (m.aliases ?? []).some((a) => a.trim().toLowerCase() === displayName.toLowerCase());
      // Monotonic and atomic — GREATEST ignores NULL and never regresses,
      // so racing upserts can't roll the winner's timestamp back.
      const advance = async (member: (typeof rows)[number]) => {
        if (!lastActive) return;
        const ts = new Date(lastActive);
        if (member.lastActive && member.lastActive >= ts) return;
        await db
          .update(members)
          .set({ lastActive: sql`greatest(${members.lastActive}, ${ts})` })
          .where(eq(members.id, member.id));
        member.lastActive = ts;
      };
      const existing = rows.find(byName);
      if (existing) {
        await advance(existing);
        return mapMember(existing);
      }
      const row = {
        id: createId(),
        communityId,
        displayName,
        aliases: [displayName],
        do: null,
        want: null,
        offer: null,
        notes: null,
        lastActive: lastActive ? new Date(lastActive) : null,
        publicOptIn: false,
        publicSlug: null,
        leadLockedFields: [] as string[],
      };
      const inserted = await db.insert(members).values(row).onConflictDoNothing().returning();
      if (inserted[0]) return mapMember(inserted[0]);
      // Lost a concurrent same-name insert — the members_name_norm index made
      // it a no-op, so the winner now exists. Re-read them and apply the same
      // lastActive advance the direct path would have.
      const raced = rows
        .concat(await db.select().from(members).where(eq(members.communityId, communityId)))
        .find(byName);
      /* v8 ignore next -- onConflictDoNothing only fires on our two member indexes; a non-name conflict rethrows below */
      if (!raced) throw new Error("member upsert conflict");
      await advance(raced);
      return mapMember(raced);
    },
    async listMembers(communityId) {
      const rows = await db.select().from(members).where(eq(members.communityId, communityId));
      return rows.map(mapMember);
    },
    async getMember(id) {
      const rows = await db.select().from(members).where(eq(members.id, id)).limit(1);
      return rows[0] ? mapMember(rows[0]) : null;
    },
    async getMemberBySlug(communityId, slug) {
      const rows = await db
        .select()
        .from(members)
        .where(and(eq(members.communityId, communityId), eq(members.publicSlug, slug)))
        .limit(1);
      return rows[0] ? mapMember(rows[0]) : null;
    },
    async getMemberByPublicSlug(slug) {
      const rows = await db.select().from(members).where(eq(members.publicSlug, slug));
      const opted = rows.find((m) => m.publicOptIn);
      return opted ? mapMember(opted) : null;
    },
    async updateMember(id, patch, byLead) {
      const member = await this.getMember(id);
      if (!member) throw new Error("member not found");
      const editable = new Set(["do", "want", "offer", "notes", "displayName", "publicOptIn", "publicSlug"]);
      const lockable = new Set(["do", "want", "offer", "notes", "displayName"]);
      const next = { ...member };
      for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
        if (!editable.has(key)) continue;
        const value = patch[key];
        if (value === undefined) continue;
        if (!byLead && lockable.has(key) && member.leadLockedFields.includes(key as (typeof member.leadLockedFields)[number])) {
          continue;
        }
        if (byLead && lockable.has(key)) {
          const lock = key as (typeof next.leadLockedFields)[number];
          if (!next.leadLockedFields.includes(lock)) next.leadLockedFields.push(lock);
        }
        (next as Record<string, unknown>)[key] = value;
      }
      await db
        .update(members)
        .set({
          displayName: next.displayName,
          do: next.do,
          want: next.want,
          offer: next.offer,
          notes: next.notes,
          publicOptIn: next.publicOptIn,
          publicSlug: next.publicSlug,
          leadLockedFields: next.leadLockedFields,
        })
        .where(eq(members.id, id));
      return next;
    },
    async insertCitations(list) {
      if (!list.length) return;
      await db.insert(citations).values(list);
    },
    async listCitations(communityId, objectType, objectId) {
      const rows = await db.select().from(citations).where(eq(citations.communityId, communityId));
      return rows.filter((c) => (!objectType || c.objectType === objectType) && (!objectId || c.objectId === objectId));
    },
    async upsertResource(resource) {
      const existing = await db
        .select()
        .from(resources)
        .where(and(eq(resources.communityId, resource.communityId), eq(resources.url, resource.url)))
        .limit(1);
      if (existing[0]) return existing[0];
      await db.insert(resources).values(resource);
      return resource;
    },
    async listResources(communityId) {
      return db.select().from(resources).where(eq(resources.communityId, communityId));
    },
    async upsertDemand(demand) {
      const existing = await db
        .select()
        .from(demands)
        .where(and(eq(demands.communityId, demand.communityId), eq(demands.topic, demand.topic)))
        .limit(1);
      if (existing[0]) {
        /* v8 ignore next -- member_ids is notNull with default [] */
        const memberIds = [...new Set([...(existing[0].memberIds ?? []), ...demand.memberIds])];
        /* v8 ignore next -- message_ids is notNull with default [] */
        const messageIds = [...new Set([...(existing[0].messageIds ?? []), ...demand.messageIds])];
        await db
          .update(demands)
          .set({
            memberIds,
            messageIds,
            updatedAt: new Date(demand.updatedAt),
            title: demand.title ?? existing[0].title,
            oneLiner: demand.oneLiner ?? existing[0].oneLiner,
          })
          .where(eq(demands.id, existing[0].id));
        return {
          ...demand,
          id: existing[0].id,
          memberIds,
          messageIds,
          title: demand.title ?? existing[0].title,
          oneLiner: demand.oneLiner ?? existing[0].oneLiner,
        };
      }
      await db.insert(demands).values({ ...demand, updatedAt: new Date(demand.updatedAt) });
      return demand;
    },
    async listDemands(communityId) {
      const rows = await db.select().from(demands).where(eq(demands.communityId, communityId));
      return rows
        .map(mapDemand)
        .sort((a, b) => b.memberIds.length - a.memberIds.length || b.updatedAt.localeCompare(a.updatedAt));
    },
    async getDemand(id) {
      const rows = await db.select().from(demands).where(eq(demands.id, id)).limit(1);
      return rows[0] ? mapDemand(rows[0]) : null;
    },
    async upsertVenue(venue) {
      await db.insert(venues).values(venue).onConflictDoUpdate({ target: venues.id, set: venue });
      return venue;
    },
    async listVenues(communityId) {
      return db.select().from(venues).where(eq(venues.communityId, communityId));
    },
    async getVenue(id) {
      const rows = await db.select().from(venues).where(eq(venues.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async upsertSponsor(sponsor) {
      await db.insert(sponsors).values(sponsor).onConflictDoUpdate({ target: sponsors.id, set: sponsor });
      return sponsor;
    },
    async getSponsor(id) {
      const rows = await db.select().from(sponsors).where(eq(sponsors.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async listSponsors(communityId) {
      return db.select().from(sponsors).where(eq(sponsors.communityId, communityId));
    },
    async createProposal(proposal) {
      await db.insert(proposals).values(proposal);
      return proposal;
    },
    async updateProposal(id, patch) {
      const current = await this.getProposal(id);
      if (!current) throw new Error("proposal not found");
      const next = { ...current, ...patch };
      await db.update(proposals).set(next).where(eq(proposals.id, id));
      return next;
    },
    async getProposal(id) {
      const rows = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async listProposals(communityId) {
      return db.select().from(proposals).where(eq(proposals.communityId, communityId));
    },
    async createEvent(event) {
      const row = {
        ...event,
        startsAt: event.startsAt ? new Date(event.startsAt) : null,
        publishedAt: new Date(event.publishedAt),
      };
      // Upsert by id: re-saving the same event is an idempotent write, while
      // a different id reusing the slug fails on the unique slug index.
      // rsvpCount is store-owned — a resave of a stale record must not
      // rewind the seat counter.
      const rows = await db
        .insert(events)
        .values(row)
        .onConflictDoUpdate({
          target: events.id,
          set: { ...row, rsvpCount: sql`${events.rsvpCount}` },
        })
        .returning();
      return mapEvent(rows[0]!);
    },
    async getEventBySlug(slug) {
      const rows = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
      return rows[0] ? mapEvent(rows[0]) : null;
    },
    async getEvent(id) {
      const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
      return rows[0] ? mapEvent(rows[0]) : null;
    },
    async listEvents(communityId) {
      const rows = await db.select().from(events).where(eq(events.communityId, communityId));
      return rows.map(mapEvent);
    },
    async createGuest(guest) {
      await db.insert(guests).values(guest);
      // rsvpCount tracks every guest row so it always equals the real count —
      // rsvpGuest claims against it, and raw inserts through here keep pace.
      await db.update(events).set({ rsvpCount: sql`${events.rsvpCount} + 1` }).where(eq(events.id, guest.eventId));
      return guest;
    },
    async rsvpGuest(guest, capacity) {
      // Upsert first: under the (event_id, email) unique index a repeated RSVP
      // atomically updates the winner's row — even when it arrives while the
      // event is already full. RETURNING exposes the winner's id, so a dedupe
      // is detectable by id mismatch.
      const rows = await db
        .insert(guests)
        .values(guest)
        .onConflictDoUpdate({
          target: [guests.eventId, guests.email],
          set: {
            name: guest.name,
            memberId: sql`coalesce(excluded.member_id, ${guests.memberId})`,
          },
        })
        .returning();
      const row = rows[0]!;
      const created = row.id === guest.id;
      if (!created) return { guest: row, created: false };
      // Every created guest counts a seat — capped claims add the
      // rsvp_count < capacity predicate, which takes the event row lock and
      // re-checks on the latest committed row so concurrent instances can't
      // both pass the gate. Works on the neon-http driver, which has no
      // interactive transactions. An uncapped bump on a missing event is a
      // no-op, matching the other stores.
      const claimed = await db
        .update(events)
        .set({ rsvpCount: sql`${events.rsvpCount} + 1` })
        .where(
          capacity != null
            ? and(eq(events.id, guest.eventId), lt(events.rsvpCount, capacity))
            : eq(events.id, guest.eventId),
        )
        .returning({ id: events.id });
      if (!claimed[0] && capacity != null) {
        // No seat left — remove the row we just inserted so the guest
        // count and the seat counter stay in lockstep.
        await db.delete(guests).where(eq(guests.id, guest.id));
        throw new Error(`event at capacity (${capacity})`);
      }
      return { guest: row, created: true };
    },
    async updateGuest(id, patch) {
      const rows = await db.select().from(guests).where(eq(guests.id, id)).limit(1);
      if (!rows[0]) throw new Error("guest not found");
      const next = { ...rows[0], ...patch };
      await db.update(guests).set({ name: next.name, memberId: next.memberId }).where(eq(guests.id, id));
      return next;
    },
    async listGuests(eventId) {
      return db.select().from(guests).where(eq(guests.eventId, eventId));
    },
    async addTimeline(event) {
      await db.insert(timeline).values({ ...event, createdAt: new Date(event.createdAt) });
    },
    async listTimeline(communityId) {
      const rows = await db.select().from(timeline).where(eq(timeline.communityId, communityId));
      return rows
        .map((t) => ({
          id: t.id,
          communityId: t.communityId,
          kind: t.kind,
          payload: t.payload as Record<string, unknown>,
          createdAt: t.createdAt.toISOString(),
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async createApplication(application) {
      await db.insert(applications).values(application);
      return application;
    },
    async updateApplication(id, patch) {
      const rows = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
      if (!rows[0]) throw new Error("application not found");
      const next = { ...rows[0], ...patch };
      await db.update(applications).set(next).where(eq(applications.id, id));
      return next;
    },
    async listApplications(communityId) {
      return db.select().from(applications).where(eq(applications.communityId, communityId));
    },
    async addBlocklist(entry) {
      await db.insert(blocklist).values(entry);
      return entry;
    },
    async listBlocklist(communityId) {
      return db.select().from(blocklist).where(eq(blocklist.communityId, communityId));
    },
    async findBlocklist(communityId, hash) {
      const rows = await db
        .select()
        .from(blocklist)
        .where(and(eq(blocklist.communityId, communityId), eq(blocklist.hash, hash)))
        .limit(1);
      return rows[0] ?? null;
    },
    async saveArtifact(artifact) {
      await db.insert(artifacts).values(artifact);
      return artifact;
    },
    async listArtifacts(eventId) {
      return db.select().from(artifacts).where(eq(artifacts.eventId, eventId));
    },
    async createWebhookSubscription(input) {
      const sub = { id: createId(), createdAt: new Date(), ...input };
      await db.insert(webhookSubscriptions).values(sub);
      return { ...sub, createdAt: sub.createdAt.toISOString() };
    },
    async listWebhookSubscriptions(communityId) {
      const rows = await db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.communityId, communityId));
      return rows.map((row) => ({ ...row, kinds: /* v8 ignore next -- kinds is notNull with default [] */ row.kinds ?? [], createdAt: row.createdAt.toISOString() }));
    },
    async deleteWebhookSubscription(id) {
      const rows = await db
        .delete(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, id))
        .returning({ id: webhookSubscriptions.id });
      return rows.length > 0;
    },
  } as Store;
}

function mapWorkspace(row: typeof workspaces.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    joinUrl: row.joinUrl,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapMessage(row: typeof messages.$inferSelect) {
  return {
    ...row,
    sentAt: row.sentAt.toISOString(),
  };
}

function mapMember(row: {
  id: string;
  communityId: string;
  displayName: string;
  aliases: string[] | null;
  do: string | null;
  want: string | null;
  offer: string | null;
  notes: string | null;
  publicOptIn: boolean;
  publicSlug: string | null;
  lastActive: Date | null;
  leadLockedFields: string[] | null;
}) {
  return {
    id: row.id,
    communityId: row.communityId,
    displayName: row.displayName,
    /* v8 ignore next -- aliases is notNull with default [] */
    aliases: row.aliases ?? [],
    do: row.do,
    want: row.want,
    offer: row.offer,
    notes: row.notes,
    publicOptIn: row.publicOptIn,
    publicSlug: row.publicSlug,
    lastActive: row.lastActive?.toISOString() ?? null,
    /* v8 ignore next -- lead_locked_fields is notNull with default [] */
    leadLockedFields: (row.leadLockedFields ?? []) as Array<"do" | "want" | "offer" | "notes" | "displayName">,
  };
}

function mapDemand(row: typeof demands.$inferSelect) {
  return {
    id: row.id,
    communityId: row.communityId,
    topic: row.topic,
    title: row.title,
    oneLiner: row.oneLiner,
    /* v8 ignore next -- member_ids is notNull with default [] */
    memberIds: row.memberIds ?? [],
    /* v8 ignore next -- message_ids is notNull with default [] */
    messageIds: row.messageIds ?? [],
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapEvent(row: typeof events.$inferSelect) {
  return {
    id: row.id,
    communityId: row.communityId,
    proposalId: row.proposalId,
    slug: row.slug,
    title: row.title,
    startsAt: row.startsAt?.toISOString() ?? null,
    qrSvg: row.qrSvg,
    publishedAt: row.publishedAt.toISOString(),
    rsvpCount: row.rsvpCount,
  };
}
