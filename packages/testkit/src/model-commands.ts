import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Store } from "@community-os/sdk";
// Local copy of the slug spec — the reference model must not share code
// with the implementations it checks.
function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  return slug || "community";
}
import { canon, StoreModel } from "./store-model.ts";
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
import type { ApplicationDecision, ProposalStatus, SourceKind } from "@community-os/sdk";

/** Model-based conformance (the AWS ShardStore pattern): fast-check generates
 *  random sequences of store operations — biased toward collisions, duplicates
 *  and hostile inputs — applies each to BOTH the real adapter and a naive
 *  reference model, and asserts their observable states stay identical.
 *
 *  Failure output shrinks to the minimal command sequence that diverges.
 *
 *  Usage: testStoreModelConformance("SqliteStore", () => new SqliteStore(), s => s.close());
 */

// --- small biased pools: collisions and hostile inputs are where bugs live ---
const wsNameArb = fc.constantFrom("bakers", "hacknight", "meetup", "bakers club", "makers");
const memberNameArb = fc.constantFrom("Ada", "ada", " ADA ", "Grace", "lin", "Lin", "Kai", "Ada");
const sentAtArb = fc.constantFrom(
  "2025-01-01T00:00:00Z",
  "2025-01-01T00:00:00Z", // duplicate — forces ordering ties
  "2025-01-02T12:00:00Z",
  "2024-12-31T23:59:59Z",
  "2025-03-05T08:30:00Z",
);
const extIdArb = fc.constantFrom("1", "2", "3", "x1", "ext-9");
const bodyArb = fc.constantFrom(
  "hello",
  "i bake bread",
  "",
  "'; DROP TABLE messages; --",
  "emoji 👋🏽 rtl ‮",
  "line1\nline2",
  "x".repeat(5000),
);
const authorArb = fc.constantFrom("Ada", "Lin", "Grace", "system", " ada ");
const topicArb = fc.constantFrom("meetup", "safety", "talk", "meetup", "potluck");
const hashArb = fc.constantFrom("hash-a", "hash-b", "hash-c");
const urlArb = fc.constantFrom("https://a", "https://b", "https://x");

type M = StoreModel;
type R = Store;

// ---- comparison helpers ----

function expectSame(realList: unknown[], modelList: unknown[], m: M, ordered = true) {
  const rc = canon(realList, m.tags) as unknown[];
  const mc = canon(modelList, m.tags) as unknown[];
  if (ordered) {
    expect(rc).toEqual(mc);
  } else {
    const key = (x: unknown) => JSON.stringify(x);
    expect([...rc].sort((a, b) => key(a).localeCompare(key(b)))).toEqual(
      [...mc].sort((a, b) => key(a).localeCompare(key(b))),
    );
  }
}

function wsRef(m: M, i: number) {
  return m.workspaces[i % m.workspaces.length];
}
function srcsOf(m: M, wsTag: string) {
  return m.sources.filter((s) => s.communityId === wsTag);
}
function membersOf(m: M, wsTag: string) {
  return m.members.filter((x) => x.communityId === wsTag);
}
function proposalsOf(m: M, wsTag: string) {
  return m.proposals.filter((x) => x.communityId === wsTag);
}
function eventsOf(m: M, wsTag: string) {
  return m.events.filter((x) => x.communityId === wsTag);
}
function guestsOfEvt(m: M, evtTag: string) {
  return m.guests.filter((g) => g.eventId === evtTag);
}
function liveWebhooks(m: M) {
  return m.webhooks;
}
function demandsOf(m: M, wsTag: string) {
  return m.demands.filter((d) => d.communityId === wsTag);
}
function venuesOf(m: M, wsTag: string) {
  return m.venues.filter((v) => v.communityId === wsTag);
}
function applicationsOf(m: M, wsTag: string) {
  return m.applications.filter((a) => a.communityId === wsTag);
}

// ---- commands ----

