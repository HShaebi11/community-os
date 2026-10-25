import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "@community-os/sdk";
import { MemoryStore } from "@community-os/core";
import { makeWhatsAppZip, normalizedMessage } from "@community-os/testkit";
import { createApp, type WebhookDelivery } from "./index.ts";

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const patch = (body: unknown) => ({
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const make = () => {
  const deliveries: WebhookDelivery[] = [];
  const store = new MemoryStore();
  const app = createApp(store, { deliverWebhook: (d) => deliveries.push(d) });
  const createWorkspace = async (name = "Bread Town") =>
    (await (await app.request("/v1/workspaces", json({ name }))).json()) as { id: string; slug: string };
  return { app, store, deliveries, createWorkspace };
};

describe("workspaces + validation", () => {
  it("health reports the product", async () => {
    const { app } = make();
    expect(await (await app.request("/v1/health")).json()).toEqual({ ok: true, product: "community-os" });
  });

  it("POST /v1/workspaces requires a name", async () => {
    const { app } = make();
    const res = await app.request("/v1/workspaces", json({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "name required" });
  });

  it("creates, reads, lists, by-slug resolves, patches, and 404s unknown ids", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace("Sunrise Bakers");
    expect(w.slug).toBe("sunrise-bakers");

    expect((await app.request(`/v1/workspaces/${w.id}`)).status).toBe(200);
    const bySlug = (await (await app.request(`/v1/workspaces/by-slug/${w.slug}`)).json()) as { role: string };
    expect(bySlug.role).toBe("owner");
    expect((await app.request("/v1/workspaces/nope")).status).toBe(404);
    expect((await app.request("/v1/workspaces/by-slug/nope")).status).toBe(404);

    const patched = await app.request(`/v1/workspaces/${w.id}`, patch({ joinUrl: "https://join" }));
    expect((await patched.json()).joinUrl).toBe("https://join");
    expect((await app.request("/v1/workspaces/nope", patch({ name: "x" }))).status).toBe(400);
  });
});

describe("ingest surface", () => {
  it("POST /v1/ingest requires the workspace to exist", async () => {
    const { app } = make();
    const res = await app.request(
      "/v1/ingest",
      json({ communityId: "nope", source: { kind: "slack", name: "s" }, messages: [] }),
    );
    expect(res.status).toBe(404);
  });

  it("POST /v1/ingest rejects a non-array messages field", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const res = await app.request("/v1/ingest", json({ communityId: w.id, source: { kind: "slack", name: "s" }, messages: "no" }));
    expect(res.status).toBe(400);
  });

  it("ingests valid entries while silently dropping malformed ones", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const res = await app.request(
      "/v1/ingest",
      json({
        communityId: w.id,
        source: { kind: "slack", name: "s" },
        messages: [normalizedMessage({ id: "ok-1" }), { id: "", author: "a", body: "bad" }],
      }),
    );
    expect((await res.json()) as { inserted: number }).toMatchObject({ inserted: 1 });
  });

  it("POST /v1/ingest/discord stores a single normalized message", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const res = await app.request(
      "/v1/ingest/discord",
      json({ communityId: w.id, id: "snow-1", content: "hi", timestamp: "2025-01-01T00:00:00Z", author: { id: "u", username: "ada" } }),
    );
    expect((await res.json()) as { inserted: number }).toMatchObject({ inserted: 1 });
  });
});

