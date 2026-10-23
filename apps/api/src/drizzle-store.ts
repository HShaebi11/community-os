import { createId, slugify, type LeadRole, type Store, type User } from "@community-os/core";
import {
  apiTokens,
  applications,
  artifacts,
  blocklist,
  citations,
  demands,
  events,
  files,
  guests,
  member,
  members,
  messages,
  organization,
  proposals,
  resources,
  session,
  sources,
  sponsors,
  timeline,
  user,
  venues,
  workspaces,
  type Database,
} from "@community-os/db";
import { and, eq } from "drizzle-orm";

export function createDrizzleStore(db: Database): Store {
  return {
    async upsertUser(email) {
      const existing = await db.select().from(user).where(eq(user.email, email.toLowerCase())).limit(1);
      if (existing[0]) return { id: existing[0].id, email: existing[0].email };
      const row = { id: createId(), name: email, email: email.toLowerCase(), emailVerified: false };
      await db.insert(user).values(row);
      return { id: row.id, email: row.email };
    },
    async createSession(u: User) {
      const token = createId();
      const createdAt = new Date();
      await db.insert(session).values({
        id: createId(),
        token,
        userId: u.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        createdAt,
        updatedAt: createdAt,
      });
      return { token, userId: u.id, email: u.email, createdAt: createdAt.toISOString() };
    },
    async getSession(token) {
      const rows = await db.select().from(session).where(eq(session.token, token)).limit(1);
      const s = rows[0];
      if (!s || s.expiresAt < new Date()) return null;
      const u = await db.select().from(user).where(eq(user.id, s.userId)).limit(1);
      if (!u[0]) return null;
      return { token: s.token, userId: s.userId, email: u[0].email, name: u[0].name, createdAt: s.createdAt.toISOString() };
    },
    async getSessionByApiTokenHash(tokenHash) {
      const rows = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, tokenHash)).limit(1);
      const t = rows[0];
      if (!t || t.revokedAt) return null;
      const u = await db.select().from(user).where(eq(user.id, t.userId)).limit(1);
      if (!u[0]) return null;
      await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, t.id));
      return { token: t.id, userId: t.userId, email: u[0].email, name: u[0].name, createdAt: t.createdAt.toISOString() };
    },
    async createApiToken(input) {
      const row = { id: createId(), ...input, createdAt: new Date() };
      await db.insert(apiTokens).values(row);
      return { ...row, createdAt: row.createdAt.toISOString(), lastUsedAt: null, revokedAt: null };
    },
    async listApiTokens(userId) {
      const rows = await db.select().from(apiTokens).where(eq(apiTokens.userId, userId));
      return rows
        .filter((t) => !t.revokedAt)
        .map((t) => ({
          id: t.id,
          userId: t.userId,
          name: t.name,
          prefix: t.prefix,
          createdAt: t.createdAt.toISOString(),
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
          revokedAt: t.revokedAt?.toISOString() ?? null,
        }));
    },
    async revokeApiToken(id, userId) {
      const rows = await db
        .select()
        .from(apiTokens)
        .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
        .limit(1);
      if (!rows[0] || rows[0].revokedAt) return false;
      await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id));
      return true;
    },
    async createWorkspace(input) {
      let slug = slugify(input.name);
      const id = createId();
      const createdAt = new Date();
      const slugTaken = async (s: string) => {
        const ws = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, s)).limit(1);
        const org = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, s)).limit(1);
        return Boolean(ws[0] || org[0]);
      };
      if (await slugTaken(slug)) slug = `${slug}-${id.slice(0, 6)}`;
      await db.batch([
        db.insert(organization).values({ id, name: input.name, slug, createdAt }),
        db.insert(workspaces).values({
          id,
          name: input.name,
          slug,
          joinUrl: input.joinUrl ?? null,
          createdBy: input.createdBy,
          createdAt,
        }),
        db.insert(member).values({
          id: createId(),
          organizationId: id,
          userId: input.createdBy,
          role: "owner",
          createdAt,
        }),
      ]);
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
      if (patch.name !== undefined) {
        await db.update(organization).set({ name: patch.name }).where(eq(organization.id, id));
      }
      return { ...mapWorkspace(rows[0]), ...set };
    },
    async listWorkspacesForUser(userId) {
      const rows = await db
        .select({ workspace: workspaces, role: member.role })
        .from(member)
        .innerJoin(workspaces, eq(member.organizationId, workspaces.id))
        .where(eq(member.userId, userId));
      return rows.map((r) => ({ ...mapWorkspace(r.workspace), role: r.role as LeadRole }));
    },
    async isLead(workspaceId, userId) {
      const rows = await db
        .select()
        .from(member)
        .where(and(eq(member.organizationId, workspaceId), eq(member.userId, userId)))
        .limit(1);
      return Boolean(rows[0]);
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
        } catch {
          skipped++;
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
      const rows = await db.select().from(members).where(eq(members.communityId, communityId));
      const existing = rows.find((m) => (m.aliases ?? []).some((a) => a.toLowerCase() === displayName.toLowerCase()));
      if (existing) {
        if (lastActive && (!existing.lastActive || new Date(lastActive) > existing.lastActive)) {
          await db.update(members).set({ lastActive: new Date(lastActive) }).where(eq(members.id, existing.id));
          existing.lastActive = new Date(lastActive);
        }
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
      await db.insert(members).values(row);
      return mapMember(row);
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
      const next = { ...member };
      for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
        const value = patch[key];
        if (value === undefined) continue;
        if (!byLead && (key === "do" || key === "want" || key === "offer" || key === "notes" || key === "displayName")) {
          if (member.leadLockedFields.includes(key)) continue;
        }
        if (byLead && (key === "do" || key === "want" || key === "offer" || key === "notes" || key === "displayName")) {
          if (!next.leadLockedFields.includes(key)) next.leadLockedFields.push(key);
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
        const memberIds = [...new Set([...(existing[0].memberIds ?? []), ...demand.memberIds])];
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
      await db.insert(events).values({
        ...event,
        startsAt: event.startsAt ? new Date(event.startsAt) : null,
        publishedAt: new Date(event.publishedAt),
      });
      return event;
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
      return guest;
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
    aliases: row.aliases ?? [],
    do: row.do,
    want: row.want,
    offer: row.offer,
    notes: row.notes,
    publicOptIn: row.publicOptIn,
    publicSlug: row.publicSlug,
    lastActive: row.lastActive?.toISOString() ?? null,
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
    memberIds: row.memberIds ?? [],
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
  };
}