class CreateWorkspace implements fc.AsyncCommand<M, R> {
  constructor(readonly name: string) {
  }
  check() {
    return true;
  }
  async run(m: M, r: R) {
    const base = slugify(this.name);
    const taken = m.workspaceSlugTaken(base);
    const ws = await r.createWorkspace({ name: this.name, createdBy: "lead" });
    const tag = m.bind("ws", ws.id);
    m.workspaces.push({ ...ws, id: tag, role: "owner" });
    if (!taken) expect(ws.slug).toBe(base);
    else expect(ws.slug).not.toBe(base);
    expect(Number.isNaN(Date.parse(ws.createdAt))).toBe(false);
    expectSame(await r.listWorkspaces(), m.workspaces, m, false);
  }
  toString() {
    return `CreateWorkspace(${this.name})`;
  }
}

class CreateSource implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly kind: SourceKind, readonly name: string) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const src = await r.createSource({ communityId: m.realFor.get(ws.id)!, kind: this.kind, name: this.name });
    const tag = m.bind("src", src.id);
    m.sources.push({ id: tag, communityId: ws.id, kind: this.kind, name: this.name });
    expectSame(await r.listSources(m.realFor.get(ws.id)!), srcsOf(m, ws.id), m, false);
  }
  toString() {
    return `CreateSource(ws${this.wsIdx},${this.kind})`;
  }
}

class InsertMessages implements fc.AsyncCommand<M, R> {
  constructor(
    readonly wsIdx: number,
    readonly srcIdx: number,
    readonly batch: { ext: string; author: string; body: string; sentAt: string }[],
  ) {
  }
  check(m: M) {
    return m.sources.length > 0;
  }
  async run(m: M, r: R) {
    const src = m.sources[this.srcIdx % m.sources.length];
    const wsTag = src.communityId;
    const realBatch = this.batch.map((b) =>
      message({
        communityId: m.realFor.get(wsTag)!,
        sourceId: m.realFor.get(src.id)!,
        sourceMessageId: b.ext,
        authorRaw: b.author,
        body: b.body,
        sentAt: b.sentAt,
      }),
    );
    const modelBatch = realBatch.map((msg) => ({ ...msg, id: "", communityId: wsTag, sourceId: src.id }));
    const expected = m.insertMessages(modelBatch);
    const actual = await r.insertMessages(realBatch);
    expect(actual).toEqual(expected);
    // Bind each real id: inserted objects kept identity in model.messages and
    // get a fresh tag; skipped ones alias the already-stored original's tag.
    for (const [i, mm] of modelBatch.entries()) {
      if (m.messages.includes(mm)) {
        mm.id = m.bind("msg", realBatch[i].id);
      } else {
        const orig = m.messages.find(
          (x) => x.communityId === wsTag && x.sourceId === src.id && x.sourceMessageId === mm.sourceMessageId,
        )!;
        m.tags.set(realBatch[i].id, orig.id);
      }
    }
    expectSame(await r.listMessages(m.realFor.get(wsTag)!), m.listMessages(wsTag), m, false);
  }
  toString() {
    return `InsertMessages(src${this.srcIdx},n=${this.batch.length})`;
  }
}

class UpsertMember implements fc.AsyncCommand<M, R> {
  constructor(
    readonly wsIdx: number,
    readonly name: string,
    readonly lastActive: string | null,
  ) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const real = await r.upsertMember(m.realFor.get(ws.id)!, this.name, this.lastActive);
    const { member: mm, created } = m.upsertMember(ws.id, this.name, this.lastActive);
    if (created) mm.id = m.bind("mem", real.id);
    expect(canon(real, m.tags)).toEqual({ ...mm });
    expectSame(await r.listMembers(m.realFor.get(ws.id)!), membersOf(m, ws.id), m, false);
  }
  toString() {
    return `UpsertMember(ws${this.wsIdx},${JSON.stringify(this.name)})`;
  }
}