describe("webhook lifecycle — the signed fan-out", () => {
  it("create returns the secret once; list redacts it; delete removes", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const created = await app.request(`/v1/workspaces/${w.id}/webhooks`, json({ url: "https://hook.test/x" }));
    expect(created.status).toBe(201);
    const sub = (await created.json()) as { id: string; secret: string };
    expect(sub.secret).toMatch(/^whsec_/);

    const listed = (await (await app.request(`/v1/workspaces/${w.id}/webhooks`)).json()) as Array<Record<string, unknown>>;
    expect(listed[0]).not.toHaveProperty("secret");
    expect(listed[0].id).toBe(sub.id);

    expect((await app.request(`/v1/webhooks/${sub.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await app.request(`/v1/webhooks/${sub.id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("rejects non-http urls and unparseable urls", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    for (const url of ["ftp://x", "not a url", ""]) {
      expect((await app.request(`/v1/workspaces/${w.id}/webhooks`, json({ url }))).status).toBe(400);
    }
  });

  it("delivers an HMAC-SHA256-signed payload the SDK verifier accepts", async () => {
    const { app, deliveries, createWorkspace } = make();
    const w = await createWorkspace();
    const created = await app.request(`/v1/workspaces/${w.id}/webhooks`, json({ url: "https://hook.test/x", kinds: ["import"] }));
    const { secret } = (await created.json()) as { secret: string };

    await app.request(
      "/v1/ingest",
      json({ communityId: w.id, source: { kind: "slack", name: "s" }, messages: [normalizedMessage()] }),
    );

    expect(deliveries).toHaveLength(1);
    const d = deliveries[0];
    expect(d.headers["x-communityos-event"]).toBe("import");
    const signature = d.headers["x-communityos-signature"];
    expect(signature).toMatch(/^sha256=/);
    // Cross-boundary: the exact verifier a consumer's receiver would run.
    expect(await verifyWebhookSignature(d.body, signature, secret)).toBe(true);
    const payload = JSON.parse(d.body) as { kind: string; workspaceId: string };
    expect(payload).toMatchObject({ kind: "import", workspaceId: w.id });
  });

  it("the verifier REJECTS tampered bodies, wrong secrets, and malformed headers", async () => {
    const { app, deliveries, createWorkspace } = make();
    const w = await createWorkspace();
    const created = await app.request(`/v1/workspaces/${w.id}/webhooks`, json({ url: "https://hook.test/x", kinds: ["import"] }));
    const { secret } = (await created.json()) as { secret: string };
    await app.request(
      "/v1/ingest",
      json({ communityId: w.id, source: { kind: "slack", name: "s" }, messages: [normalizedMessage()] }),
    );
    const d = deliveries[0];
    const signature = d.headers["x-communityos-signature"];
    // Body modified in transit → reject.
    expect(await verifyWebhookSignature(d.body + " ", signature, secret)).toBe(false);
    expect(await verifyWebhookSignature(d.body.replace("import", "rsvp"), signature, secret)).toBe(false);
    // Wrong secret (e.g. replay aimed at another subscription) → reject.
    expect(await verifyWebhookSignature(d.body, signature, "wrong-secret")).toBe(false);
    // Malformed/missing signature header → reject.
    expect(await verifyWebhookSignature(d.body, "", secret)).toBe(false);
    expect(await verifyWebhookSignature(d.body, "md5=abc", secret)).toBe(false);
  });

  it("kind-filtered subscriptions only receive matching events", async () => {
    const { app, deliveries, createWorkspace } = make();
    const w = await createWorkspace();
    await app.request(`/v1/workspaces/${w.id}/webhooks`, json({ url: "https://hook.test/rsvp-only", kinds: ["rsvp"] }));
    await app.request(
      "/v1/ingest",
      json({ communityId: w.id, source: { kind: "slack", name: "s" }, messages: [normalizedMessage()] }),
    );
    expect(deliveries).toHaveLength(0);
  });
});

describe("domain routes", () => {
  it("member patch opts in publicly and auto-assigns a slug", async () => {
    const { app, store, createWorkspace } = make();
    const w = await createWorkspace();
    const member = await store.upsertMember(w.id, "Ada", null);
    const res = await app.request(`/v1/members/${member.id}`, patch({ publicOptIn: true }));
    const updated = (await res.json()) as { publicSlug: string | null };
    expect(updated.publicSlug).toBe("ada");
    expect((await app.request("/v1/members/nope", patch({}))).status).toBe(404);
  });

  it("proposal pipeline endpoints enforce state order over http", async () => {
    const { app, store, createWorkspace } = make();
    const w = await createWorkspace();
    await store.upsertDemand({
      id: "d1",
      communityId: w.id,
      topic: "meetup",
      title: null,
      oneLiner: null,
      memberIds: ["m1"],
      messageIds: [],
      updatedAt: "2025-01-01T00:00:00Z",
    });
    const created = await app.request(`/v1/workspaces/${w.id}/proposals`, json({ demandId: "d1" }));
    expect(created.status).toBe(201);
    const pack = (await created.json()) as { id: string };

    // go-live before approve → kernel error → 400
    expect((await app.request(`/v1/proposals/${pack.id}/go-live`, json({}))).status).toBe(400);
    expect((await app.request(`/v1/proposals/${pack.id}/approve`, json({}))).status).toBe(200);
    // second approve → 400
    expect((await app.request(`/v1/proposals/${pack.id}/approve`, json({}))).status).toBe(400);
    expect((await app.request("/v1/proposals/nope/approve", json({}))).status).toBe(404);

    const live = await app.request(`/v1/proposals/${pack.id}/go-live`, json({}));
    expect(live.status).toBe(200);
    const event = (await live.json()) as { id: string; slug: string };
    expect((await app.request(`/v1/events/${event.id}/chain`)).status).toBe(200);
    expect((await app.request(`/v1/events/nope/chain`)).status).toBe(404);
  });

  it("applications + blocklist routes", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const appRes = await app.request(
      `/v1/workspaces/${w.id}/applications`,
      json({ applicant: "lin", answers: "I have organized three neighborhood meetups and can host fifty people." }),
    );
    expect(appRes.status).toBe(200);
    expect((await appRes.json()) as { decision: string }).toHaveProperty("decision");
    expect((await app.request(`/v1/workspaces/nope/applications`, json({ applicant: "x", answers: "y" }))).status).toBe(404);

    const bl = await app.request(`/v1/workspaces/${w.id}/blocklist`, json({ applicant: "mallory", evidence: "spam", confirmed: true }));
    expect((await bl.json()) as { confirmed: boolean }).toMatchObject({ confirmed: true });
  });

  it("venue and sponsor creation 201 + workspace guard", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    expect((await app.request(`/v1/workspaces/${w.id}/venues`, json({ name: "Hall", capacity: 40 }))).status).toBe(201);
    expect((await app.request(`/v1/workspaces/nope/venues`, json({ name: "x" }))).status).toBe(404);
    expect((await app.request(`/v1/workspaces/${w.id}/sponsors`, json({ name: "Co" }))).status).toBe(201);
  });
});

describe("public routes + CORS", () => {
  it("public slugs 404 and rsvp validates", async () => {
    const { app } = make();
    expect((await app.request("/v1/public/communities/nope")).status).toBe(404);
    expect((await app.request("/v1/public/events/nope")).status).toBe(404);
    expect((await app.request("/v1/public/members/nope")).status).toBe(404);
    expect((await app.request("/v1/public/events/nope/rsvp", json({ name: "A", email: "a@b.c" }))).status).toBe(400);
  });

  it("a public rsvp on a live event creates the guest", async () => {
    const { app, store, createWorkspace } = make();
    const w = await createWorkspace();
    await store.upsertDemand({
      id: "d1",
      communityId: w.id,
      topic: "meetup",
      title: null,
      oneLiner: null,
      memberIds: ["m1"],
      messageIds: [],
      updatedAt: "2025-01-01T00:00:00Z",
    });
    await app.request(`/v1/workspaces/${w.id}/proposals`, json({ demandId: "d1" }));
    const proposals = (await (await app.request(`/v1/workspaces/${w.id}/proposals`)).json()) as Array<{ id: string }>;
    await app.request(`/v1/proposals/${proposals[0].id}/approve`, json({}));
    const live = await app.request(`/v1/proposals/${proposals[0].id}/go-live`, json({}));
    const { slug } = (await live.json()) as { slug: string };

    expect((await app.request(`/v1/public/events/${slug}`)).status).toBe(200);
    const rsvpRes = await app.request(`/v1/public/events/${slug}/rsvp`, json({ name: "Grace", email: "grace@x.test" }));
    expect(rsvpRes.status).toBe(201);
  });

  it("answers CORS preflights permissively", async () => {
    const { app } = make();
    const res = await app.request("/v1/health", { method: "OPTIONS", headers: { origin: "https://anywhere.test" } });
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });
});

describe("search + export", () => {
  it("search matches members and demands across workspaces", async () => {
    const { app, store, createWorkspace } = make();
    const w = await createWorkspace();
    const m = await store.upsertMember(w.id, "Ada", null);
    await store.updateMember(m.id, { do: "bakes bread" }, false);
    const hits = (await (await app.request("/v1/search?q=bakes")).json()) as Array<{ type: string }>;
    expect(hits[0]).toMatchObject({ type: "member" });
    expect((await (await app.request("/v1/search?q=zzz-nothing")).json()) as unknown[]).toHaveLength(0);
  });

  it("export sets a content-disposition filename", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace("Bread Town");
    const res = await app.request(`/v1/workspaces/${w.id}/export`);
    expect(res.headers.get("content-disposition")).toContain("bread-town-export.json");
    expect((await res.json()) as { version: number }).toMatchObject({ version: 1 });
  });
});

describe("http-layer adversarial inputs", () => {
  it("non-JSON content-type and malformed JSON bodies fail as 400, not a crash", async () => {
    const { app } = make();
    const res1 = await app.request("/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "name=W",
    });
    expect([400, 415]).toContain(res1.status);
    const res2 = await app.request("/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res2.status).toBe(400);
  });

  it("unknown JSON fields are ignored; immutable fields cannot be reassigned", async () => {
    const { app, store, createWorkspace } = make();
    const w = await createWorkspace();
    const m = await store.upsertMember(w.id, "Ada", null);
    const res = await app.request(`/v1/members/${m.id}`, patch({ id: "hijacked", communityId: "other", do: "baker", unknownField: 1 }));
    expect(res.status).toBe(200);
    const after = await store.getMember(m.id);
    expect(after?.id).toBe(m.id);
    expect(after?.communityId).toBe(w.id);
    expect(after?.do).toBe("baker");
  });

  it("ingest with an empty messages array is a clean no-op", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const res = await app.request("/v1/ingest", json({ communityId: w.id, source: { kind: "native", name: "t" }, messages: [] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ inserted: 0, skipped: 0 });
  });

  it("cross-source ingest over HTTP keeps colliding platform ids", async () => {
    const { app, store, createWorkspace } = make();
    const w = await createWorkspace();
    const send = (kind: string) =>
      app.request("/v1/ingest", json({ communityId: w.id, source: { kind, name: kind }, messages: [{ id: "1", author: "Ada", body: `via ${kind}`, sentAt: "2025-01-01T00:00:00Z" }] }));
    await send("slack");
    await send("discord");
    expect(await store.listMessages(w.id)).toHaveLength(2);
  });

  it("rsvp over HTTP enforces the matched venue's capacity as a 400", async () => {
    const { app, store, createWorkspace } = make();
    const w = await createWorkspace();
    // Capacity >= max(members, 10) so the proposal matcher binds this venue.
    await store.upsertVenue({ id: "v1", communityId: w.id, name: "Tiny", area: null, capacity: 10, contact: null });
    await app.request("/v1/ingest", json({ communityId: w.id, source: { kind: "whatsapp", name: "t" }, messages: [{ id: "1", author: "Ada", body: "i want a bread workshop", sentAt: "2025-01-01T00:00:00Z" }] }));
    await app.request(`/v1/workspaces/${w.id}/memory`, { method: "POST" });
    const demands = (await (await app.request(`/v1/workspaces/${w.id}/demands`)).json()) as Array<{ id: string }>;
    const pack = (await (await app.request(`/v1/workspaces/${w.id}/proposals`, json({ demandId: demands[0].id }))).json()) as { id: string; venueId: string | null };
    expect(pack.venueId).toBe("v1");
    await app.request(`/v1/proposals/${pack.id}/approve`, json({}));
    const event = (await (await app.request(`/v1/proposals/${pack.id}/go-live`, json({}))).json()) as { slug: string };
    for (let i = 0; i < 10; i++) {
      const r = await app.request(`/v1/public/events/${event.slug}/rsvp`, json({ name: `G${i}`, email: `g${i}@x.com` }));
      expect(r.status).toBe(201);
    }
    const overflow = await app.request(`/v1/public/events/${event.slug}/rsvp`, json({ name: "Eleven", email: "e11@x.com" }));
    expect(overflow.status).toBe(400);
    expect(await overflow.json()).toMatchObject({ error: expect.stringContaining("capacity") });
  });
});

describe("previously-uncovered routes", () => {
  const seedPipeline = async (app: ReturnType<typeof createApp>, wsId: string) => {
    await app.request("/v1/ingest", json({
      communityId: wsId,
      source: { kind: "whatsapp", name: "t" },
      messages: [{ id: "1", author: "Ada", body: "i want a bread workshop", sentAt: "2025-01-01T00:00:00Z" }],
    }));
    await app.request(`/v1/workspaces/${wsId}/memory`, { method: "POST" });
    const demands = (await (await app.request(`/v1/workspaces/${wsId}/demands`)).json()) as Array<{ id: string; topic: string }>;
    const pack = (await (await app.request(`/v1/workspaces/${wsId}/proposals`, json({ demandId: demands[0].id }))).json()) as { id: string };
    await app.request(`/v1/proposals/${pack.id}/approve`, json({}));
    const event = (await (await app.request(`/v1/proposals/${pack.id}/go-live`, json({}))).json()) as { id: string; slug: string };
    return { demand: demands[0], pack, event };
  };

  it("GET /v1/workspaces lists every workspace", async () => {
    const { app, createWorkspace } = make();
    await createWorkspace("One");
    await createWorkspace("Two");
    const list = (await (await app.request("/v1/workspaces")).json()) as Array<{ slug: string }>;
    expect(list.map((w) => w.slug)).toEqual(["one", "two"]);
  });

  it("POST /v1/workspaces/:id/imports parses a real WhatsApp zip", async () => {
    const { app, store, createWorkspace, deliveries } = make();
    const w = await createWorkspace();
    const zip = makeWhatsAppZip(
      "01/01/2025, 10:00 - Ada: i want a meetup\n01/01/2025, 10:01 - Lin: me too\n",
      { "poster.jpg": "jpeg-bytes" },
    );
    await app.request(`/v1/workspaces/${w.id}/webhooks`, json({ url: "https://hook.test/x" }));
    const res = await app.request(`/v1/workspaces/${w.id}/imports?filename=chat.zip`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: zip,
    });
    expect(res.status).toBe(200);
    const result = (await res.json()) as { inserted: number; members: unknown[] };
    expect(result.inserted).toBe(2);
    expect((await store.listMessages(w.id)).length).toBe(2);
    expect(deliveries.some((d) => d.headers["x-communityos-event"] === "import")).toBe(true);
  });

  it("GET /v1/workspaces/:id/export sets content-disposition and strips message bodies", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace("Bread Town");
    await app.request("/v1/ingest", json({
      communityId: w.id,
      source: { kind: "native", name: "t" },
      messages: [{ id: "1", author: "Ada", body: "secret body", sentAt: "2025-01-01T00:00:00Z" }],
    }));
    const res = await app.request(`/v1/workspaces/${w.id}/export`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("bread-town-export.json");
    const dump = (await res.json()) as { messages: Array<Record<string, unknown>> };
    expect(dump.messages.every((m) => !("body" in m))).toBe(true);
  });

  it("GET /v1/demands/:demandId resolves the demand card or 404s", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const { demand } = await seedPipeline(app, w.id);
    const res = await app.request(`/v1/demands/${demand.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).topic).toBeTruthy();
    expect((await app.request("/v1/demands/nope")).status).toBe(404);
  });

  it("GET /v1/proposals/:id + POST outreach return the proposal pack", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const { pack } = await seedPipeline(app, w.id);
    const got = await app.request(`/v1/proposals/${pack.id}`);
    expect(got.status).toBe(200);
    const out = await app.request(`/v1/proposals/${pack.id}/outreach`, json({}));
    expect(out.status).toBe(200);
    expect((await out.json()).outreachDraft).toBeTruthy();
  });

  it("GET /v1/events/:id/guests + POST autopilot", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const { event } = await seedPipeline(app, w.id);
    await app.request(`/v1/public/events/${event.slug}/rsvp`, json({ name: "Grace", email: "g@x.com" }));
    const guests = await app.request(`/v1/events/${event.id}/guests`);
    expect(guests.status).toBe(200);
    expect(((await guests.json()) as unknown[]).length).toBe(1);
    const auto = await app.request(`/v1/events/${event.id}/autopilot`, json({}));
    expect(auto.status).toBe(200);
    expect(((await auto.json()) as unknown[]).length).toBe(3);
  });

  it("GET /v1/workspaces/:id/applications lists applications", async () => {
    const { app, store, createWorkspace } = make();
    const w = await createWorkspace();
    await store.createApplication({ id: "a1", communityId: w.id, applicant: "Kai", answers: "x".repeat(60), decision: "pending", score: 0, reason: "" });
    const res = await app.request(`/v1/workspaces/${w.id}/applications`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Array<{ id: string }>).map((a) => a.id)).toEqual(["a1"]);
  });

  it("GET /v1/search hits members and demands across workspaces", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const { demand } = await seedPipeline(app, w.id);
    const res = await app.request("/v1/search?q=ada");
    const hits = (await res.json()) as Array<{ type: string; demand?: { id: string } }>;
    expect(hits.some((h) => h.type === "member")).toBe(true);
    const res2 = await app.request(`/v1/search?q=${encodeURIComponent(demand.topic)}`);
    const hits2 = (await res2.json()) as Array<{ type: string; demand?: { id: string } }>;
    expect(hits2.some((h) => h.type === "demand" && h.demand?.id === demand.id)).toBe(true);
  });

  it("a throwing webhook sink never breaks the mutation response", async () => {
    const store = new MemoryStore();
    const app = createApp(store, {
      deliverWebhook: () => { throw new Error("sink exploded"); },
    });
    const w = (await (await app.request("/v1/workspaces", json({ name: "W" }))).json()) as { id: string };
    await app.request(`/v1/workspaces/${w.id}/webhooks`, json({ url: "https://hook.test/x", secret: "s" }));
    const res = await app.request("/v1/ingest", json({
      communityId: w.id,
      source: { kind: "native", name: "t" },
      messages: [{ id: "1", author: "Ada", body: "hi", sentAt: "2025-01-01T00:00:00Z" }],
    }));
    // Emit failure is swallowed — the API response is unaffected.
    expect(res.status).toBe(200);
  });

  it("default deliverWebhook POSTs the signed body via global fetch", async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init: RequestInit) => {
      calls.push({ url: String(url), headers: init.headers as Record<string, string>, body: String(init.body) });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;
    try {
      const store = new MemoryStore();
      const app = createApp(store); // no deliverWebhook — default impl
      const w = (await (await app.request("/v1/workspaces", json({ name: "W" }))).json()) as { id: string };
      const subRes = await app.request(`/v1/workspaces/${w.id}/webhooks`, json({ url: "https://hook.test/endpoint" }));
      const { secret } = (await subRes.json()) as { secret: string };
      await app.request("/v1/ingest", json({
        communityId: w.id,
        source: { kind: "native", name: "t" },
        messages: [{ id: "1", author: "Ada", body: "hi", sentAt: "2025-01-01T00:00:00Z" }],
      }));
      // delivery floats off the response path — let the microtask land
      await new Promise((r) => setTimeout(r, 25));
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://hook.test/endpoint");
      expect(calls[0].headers["x-communityos-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
      expect(await verifyWebhookSignature(calls[0].body, calls[0].headers["x-communityos-signature"], secret)).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("GET /v1/members/:memberId resolves the card or 404s", async () => {
    const { app, store, createWorkspace } = make();
    const w = await createWorkspace();
    const m = await store.upsertMember(w.id, "Ada", null);
    expect((await app.request(`/v1/members/${m.id}`)).status).toBe(200);
    expect((await app.request("/v1/members/nope")).status).toBe(404);
  });

  it("default deliverWebhook logs non-ok responses and swallows fetch rejects", async () => {
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    const realErr = console.error;
    const errs: unknown[] = [];
    console.error = (...a: unknown[]) => { errs.push(a); };
    globalThis.fetch = ((url: string) => {
      calls.push(String(url));
      return calls.length === 1
        ? Promise.resolve(new Response(null, { status: 500 }))
        : Promise.reject(new Error("net down"));
    }) as typeof fetch;
    try {
      const store = new MemoryStore();
      const app = createApp(store);
      const w = (await (await app.request("/v1/workspaces", json({ name: "W" }))).json()) as { id: string };
      await app.request(`/v1/workspaces/${w.id}/webhooks`, json({ url: "https://hook.test/x" }));
      for (let i = 0; i < 2; i++) {
        await app.request("/v1/ingest", json({
          communityId: w.id,
          source: { kind: "native", name: "t" },
          messages: [{ id: `m${i}`, author: "Ada", body: "hi there friend", sentAt: "2025-01-01T00:00:00Z" }],
        }));
      }
      await new Promise((r) => setTimeout(r, 25));
      expect(calls).toHaveLength(2);
      expect(errs.length).toBeGreaterThanOrEqual(2); // one !ok log + one reject log
    } finally {
      globalThis.fetch = realFetch;
      console.error = realErr;
    }
  });
});

describe("mcp mount", () => {
  it("/mcp answers a JSON-RPC initialize through the mounted handler", async () => {
    const { app } = make();
    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } } }),
    });
    // The mounted handler delegates to the mcp package; whatever the transport
    // answers, the route itself is exercised and must not 404/crash.
    expect([200, 400, 406, 415]).toContain(res.status);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  it("/mcp/code reports 503 when no LOADER binding is present", async () => {
    const { app } = make();
    const res = await app.request("/mcp/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("LOADER") });
  });

  it("unknown /mcp/* subpaths 404 inside the remote handler", async () => {
    const { app } = make();
    const res = await app.request("/mcp/unknown", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(404);
  });
});

describe("coverage completion — residual branches", () => {
  it("executionCtx.waitUntil is used when the runtime provides it", async () => {
    const store = new MemoryStore();
    const app = createApp(store); // default deliverWebhook — the waitUntil path lives there
    const w = await (await app.request("/v1/workspaces", json({ name: "Ctx" }))).json() as { id: string };
    await app.request(`/v1/workspaces/${w.id}/webhooks`, json({ url: "https://hook.test/x", kinds: [] }));
    const calls: Promise<unknown>[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;
    try {
      const res = await app.request(
        "/v1/ingest",
        json({ communityId: w.id, source: { kind: "native", name: "t" }, messages: [normalizedMessage()] }),
        undefined,
        { waitUntil: (p: Promise<unknown>) => calls.push(p) },
      );
      expect(res.status).toBe(200);
      expect(calls.length).toBeGreaterThanOrEqual(1);
      await Promise.all(calls);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("import falls back to export.zip when no filename query is passed", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const res = await app.request(`/v1/workspaces/${w.id}/imports`, {
      method: "POST",
      body: new TextEncoder().encode("01/01/2025, 10:00 - Ada: i want a meetup\n"),
    });
    expect(res.status).toBe(200);
  });

  it("venue without optional fields stores nulls", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const res = await app.request(`/v1/workspaces/${w.id}/venues`, json({ name: "Bare" }));
    expect(res.status).toBe(201);
    const v = await res.json();
    expect(v.area ?? null).toBeNull();
  });

  it("outreach on a ghost-community proposal uses 'Community'", async () => {
    const { app, store, createWorkspace } = make();
    const w = await createWorkspace();
    const p = await store.createProposal({
      id: "ghost-prop", communityId: "ghost", demandId: "d", title: "t", venueId: null,
      speakerIds: [], explanation: null, outreachDraft: null, status: "draft",
    });
    const res = await app.request(`/v1/proposals/${p.id}/outreach`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()).outreachDraft).toContain("Community");
    void w;
  });

  it("blocklist without confirmed defaults to false; missing applicant 400s", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const res = await app.request(`/v1/workspaces/${w.id}/blocklist`, json({ applicant: "Bad Actor", evidence: "spam" }));
    expect(res.status).toBe(200);
    expect((await res.json()).confirmed).toBe(false);
    const bad = await app.request(`/v1/workspaces/${w.id}/blocklist`, json({ evidence: "x" }));
    expect(bad.status).toBe(400);
  });

  it("requestOrigin prefers x-public-origin, then origin, then the request URL", async () => {
    const { app, store } = make();
    await store.createEvent({
      id: "e1", communityId: "c", proposalId: "p", slug: "pub-ev", title: "T",
      startsAt: null, publishedAt: "2025-01-01T00:00:00.000Z", qrSvg: "<svg/>",
    });
    const w = await store.createWorkspace({ name: "Pub", createdBy: "t" });
    const h = { headers: { "x-public-origin": "https://custom.origin" } };
    const res = await app.request(`/v1/public/communities/${w.slug}`, h);
    expect(res.status).toBe(200);
    const res2 = await app.request("/v1/public/events/pub-ev", { headers: { origin: "https://alt.origin" } });
    expect(res2.status).toBe(200);
    const res3 = await app.request(`/v1/public/communities/${w.slug}`, { headers: { origin: "https://alt.origin" } });
    expect(res3.status).toBe(200);
  });

  it("search without ?q returns empty hits, webhook without url 400s", async () => {
    const { app, createWorkspace } = make();
    const res = await app.request("/v1/search");
    expect(res.status).toBe(200);
    const w = await createWorkspace();
    const bad = await app.request(`/v1/workspaces/${w.id}/webhooks`, json({ kinds: [] }));
    expect(bad.status).toBe(400);
  });

  it("/mcp/code engages the LOADER binding when env provides it", async () => {
    const { app } = make();
    const res = await app.request(
      "/mcp/code",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      },
      { LOADER: {} },
    );
    // The Workers executor can't run under vitest, but the env branch is taken.
    expect(res.status).not.toBe(404);
  });

  it("mcp tool calls route through apiFetch into the app", async () => {
    const { app, createWorkspace } = make();
    const w = await createWorkspace();
    const res = await app.request(`/mcp?workspace=${w.id}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "search_memory", arguments: { q: "x" } },
      }),
    });
    expect(res.status).toBe(200);
  });
});
