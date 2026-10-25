import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "@community-os/sdk";
import { MemoryStore } from "@community-os/core";
import { normalizedMessage } from "@community-os/testkit";
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