class UpdateMember implements fc.AsyncCommand<M, R> {
  constructor(
    readonly wsIdx: number,
    readonly memIdx: number,
    readonly patch: Record<string, unknown>,
    readonly byLead: boolean,
  ) {
  }
  check(m: M) {
    return m.members.length > 0;
  }
  async run(m: M, r: R) {
    const mem = membersOf(m, wsRef(m, this.wsIdx).id);
    if (mem.length === 0) return;
    const mm = mem[this.memIdx % mem.length];
    // Public slugs are globally unique, and display names are unique within a
    // community — when the model says either would collide, the contract
    // requires the real store to throw too. A locked displayName patched by a
    // non-lead is a silent no-op, so it must not throw.
    const nameNorm = (s: string) => s.trim().toLowerCase();
    const nameApplies =
      typeof this.patch.displayName === "string" &&
      (this.byLead || !mm.leadLockedFields.includes("displayName"));
    const wouldThrow =
      (this.patch.publicSlug != null &&
        m.members.some((x) => x.id !== mm.id && x.publicSlug === this.patch.publicSlug)) ||
      (nameApplies &&
        m.members.some(
          (x) =>
            x.id !== mm.id &&
            x.communityId === mm.communityId &&
            nameNorm(x.displayName) === nameNorm(this.patch.displayName as string),
        ));
    if (wouldThrow) {
      await expect(r.updateMember(m.realFor.get(mm.id)!, this.patch, this.byLead)).rejects.toThrow();
      return;
    }
    const real = await r.updateMember(m.realFor.get(mm.id)!, this.patch, this.byLead);
    m.updateMember(mm.id, this.patch, this.byLead);
    expect(canon(real, m.tags)).toEqual({ ...mm });
  }
  toString() {
    return `UpdateMember(mem${this.memIdx},lead=${this.byLead})`;
  }
}

class InsertFiles implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly names: string[]) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const recs = this.names.map((n) => fileRecord({ communityId: m.realFor.get(ws.id)!, name: n }));
    await r.insertFiles(recs);
    for (const f of recs) m.files.push({ ...f, id: m.bind("file", f.id), communityId: ws.id });
    expectSame(await r.listFiles(m.realFor.get(ws.id)!), m.files.filter((f) => f.communityId === ws.id), m, false);
  }
  toString() {
    return `InsertFiles(ws${this.wsIdx},n=${this.names.length})`;
  }
}

class InsertCitations implements fc.AsyncCommand<M, R> {
  constructor(
    readonly wsIdx: number,
    readonly items: { objectType: string; objectId: string }[],
  ) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const recs = this.items.map((c) => citation({ communityId: m.realFor.get(ws.id)!, objectType: c.objectType, objectId: c.objectId }));
    await r.insertCitations(recs);
    for (const c of recs) m.citations.push({ ...c, id: m.bind("cit", c.id), communityId: ws.id });
    expectSame(
      await r.listCitations(m.realFor.get(ws.id)!),
      m.citations.filter((c) => c.communityId === ws.id),
      m,
      false,
    );
  }
  toString() {
    return `InsertCitations(ws${this.wsIdx},n=${this.items.length})`;
  }
}

class UpsertResource implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly url: string, readonly title: string | null) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const existing = m.resources.find((x) => x.communityId === ws.id && x.url === this.url);
    const rec = resource({ communityId: m.realFor.get(ws.id)!, url: this.url, title: this.title ?? "untitled" });
    const real = await r.upsertResource(rec);
    const mm = m.upsertResource({ ...rec, id: "", communityId: ws.id });
    if (existing) {
      expect(canon(real.id, m.tags)).toBe(existing.id);
    } else {
      mm.id = m.bind("res", real.id);
    }
    expectSame(await r.listResources(m.realFor.get(ws.id)!), m.resources.filter((x) => x.communityId === ws.id), m, false);
  }
  toString() {
    return `UpsertResource(ws${this.wsIdx},${this.url})`;
  }
}

