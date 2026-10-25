import { afterEach, describe, expect, it } from "vitest";
import type { Store } from "@community-os/sdk";
import {
  application,
  artifact,
  blocklistEntry,
  citation,
  demand,
  eventRecord,
  fileRecord,
  guest,
  makeId,
  message,
  proposal,
  resource,
  sponsor,
  timelineEvent,
  venue,
} from "./fixtures.ts";

/** The executable definition of the Store contract — every Store adapter
 *  (MemoryStore, SqliteStore, Drizzle, community-contributed) must pass this
 *  identical suite. Semantics are pinned to MemoryStore, the reference impl.
 *
 *  Referential integrity is part of the contract: tests seed real workspaces,
 *  sources, and events before inserting dependents, so adapters backed by
 *  foreign-key-constrained databases (Drizzle/Postgres) can satisfy it.
 *
 *  Usage:  testStoreContract("SqliteStore", () => new SqliteStore(), s => s.close());
 */
export function testStoreContract<S extends Store>(
  storeName: string,
  factory: () => S | Promise<S>,
  teardown?: (store: S) => void | Promise<void>,
) {
  describe(`${storeName} — store contract`, () => {
    const created: S[] = [];
    const fresh = async () => {
      const s = await factory();
      created.push(s);
      return s;
    };
    afterEach(async () => {
      for (const s of created.splice(0)) await teardown?.(s);
    });

    /** A workspace + a second workspace + a source — the real entities every
     *  dependent insert references on constraint-backed stores. */
    const seed = async (s: S) => {
      const ws = await s.createWorkspace({ name: "W", createdBy: "lead" });
      const other = await s.createWorkspace({ name: "Other", createdBy: "lead" });
      const src = await s.createSource({ communityId: ws.id, kind: "chat", name: "#general" });
      return { ws, other, src };
    };

    describe("workspaces", () => {
      it("creates a workspace with a slug derived from its name", async () => {
        const s = await fresh();
        const w = await s.createWorkspace({ name: "Sunrise Bakers", createdBy: "lead" });
        expect(w.id).toBeTruthy();
        expect(w.slug).toBe("sunrise-bakers");
        expect(w.joinUrl).toBeNull();
        expect(await s.getWorkspace(w.id)).toMatchObject({ name: "Sunrise Bakers" });
      });

      it("keeps slugs unique when names collide", async () => {
        const s = await fresh();
        const a = await s.createWorkspace({ name: "Same Name", createdBy: "lead" });
        const b = await s.createWorkspace({ name: "Same Name", createdBy: "lead" });
        expect(a.slug).not.toBe(b.slug);
      });

      it("resolves by slug and returns null for unknown lookups", async () => {
        const s = await fresh();
        const w = await s.createWorkspace({ name: "Lookup", createdBy: "lead" });
        expect((await s.getWorkspaceBySlug(w.slug))?.id).toBe(w.id);
        expect(await s.getWorkspaceBySlug("nope")).toBeNull();
        expect(await s.getWorkspace("nope")).toBeNull();
      });

      it("patches name and joinUrl, and clears joinUrl with null", async () => {
        const s = await fresh();
        const w = await s.createWorkspace({ name: "W", createdBy: "lead" });
        await s.updateWorkspace(w.id, { name: "W2", joinUrl: "https://join" });
        await s.updateWorkspace(w.id, { joinUrl: null });
        const got = await s.getWorkspace(w.id);
        expect(got?.name).toBe("W2");
        expect(got?.joinUrl).toBeNull();
        await expect(s.updateWorkspace("nope", { name: "x" })).rejects.toThrow();
      });

      it("lists every workspace with role owner", async () => {
        const s = await fresh();
        await s.createWorkspace({ name: "A", createdBy: "lead" });
        await s.createWorkspace({ name: "B", createdBy: "lead" });
        const list = await s.listWorkspaces();
        expect(list.length).toBe(2);
        expect(list.every((w) => w.role === "owner")).toBe(true);
      });
    });

    describe("sources", () => {
      it("creates sources and lists them per community", async () => {
        const s = await fresh();
        const { ws, other, src } = await seed(s);
        await s.createSource({ communityId: other.id, kind: "slack", name: "#town" });
        const list = await s.listSources(ws.id);
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe(src.id);
        expect(list[0].kind).toBe("chat");
      });
    });

    describe("messages + files", () => {
      it("dedupes on (communityId, sourceId, sourceMessageId) not message id", async () => {
        const s = await fresh();
        const { ws, src } = await seed(s);
        const m = message({ communityId: ws.id, sourceId: src.id, sourceMessageId: "ext-1" });
        expect(await s.insertMessages([m])).toEqual({ inserted: 1, skipped: 0 });
        expect(await s.insertMessages([{ ...m, id: makeId() }])).toEqual({ inserted: 0, skipped: 1 });
      });

      it("does NOT dedupe the same platform id across different sources", async () => {
        const s = await fresh();
        const { ws, src } = await seed(s);
        const src2 = await s.createSource({ communityId: ws.id, kind: "chat", name: "#other" });
        // Platform ids are only unique within their source — a Slack "1" and a
        // Discord "1" are different messages and both must land.
        const res = await s.insertMessages([
          message({ communityId: ws.id, sourceId: src.id, sourceMessageId: "1" }),
          message({ communityId: ws.id, sourceId: src2.id, sourceMessageId: "1" }),
        ]);
        expect(res).toEqual({ inserted: 2, skipped: 0 });
        expect(await s.listMessages(ws.id)).toHaveLength(2);
      });

      it("dedupes within a single batch and across concurrent calls", async () => {
        const s = await fresh();
        const { ws, src } = await seed(s);
        const batch = [
          message({ communityId: ws.id, sourceId: src.id, sourceMessageId: "a" }),
          message({ communityId: ws.id, sourceId: src.id, sourceMessageId: "a" }),
          message({ communityId: ws.id, sourceId: src.id, sourceMessageId: "b" }),
        ];
        expect(await s.insertMessages(batch)).toEqual({ inserted: 2, skipped: 1 });
        // Two overlapping deliveries racing (webhook retry + live event) must
        // still net exactly the unique ids — the dedupe check is atomic.
        const overlap = [
          message({ communityId: ws.id, sourceId: src.id, sourceMessageId: "b" }),
          message({ communityId: ws.id, sourceId: src.id, sourceMessageId: "c" }),
        ];
        const [r1, r2] = await Promise.all([s.insertMessages(overlap), s.insertMessages(overlap)]);
        expect(r1.inserted + r2.inserted).toBe(1);
        expect(r1.skipped + r2.skipped).toBe(3);
        expect(await s.listMessages(ws.id)).toHaveLength(3);
      });

      it("round-trips hostile strings verbatim — injection, unicode, control chars", async () => {
        const s = await fresh();
        const { ws, src } = await seed(s);
        const bodies = [
          `'; DROP TABLE messages; --`,
          `" OR "1"="1`,
          "emoji 👋🏽 and rtl \u202Etxet and accents café naïve",
          "null byte inline",
          "line1\nline2\r\nline3\ttab",
          "x".repeat(50_000),
        ];
        for (const [i, body] of bodies.entries()) {
          await s.insertMessages([message({ communityId: ws.id, sourceId: src.id, sourceMessageId: `h${i}`, body })]);
        }
        const list = await s.listMessages(ws.id);
        expect(list).toHaveLength(bodies.length);
        for (const [i, body] of bodies.entries()) {
          expect(list.find((m) => m.sourceMessageId === `h${i}`)?.body).toBe(body);
        }
      });

      it("counts the same platform id in a different community as distinct", async () => {
        const s = await fresh();
        const { ws, other, src } = await seed(s);
        const src2 = await s.createSource({ communityId: other.id, kind: "chat", name: "#o" });
        const res = await s.insertMessages([
          message({ communityId: ws.id, sourceId: src.id, sourceMessageId: "ext-1" }),
          message({ communityId: other.id, sourceId: src2.id, sourceMessageId: "ext-1" }),
        ]);
        expect(res).toEqual({ inserted: 2, skipped: 0 });
      });

      it("lists messages sorted by sentAt; getMessage resolves or nulls", async () => {
        const s = await fresh();
        const { ws, src } = await seed(s);
        const m1 = message({ communityId: ws.id, sourceId: src.id, sentAt: "2025-01-02T00:00:00Z" });
        const m2 = message({ communityId: ws.id, sourceId: src.id, sentAt: "2025-01-01T00:00:00.000Z" });
        await s.insertMessages([m1, m2]);
        const list = await s.listMessages(ws.id);
        expect(list.map((m) => m.id)).toEqual([m2.id, m1.id]);
        expect((await s.getMessage(m1.id))?.body).toBe(m1.body);
        expect(await s.getMessage("nope")).toBeNull();
      });

      it("stores files and lists them per community", async () => {
        const s = await fresh();
        const { ws, other } = await seed(s);
        await s.insertFiles([fileRecord({ communityId: ws.id }), fileRecord({ communityId: other.id })]);
        expect(await s.listFiles(ws.id)).toHaveLength(1);
      });
    });

    describe("members", () => {
      it("creates a member with sane defaults", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        const m = await s.upsertMember(ws.id, "Ada", "2025-01-01T00:00:00.000Z");
        expect(m.aliases).toEqual(["Ada"]);
        expect(m.publicOptIn).toBe(false);
        expect(m.leadLockedFields).toEqual([]);
        expect(m.lastActive).toBe("2025-01-01T00:00:00.000Z");
      });

      it("matches aliases case-insensitively and only moves lastActive forward", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        const a = await s.upsertMember(ws.id, "Ada", "2025-02-01T00:00:00.000Z");
        const older = await s.upsertMember(ws.id, "ADA", "2025-01-01T00:00:00.000Z");
        expect(older.id).toBe(a.id);
        expect(older.lastActive).toBe("2025-02-01T00:00:00.000Z");
        const newer = await s.upsertMember(ws.id, "ada", "2025-03-01T00:00:00.000Z");
        expect(newer.lastActive).toBe("2025-03-01T00:00:00.000Z");
        expect(await s.listMembers(ws.id)).toHaveLength(1);
      });

      it("normalizes padded names — ' Ada ' is the same member as 'Ada'", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        // Adapters upstream pass raw author strings; padding must not fork the
        // member into two identities.
        const a = await s.upsertMember(ws.id, "Ada", null);
        const padded = await s.upsertMember(ws.id, "  Ada  ", "2025-01-01T00:00:00.000Z");
        expect(padded.id).toBe(a.id);
        expect(await s.listMembers(ws.id)).toHaveLength(1);
      });

      it("resolves members by slug within a community, and by public slug only when opted in", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        const m = await s.upsertMember(ws.id, "Ada", null);
        await s.updateMember(m.id, { publicSlug: "ada" }, false);
        expect((await s.getMemberBySlug(ws.id, "ada"))?.id).toBe(m.id);
        expect(await s.getMemberByPublicSlug("ada")).toBeNull();
        await s.updateMember(m.id, { publicOptIn: true }, false);
        expect((await s.getMemberByPublicSlug("ada"))?.id).toBe(m.id);
      });

      it("lead edits lock fields; non-lead writes cannot overwrite locked fields", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        const m = await s.upsertMember(ws.id, "Ada", null);
        await s.updateMember(m.id, { do: "lead says baker" }, true);
        const blocked = await s.updateMember(m.id, { do: "auto-extract" }, false);
        expect(blocked.do).toBe("lead says baker");
        expect(blocked.leadLockedFields).toContain("do");
        const allowed = await s.updateMember(m.id, { want: "still writable" }, false);
        expect(allowed.want).toBe("still writable");
      });

      it("ignores non-editable fields and throws on unknown member", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        const m = await s.upsertMember(ws.id, "Ada", null);
        const updated = await s.updateMember(m.id, { displayName: "Ada L" }, false);
        expect(updated.displayName).toBe("Ada L");
        await expect(s.updateMember("nope", { do: "x" }, false)).rejects.toThrow();
      });
    });

    describe("citations + resources", () => {
      it("filters citations by object type and id", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        await s.insertCitations([
          citation({ communityId: ws.id, objectType: "member", objectId: "m1" }),
          citation({ communityId: ws.id, objectType: "demand", objectId: "d1" }),
          citation({ communityId: ws.id, objectType: "member", objectId: "m2" }),
        ]);
        expect(await s.listCitations(ws.id)).toHaveLength(3);
        expect(await s.listCitations(ws.id, "member")).toHaveLength(2);
        expect(await s.listCitations(ws.id, "member", "m2")).toHaveLength(1);
      });

      it("dedupes resources by (communityId, url)", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        const r = resource({ communityId: ws.id, url: "https://x" });
        const first = await s.upsertResource(r);
        const second = await s.upsertResource({ ...r, id: makeId(), title: "different" });
        expect(second.id).toBe(first.id);
        expect(await s.listResources(ws.id)).toHaveLength(1);
      });
    });

    describe("demands", () => {
      it("merges same-topic demands: unioned ids, coalesced text, replaced updatedAt", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        await s.upsertDemand(demand({ communityId: ws.id, topic: "meetup", memberIds: ["m1"], messageIds: ["msg1"], updatedAt: "2025-01-01T00:00:00.000Z" }));
        const merged = await s.upsertDemand(
          demand({ communityId: ws.id, topic: "meetup", title: "Meetup!", memberIds: ["m1", "m2"], messageIds: ["msg2"], updatedAt: "2025-02-01T00:00:00.000Z" }),
        );
        expect(merged.memberIds.sort()).toEqual(["m1", "m2"]);
        expect(merged.messageIds.sort()).toEqual(["msg1", "msg2"]);
        expect(merged.title).toBe("Meetup!");
        expect(merged.updatedAt).toBe("2025-02-01T00:00:00.000Z");
        expect(await s.listDemands(ws.id)).toHaveLength(1);
      });

      it("sorts demands by member count then recency", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        await s.upsertDemand(demand({ communityId: ws.id, topic: "small", memberIds: ["m1"], updatedAt: "2025-03-01T00:00:00.000Z" }));
        await s.upsertDemand(demand({ communityId: ws.id, topic: "big", memberIds: ["m1", "m2"], updatedAt: "2025-01-01T00:00:00.000Z" }));
        await s.upsertDemand(demand({ communityId: ws.id, topic: "tied", memberIds: ["m1"], updatedAt: "2025-01-01T00:00:00.000Z" }));
        const list = await s.listDemands(ws.id);
        expect(list[0].topic).toBe("big");
        expect(list[1].topic).toBe("small");
      });

      it("getDemand resolves or nulls", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        const d = await s.upsertDemand(demand({ communityId: ws.id }));
        expect((await s.getDemand(d.id))?.topic).toBe("meetup");
        expect(await s.getDemand("nope")).toBeNull();
      });
    });

    describe("venues + sponsors", () => {
      it("upserts a venue in place and resolves by id", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        const v = await s.upsertVenue(venue({ communityId: ws.id, name: "Hall" }));
        await s.upsertVenue({ ...v, capacity: 50 });
        expect(await s.listVenues(ws.id)).toHaveLength(1);
        expect((await s.getVenue(v.id))?.capacity).toBe(50);
        expect(await s.getVenue("nope")).toBeNull();
      });

      it("upserts a sponsor and lists per community", async () => {
        const s = await fresh();
        const { ws, other } = await seed(s);
        const sp = await s.upsertSponsor(sponsor({ communityId: ws.id }));
        await s.upsertSponsor(sponsor({ communityId: other.id }));
        expect(await s.listSponsors(ws.id)).toHaveLength(1);
        expect((await s.getSponsor(sp.id))?.name).toBe("Bakery Co");
        expect(await s.getSponsor("nope")).toBeNull();
      });
    });

    describe("proposals + events + guests", () => {
      it("creates, lists, updates a proposal; update throws on unknown id", async () => {
        const s = await fresh();
        const { ws, other } = await seed(s);
        const p = await s.createProposal(proposal({ communityId: ws.id }));
        await s.updateProposal(p.id, { status: "approved", explanation: "because" });
        expect((await s.getProposal(p.id))?.status).toBe("approved");
        expect(await s.listProposals(ws.id)).toHaveLength(1);
        expect(await s.listProposals(other.id)).toHaveLength(0);
        await expect(s.updateProposal("nope", { status: "approved" })).rejects.toThrow();
      });

      it("creates events resolvable by id and slug", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        const e = await s.createEvent(eventRecord({ communityId: ws.id, slug: "launch" }));
        expect((await s.getEvent(e.id))?.slug).toBe("launch");
        expect((await s.getEventBySlug("launch"))?.id).toBe(e.id);
        expect(await s.getEventBySlug("nope")).toBeNull();
        expect(await s.listEvents(ws.id)).toHaveLength(1);
      });

      it("creates and patches guests; list scoped to the event", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        const g = await s.createGuest(guest({ eventId: "e1", communityId: ws.id }));
        await s.createGuest(guest({ eventId: "e2", communityId: ws.id }));
        await s.updateGuest(g.id, { name: "Grace H" });
        expect(await s.listGuests("e1")).toHaveLength(1);
        expect((await s.listGuests("e1"))[0].name).toBe("Grace H");
        await expect(s.updateGuest("nope", { name: "x" })).rejects.toThrow();
      });
    });

    describe("timeline", () => {
      it("appends events and lists them oldest-first", async () => {
        const s = await fresh();
        const { ws, other } = await seed(s);
        await s.addTimeline(timelineEvent({ communityId: ws.id, kind: "b", createdAt: "2025-01-02T00:00:00Z" }));
        await s.addTimeline(timelineEvent({ communityId: ws.id, kind: "a", createdAt: "2025-01-01T00:00:00.000Z" }));
        await s.addTimeline(timelineEvent({ communityId: other.id, kind: "x" }));
        const list = await s.listTimeline(ws.id);
        expect(list.map((t) => t.kind)).toEqual(["a", "b"]);
      });
    });

    describe("applications + blocklist", () => {
      it("creates and updates applications per community", async () => {
        const s = await fresh();
        const { ws, other } = await seed(s);
        const a = await s.createApplication(application({ communityId: ws.id }));
        await s.updateApplication(a.id, { decision: "accept", score: 80 });
        expect((await s.listApplications(ws.id))[0].decision).toBe("accept");
        expect(await s.listApplications(other.id)).toHaveLength(0);
        await expect(s.updateApplication("nope", { score: 1 })).rejects.toThrow();
      });

      it("finds blocklist entries by hash within the community", async () => {
        const s = await fresh();
        const { ws, other } = await seed(s);
        await s.addBlocklist(blocklistEntry({ communityId: ws.id, hash: "bad-hash" }));
        await s.addBlocklist(blocklistEntry({ communityId: other.id, hash: "bad-hash" }));
        expect((await s.findBlocklist(ws.id, "bad-hash"))?.evidence).toBe("spam");
        expect(await s.findBlocklist(ws.id, "clean")).toBeNull();
        expect(await s.listBlocklist(ws.id)).toHaveLength(1);
      });
    });

    describe("artifacts + webhook subscriptions", () => {
      it("saves artifacts scoped to their event", async () => {
        const s = await fresh();
        const { ws } = await seed(s);
        const a = await s.saveArtifact(artifact({ eventId: "e1", communityId: ws.id }));
        await s.saveArtifact(artifact({ eventId: "e2", communityId: ws.id }));
        expect(await s.listArtifacts("e1")).toHaveLength(1);
        expect((await s.listArtifacts("e1"))[0].id).toBe(a.id);
      });

      it("creates, lists, and deletes webhook subscriptions", async () => {
        const s = await fresh();
        const { ws, other } = await seed(s);
        const sub = await s.createWebhookSubscription({ communityId: ws.id, url: "https://hook", secret: "s3cret", kinds: ["import"] });
        expect(sub.secret).toBe("s3cret");
        expect(sub.kinds).toEqual(["import"]);
        expect(await s.listWebhookSubscriptions(ws.id)).toHaveLength(1);
        expect(await s.listWebhookSubscriptions(other.id)).toHaveLength(0);
        expect(await s.deleteWebhookSubscription(sub.id)).toBe(true);
        expect(await s.listWebhookSubscriptions(ws.id)).toHaveLength(0);
        expect(await s.deleteWebhookSubscription(sub.id)).toBe(false);
      });
    });
  });
}