class UpsertDemand implements fc.AsyncCommand<M, R> {
  constructor(
    readonly wsIdx: number,
    readonly topic: string,
    readonly title: string | null,
    readonly memIdxs: number[],
    readonly msgIdxs: number[],
    readonly updatedAt: string,
  ) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const mems = membersOf(m, ws.id);
    const msgs = m.messages.filter((x) => x.communityId === ws.id);
    const memTags = this.memIdxs.filter((i) => i < mems.length).map((i) => mems[i].id);
    const msgTags = this.msgIdxs.filter((i) => i < msgs.length).map((i) => msgs[i].id);
    const rec = demand({
      communityId: m.realFor.get(ws.id)!,
      topic: this.topic,
      title: this.title,
      memberIds: memTags.map((t) => m.realFor.get(t)!),
      messageIds: msgTags.map((t) => m.realFor.get(t)!),
      updatedAt: this.updatedAt,
    });
    const modelRec = { ...rec, id: "", communityId: ws.id, memberIds: memTags, messageIds: msgTags };
    const existing = m.demands.find((d) => d.communityId === ws.id && d.topic === this.topic);
    const real = await r.upsertDemand(rec);
    const mm = m.upsertDemand(modelRec);
    if (!existing) mm.id = m.bind("dmd", real.id);
    else expect(canon(real.id, m.tags)).toBe(existing.id);
    expectSame(await r.listDemands(m.realFor.get(ws.id)!), m.listDemands(ws.id), m, false);
  }
  toString() {
    return `UpsertDemand(ws${this.wsIdx},${this.topic})`;
  }
}

class UpsertVenue implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly venIdx: number | null, readonly capacity: number | null) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const existing = venuesOf(m, ws.id);
    const prior = this.venIdx !== null && existing.length ? existing[this.venIdx % existing.length] : null;
    const rec = venue({
      communityId: m.realFor.get(ws.id)!,
      name: prior ? "Hall" : `Venue ${m.venues.length}`,
      capacity: this.capacity,
      ...(prior ? { id: m.realFor.get(prior.id)! } : {}),
    });
    const real = await r.upsertVenue(rec);
    const modelRec = { ...rec, communityId: ws.id, id: prior ? prior.id : m.bind("ven", real.id) };
    m.upsertVenue(modelRec);
    expect(canon(real.id, m.tags)).toBe(modelRec.id);
    expectSame(await r.listVenues(m.realFor.get(ws.id)!), venuesOf(m, ws.id), m, false);
  }
  toString() {
    return `UpsertVenue(ws${this.wsIdx},cap=${this.capacity})`;
  }
}

class UpsertSponsor implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly name: string) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const rec = sponsor({ communityId: m.realFor.get(ws.id)!, name: this.name });
    const real = await r.upsertSponsor(rec);
    m.upsertSponsor({ ...rec, communityId: ws.id, id: m.bind("spo", real.id) });
    expectSame(await r.listSponsors(m.realFor.get(ws.id)!), m.sponsors.filter((x) => x.communityId === ws.id), m, false);
  }
  toString() {
    return `UpsertSponsor(ws${this.wsIdx})`;
  }
}

class CreateProposal implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly demandIdx: number) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const dmds = demandsOf(m, ws.id);
    const dmd = dmds.length ? dmds[this.demandIdx % dmds.length] : null;
    const rec = proposal({
      communityId: m.realFor.get(ws.id)!,
      demandId: dmd ? m.realFor.get(dmd.id)! : "no-demand",
    });
    const real = await r.createProposal(rec);
    m.proposals.push({ ...rec, communityId: ws.id, demandId: dmd?.id ?? "no-demand", id: m.bind("prop", real.id) });
    expectSame(await r.listProposals(m.realFor.get(ws.id)!), proposalsOf(m, ws.id), m, false);
  }
  toString() {
    return `CreateProposal(ws${this.wsIdx})`;
  }
}

class UpdateProposal implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly propIdx: number, readonly status: ProposalStatus) {
  }
  check(m: M) {
    return m.proposals.length > 0;
  }
  async run(m: M, r: R) {
    const props = proposalsOf(m, wsRef(m, this.wsIdx).id);
    if (!props.length) return;
    const p = props[this.propIdx % props.length];
    const real = await r.updateProposal(m.realFor.get(p.id)!, { status: this.status });
    m.updateProposal(p.id, { status: this.status });
    expect(canon(real, m.tags)).toEqual({ ...p });
  }
  toString() {
    return `UpdateProposal(prop${this.propIdx},${this.status})`;
  }
}

class CreateEvent implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly propIdx: number, readonly slug: string) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const props = proposalsOf(m, ws.id);
    const p = props.length ? props[this.propIdx % props.length] : null;
    const rec = eventRecord({ communityId: m.realFor.get(ws.id)!, proposalId: p ? m.realFor.get(p.id)! : "no-prop", slug: this.slug });
    if (m.events.some((e) => e.slug === this.slug)) {
      await expect(r.createEvent(rec)).rejects.toThrow();
      return;
    }
    const real = await r.createEvent(rec);
    m.events.push({ ...rec, communityId: ws.id, proposalId: p?.id ?? "no-prop", id: m.bind("evt", real.id) });
    expectSame(await r.listEvents(m.realFor.get(ws.id)!), eventsOf(m, ws.id), m, false);
  }
  toString() {
    return `CreateEvent(ws${this.wsIdx},${this.slug})`;
  }
}

class CreateGuest implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly evtIdx: number, readonly name: string) {
  }
  check(m: M) {
    return m.events.length > 0;
  }
  async run(m: M, r: R) {
    const evts = eventsOf(m, wsRef(m, this.wsIdx).id);
    if (!evts.length) return;
    const e = evts[this.evtIdx % evts.length];
    // Unique email per command — guests dedupe on (eventId, email) now, so
    // reusing the fixture default would collapse rows instead of adding.
    const rec = guest({ eventId: m.realFor.get(e.id)!, communityId: m.realFor.get(e.communityId)!, name: this.name, email: `${this.name}-${m.guests.length}-${makeId()}@x.test` });
    const real = await r.createGuest(rec);
    m.guests.push({ ...rec, eventId: e.id, communityId: e.communityId, id: m.bind("gst", real.id) });
    // createGuest bumps the event's seat counter — mirror it so a later
    // listEvents comparison sees the same rsvpCount.
    e.rsvpCount += 1;
    expectSame(await r.listGuests(m.realFor.get(e.id)!), guestsOfEvt(m, e.id), m, false);
  }
  toString() {
    return `CreateGuest(evt${this.evtIdx},${this.name})`;
  }
}

class UpdateGuest implements fc.AsyncCommand<M, R> {
  constructor(readonly evtIdx: number, readonly gstIdx: number, readonly name: string) {
  }
  check(m: M) {
    return m.guests.length > 0;
  }
  async run(m: M, r: R) {
    const e = m.events[this.evtIdx % m.events.length];
    const gs = guestsOfEvt(m, e.id);
    if (!gs.length) return;
    const g = gs[this.gstIdx % gs.length];
    const real = await r.updateGuest(m.realFor.get(g.id)!, { name: this.name });
    m.updateGuest(g.id, { name: this.name });
    expect(canon(real, m.tags)).toEqual({ ...g });
  }
  toString() {
    return `UpdateGuest(gst${this.gstIdx})`;
  }
}

class AddTimeline implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly kind: string, readonly createdAt: string) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const rec = timelineEvent({ communityId: m.realFor.get(ws.id)!, kind: this.kind, createdAt: this.createdAt });
    await r.addTimeline(rec);
    m.timeline.push({ ...rec, communityId: ws.id, id: m.bind("tl", rec.id) });
    expectSame(await r.listTimeline(m.realFor.get(ws.id)!), m.listTimeline(ws.id), m, false);
  }
  toString() {
    return `AddTimeline(ws${this.wsIdx},${this.kind})`;
  }
}

class CreateApplication implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly applicant: string) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const rec = application({ communityId: m.realFor.get(ws.id)!, applicant: this.applicant });
    const real = await r.createApplication(rec);
    m.applications.push({ ...rec, communityId: ws.id, id: m.bind("app", real.id) });
    expectSame(await r.listApplications(m.realFor.get(ws.id)!), applicationsOf(m, ws.id), m, false);
  }
  toString() {
    return `CreateApplication(ws${this.wsIdx},${this.applicant})`;
  }
}

class UpdateApplication implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly appIdx: number, readonly decision: ApplicationDecision, readonly score: number) {
  }
  check(m: M) {
    return m.applications.length > 0;
  }
  async run(m: M, r: R) {
    const apps = applicationsOf(m, wsRef(m, this.wsIdx).id);
    if (!apps.length) return;
    const a = apps[this.appIdx % apps.length];
    const real = await r.updateApplication(m.realFor.get(a.id)!, { decision: this.decision, score: this.score });
    m.updateApplication(a.id, { decision: this.decision, score: this.score });
    expect(canon(real, m.tags)).toEqual({ ...a });
  }
  toString() {
    return `UpdateApplication(app${this.appIdx},${this.decision})`;
  }
}

class AddBlocklist implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly hash: string) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const rec = blocklistEntry({ communityId: m.realFor.get(ws.id)!, hash: this.hash });
    await r.addBlocklist(rec);
    m.blocklist.push({ ...rec, communityId: ws.id, id: m.bind("blk", rec.id) });
    expectSame(await r.listBlocklist(m.realFor.get(ws.id)!), m.blocklist.filter((b) => b.communityId === ws.id), m, false);
    const found = await r.findBlocklist(m.realFor.get(ws.id)!, this.hash);
    const modelFound = m.blocklist.find((b) => b.communityId === ws.id && b.hash === this.hash);
    expect(canon(found, m.tags)).toEqual(modelFound ?? null);
  }
  toString() {
    return `AddBlocklist(ws${this.wsIdx},${this.hash})`;
  }
}

class SaveArtifact implements fc.AsyncCommand<M, R> {
  constructor(readonly evtIdx: number, readonly kind: "run_sheet" | "post" | "newsletter") {
  }
  check(m: M) {
    return m.events.length > 0;
  }
  async run(m: M, r: R) {
    const e = m.events[this.evtIdx % m.events.length];
    const rec = artifact({ eventId: m.realFor.get(e.id)!, communityId: m.realFor.get(e.communityId)!, kind: this.kind });
    await r.saveArtifact(rec);
    m.artifacts.push({ ...rec, eventId: e.id, communityId: e.communityId, id: m.bind("art", rec.id) });
    expectSame(await r.listArtifacts(m.realFor.get(e.id)!), m.artifacts.filter((a) => a.eventId === e.id), m, false);
  }
  toString() {
    return `SaveArtifact(evt${this.evtIdx},${this.kind})`;
  }
}

class CreateWebhookSub implements fc.AsyncCommand<M, R> {
  constructor(readonly wsIdx: number, readonly url: string) {
  }
  check(m: M) {
    return m.workspaces.length > 0;
  }
  async run(m: M, r: R) {
    const ws = wsRef(m, this.wsIdx);
    const real = await r.createWebhookSubscription({ communityId: m.realFor.get(ws.id)!, url: this.url, secret: "s3cret", kinds: ["import"] });
    m.webhooks.push({ ...real, communityId: ws.id, id: m.bind("wh", real.id) });
    expectSame(
      await r.listWebhookSubscriptions(m.realFor.get(ws.id)!),
      m.webhooks.filter((w) => w.communityId === ws.id),
      m,
      false,
    );
  }
  toString() {
    return `CreateWebhookSub(ws${this.wsIdx})`;
  }
}

class DeleteWebhookSub implements fc.AsyncCommand<M, R> {
  constructor(readonly whIdx: number) {
  }
  check(m: M) {
    return m.webhooks.length > 0;
  }
  async run(m: M, r: R) {
    const wh = liveWebhooks(m)[this.whIdx % liveWebhooks(m).length];
    const realDeleted = await r.deleteWebhookSubscription(m.realFor.get(wh.id)!);
    expect(realDeleted).toBe(true);
    m.webhooks = m.webhooks.filter((w) => w.id !== wh.id);
    expectSame(
      await r.listWebhookSubscriptions(m.realFor.get(wh.communityId)!),
      m.webhooks.filter((w) => w.communityId === wh.communityId),
      m,
      false,
    );
  }
  toString() {
    return `DeleteWebhookSub(${this.whIdx})`;
  }
}

// ---- command arbitraries ----

const idxArb = fc.nat({ max: 4 });
const patchArb = fc.record(
  {
    do: fc.option(fc.constantFrom("bakes", "organizes", "codes"), { nil: undefined }),
    want: fc.option(fc.constantFrom("meetup", "help"), { nil: undefined }),
    offer: fc.option(fc.constantFrom("kitchen", "time"), { nil: undefined }),
    notes: fc.option(fc.constantFrom("vip", "new"), { nil: undefined }),
    displayName: fc.option(memberNameArb, { nil: undefined }),
    publicOptIn: fc.option(fc.boolean(), { nil: undefined }),
    publicSlug: fc.option(fc.constantFrom("ada", "grace", "kai"), { nil: undefined }),
    id: fc.option(fc.constant("hijack"), { nil: undefined }), // immutable — must be ignored
    communityId: fc.option(fc.constant("hijack"), { nil: undefined }), // immutable — must be ignored
  },
  { requiredKeys: [] },
);
const msgBatchArb = fc.array(
  fc.record({ ext: extIdArb, author: authorArb, body: bodyArb, sentAt: sentAtArb }),
  { minLength: 1, maxLength: 6 },
);

const commandArbs: fc.Arbitrary<fc.AsyncCommand<M, R>>[] = [
  wsNameArb.map((n) => new CreateWorkspace(n)),
  fc.tuple(idxArb, fc.constantFrom("native", "slack", "discord"), fc.constantFrom("#a", "#b")).map(
    ([w, k, n]) => new CreateSource(w, k, n),
  ),
  fc.tuple(idxArb, idxArb, msgBatchArb).map(([w, s, b]) => new InsertMessages(w, s, b)),
  fc.tuple(idxArb, memberNameArb, fc.option(sentAtArb, { nil: null })).map(([w, n, t]) => new UpsertMember(w, n, t)),
  fc.tuple(idxArb, idxArb, patchArb, fc.boolean()).map(([w, i, p, l]) => new UpdateMember(w, i, p, l)),
  fc.tuple(idxArb, fc.array(fc.constantFrom("a.png", "b.pdf", "c"), { minLength: 1, maxLength: 3 })).map(
    ([w, n]) => new InsertFiles(w, n),
  ),
  fc
    .tuple(idxArb, fc.array(fc.record({ objectType: fc.constantFrom("member", "demand"), objectId: fc.constantFrom("o1", "o2") }), { minLength: 1, maxLength: 3 }))
    .map(([w, items]) => new InsertCitations(w, items)),
  fc.tuple(idxArb, urlArb, fc.option(fc.constantFrom("T1", "T2"), { nil: null })).map(([w, u, t]) => new UpsertResource(w, u, t)),
  fc
    .tuple(idxArb, topicArb, fc.option(fc.constantFrom("Title", "Meetup!"), { nil: null }), fc.array(fc.nat({ max: 3 }), { maxLength: 3 }), fc.array(fc.nat({ max: 5 }), { maxLength: 3 }), sentAtArb)
    .map(([w, t, ti, mi, gi, u]) => new UpsertDemand(w, t, ti, mi, gi, u)),
  fc.tuple(idxArb, fc.option(fc.nat({ max: 2 }), { nil: null }), fc.option(fc.nat({ max: 120 }), { nil: null })).map(
    ([w, v, c]) => new UpsertVenue(w, v, c),
  ),
  fc.tuple(idxArb, fc.constantFrom("Bakery Co", "Farm", "Cafe")).map(([w, n]) => new UpsertSponsor(w, n)),
  fc.tuple(idxArb, idxArb).map(([w, d]) => new CreateProposal(w, d)),
  fc.tuple(idxArb, idxArb, fc.constantFrom("draft", "approved", "live")).map(([w, p, s]) => new UpdateProposal(w, p, s)),
  fc.tuple(idxArb, idxArb, fc.constantFrom("launch", "night", "meet")).map(([w, p, s]) => new CreateEvent(w, p, s)),
  fc.tuple(idxArb, idxArb, memberNameArb).map(([w, e, n]) => new CreateGuest(w, e, n)),
  fc.tuple(idxArb, idxArb, memberNameArb).map(([e, g, n]) => new UpdateGuest(e, g, n)),
  fc.tuple(idxArb, fc.constantFrom("import", "demand", "event"), sentAtArb).map(([w, k, c]) => new AddTimeline(w, k, c)),
  fc.tuple(idxArb, memberNameArb).map(([w, a]) => new CreateApplication(w, a)),
  fc.tuple(idxArb, idxArb, fc.constantFrom("accept", "decline", "ask", "pending"), fc.nat({ max: 100 })).map(
    ([w, a, d, s]) => new UpdateApplication(w, a, d, s),
  ),
  fc.tuple(idxArb, hashArb).map(([w, h]) => new AddBlocklist(w, h)),
  fc.tuple(idxArb, fc.constantFrom("run_sheet", "post")).map(([e, k]) => new SaveArtifact(e, k)),
  fc.tuple(idxArb, urlArb).map(([w, u]) => new CreateWebhookSub(w, u)),
  idxArb.map((i) => new DeleteWebhookSub(i)),
];

/** Runs N seeded model-based sequences against a store adapter. Each sequence
 *  compares observable state after every command; failures auto-shrink to the
 *  minimal diverging sequence (fast-check prints the seed to replay). */
export function testStoreModelConformance<S extends Store>(
  storeName: string,
  factory: () => S | Promise<S>,
  teardown?: (store: S) => void | Promise<void>,
  runs = 3,
) {
  describe(`${storeName} — model-based conformance`, () => {
    it(`random op sequences keep observable state identical to the model (${runs} runs)`, async () => {
      for (let run = 0; run < runs; run++) {
        const real = await factory();
        try {
          const model = new StoreModel();
          await fc.assert(
            fc.asyncProperty(fc.commands(commandArbs, { size: "large" }), async (cmds) => {
              await fc.asyncModelRun(async () => ({ model, real }), cmds);
            }),
            { numRuns: 1, seed: 1000 + run },
          );
          // Final full sweep: every list on every workspace matches the model.
          for (const ws of model.workspaces) {
            const realWs = model.realFor.get(ws.id)!;
            expectSame(await real.listMembers(realWs), membersOf(model, ws.id), model, false);
            expectSame(await real.listMessages(realWs), model.listMessages(ws.id), model, false);
            expectSame(await real.listDemands(realWs), model.listDemands(ws.id), model, false);
            expectSame(await real.listProposals(realWs), proposalsOf(model, ws.id), model, false);
            expectSame(await real.listEvents(realWs), eventsOf(model, ws.id), model, false);
            expectSame(await real.listTimeline(realWs), model.listTimeline(ws.id), model, false);
            expectSame(await real.listApplications(realWs), applicationsOf(model, ws.id), model, false);
            expectSame(await real.listBlocklist(realWs), model.blocklist.filter((b) => b.communityId === ws.id), model, false);
            expectSame(await real.listVenues(realWs), venuesOf(model, ws.id), model, false);
            expectSame(await real.listSponsors(realWs), model.sponsors.filter((x) => x.communityId === ws.id), model, false);
            expectSame(await real.listResources(realWs), model.resources.filter((x) => x.communityId === ws.id), model, false);
            expectSame(await real.listCitations(realWs), model.citations.filter((c) => c.communityId === ws.id), model, false);
            expectSame(await real.listFiles(realWs), model.files.filter((f) => f.communityId === ws.id), model, false);
            expectSame(await real.listWebhookSubscriptions(realWs), model.webhooks.filter((w) => w.communityId === ws.id), model, false);
          }
        } finally {
          await teardown?.(real);
        }
      }
    });
  });
}
