import {
  assignPublicSlug,
  briefing,
  createProposalFromDemand,
  eventChainById,
  exportWorkspace,
  generateAutopilot,
  goLive,
  importWhatsApp,
  ingestDiscord,
  makeOutreachDraft,
  memberCard,
  openDemand,
  openProposal,
  publicCommunity,
  publicEvent,
  MemoryStore,
  publicMember,
  recordEventPageView,
  refreshMemory,
  rsvp,
  setProposalStatus,
  sha256Hex,
  submitApplication,
  type Store,
} from "@community-os/core";
import { parseWhatsAppExport } from "@community-os/whatsapp-import";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { mountMcp } from "./mcp.ts";

export type AppEnv = {
  Variables: {
    store: Store;
  };
};

// The open-source build has no accounts: every request acts on behalf of the
// local owner. A hosted edition plugs real identity in here — authentication
// middleware that resolves the caller, then a per-workspace membership check.
const LOCAL_IDENTITY = "local";

export type WebhookDelivery = {
  url: string;
  body: string;
  headers: Record<string, string>;
};

export type AppOptions = {
  // Injectable for tests; production default POSTs the signed payload.
  deliverWebhook?: (delivery: WebhookDelivery, ctx?: { waitUntil(p: Promise<unknown>): void }) => void;
};

const defaultDeliverWebhook: NonNullable<AppOptions["deliverWebhook"]> = (delivery, ctx) => {
  const send = fetch(delivery.url, { method: "POST", body: delivery.body, headers: delivery.headers })
    .then((res) => {
      if (!res.ok)
        console.error(
          JSON.stringify({ message: "webhook delivery failed", url: delivery.url, status: res.status }),
        );
    })
    .catch((err) =>
      console.error(JSON.stringify({ message: "webhook delivery failed", url: delivery.url, error: String(err) })),
    );
  // Keep the Worker alive for the POST; under plain Node the promise floats.
  ctx?.waitUntil?.(send);
};

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSecret(): string {
  return `whsec_${[...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function createApp(store: Store, options: AppOptions = {}) {
  const deliverWebhook = options.deliverWebhook ?? defaultDeliverWebhook;
  const app = new Hono<AppEnv>();

  app.use(
    "*",
    cors({
      origin: (origin) => origin || "*",
      allowHeaders: ["Content-Type", "Authorization", "X-Public-Origin"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.use("*", async (c, next) => {
    c.set("store", store);
    await next();
  });

  app.onError((err, c) => {
    const status = err instanceof HTTPException ? err.status : 400;
    const message = err instanceof Error ? err.message : "error";
    console.error(JSON.stringify({ message: "request failed", error: message, path: c.req.path }));
    return c.json({ error: message }, status);
  });

  app.get("/v1/health", (c) => c.json({ ok: true, product: "community-os" }));

  const requireWorkspace = async (id: string) => {
    const workspace = await store.getWorkspace(id);
    if (!workspace) throw new HTTPException(404, { message: "workspace not found" });
    return workspace;
  };

  // Fire-and-forget fan-out to a workspace's webhook subscriptions. Never
  // throws: a broken webhook must not break the product path. Actual HTTP
  // delivery happens off the response path (waitUntil on Workers, floating
  // promise on Node).
  const emit = async (c: Context, kind: string, communityId: string, data: unknown) => {
    try {
      // c.executionCtx throws ("This context has no ExecutionContext") under
      // app.request() and plain Node — guard the access.
      let executionCtx: { waitUntil(p: Promise<unknown>): void } | undefined;
      try {
        executionCtx = c.executionCtx;
      } catch {
        executionCtx = undefined;
      }
      const subs = (await store.listWebhookSubscriptions(communityId)).filter(
        (s) => s.kinds.length === 0 || s.kinds.includes(kind),
      );
      for (const sub of subs) {
        const body = JSON.stringify({
          id: crypto.randomUUID(),
          kind,
          workspaceId: communityId,
          occurredAt: new Date().toISOString(),
          data,
        });
        const signature = await hmacSha256Hex(sub.secret, body);
        deliverWebhook(
          {
            url: sub.url,
            body,
            headers: {
              "content-type": "application/json",
              "x-communityos-event": kind,
              "x-communityos-signature": `sha256=${signature}`,
            },
          },
          executionCtx,
        );
      }
    } catch (err) {
      console.error(JSON.stringify({ message: "webhook emit failed", kind, error: String(err) }));
    }
  };

  app.post("/v1/workspaces", async (c) => {
    const body = await c.req.json<{ name?: string; joinUrl?: string }>();
    if (!body.name) throw new HTTPException(400, { message: "name required" });
    const workspace = await store.createWorkspace({
      name: body.name,
      createdBy: LOCAL_IDENTITY,
      joinUrl: body.joinUrl,
    });
    return c.json(workspace, 201);
  });

  app.get("/v1/workspaces", async (c) => {
    return c.json(await store.listWorkspaces());
  });

  app.get("/v1/workspaces/by-slug/:slug", async (c) => {
    const workspace = await store.getWorkspaceBySlug(c.req.param("slug"));
    if (!workspace) throw new HTTPException(404, { message: "workspace not found" });
    return c.json({ ...workspace, role: "owner" });
  });

  app.get("/v1/workspaces/:id", async (c) => c.json(await requireWorkspace(c.req.param("id"))));

  app.patch("/v1/workspaces/:id", async (c) => {
    const body = await c.req.json<{ name?: string; joinUrl?: string | null }>();
    return c.json(await store.updateWorkspace(c.req.param("id"), { name: body.name, joinUrl: body.joinUrl }));
  });

  app.post("/v1/workspaces/:id/imports", async (c) => {
    await requireWorkspace(c.req.param("id"));
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    const filename = c.req.query("filename") ?? "export.zip";
    const parsed = parseWhatsAppExport(bytes, filename);
    const result = await importWhatsApp(
      store,
      c.req.param("id"),
      parsed.transcript,
      parsed.files.map((f) => ({
        name: f.name,
        storagePath: `memory://${f.name}`,
        mime: f.mime,
      })),
    );
    await emit(c, "import", c.req.param("id"), result);
    return c.json(result);
  });

  app.get("/v1/workspaces/:id/messages", async (c) => c.json(await store.listMessages(c.req.param("id"))));
  app.get("/v1/workspaces/:id/members", async (c) => c.json(await store.listMembers(c.req.param("id"))));
  app.get("/v1/workspaces/:id/files", async (c) => c.json(await store.listFiles(c.req.param("id"))));

  app.get("/v1/workspaces/:id/export", async (c) => {
    const data = await exportWorkspace(store, c.req.param("id"));
    c.header("content-disposition", `attachment; filename="${data.workspace?.slug ?? c.req.param("id")}-export.json"`);
    return c.json(data);
  });

  app.get("/v1/members/:memberId", async (c) => {
    const member = await store.getMember(c.req.param("memberId"));
    if (!member) throw new HTTPException(404, { message: "member not found" });
    return c.json(await memberCard(store, member.id));
  });

  app.patch("/v1/members/:memberId", async (c) => {
    const member = await store.getMember(c.req.param("memberId"));
    if (!member) throw new HTTPException(404, { message: "member not found" });
    const patch = await c.req.json();
    const updated = await store.updateMember(member.id, patch, true);
    if (updated.publicOptIn && !updated.publicSlug) {
      await assignPublicSlug(store, updated.id);
      return c.json(await store.getMember(updated.id));
    }
    return c.json(updated);
  });

  app.post("/v1/workspaces/:id/memory", async (c) => {
    await requireWorkspace(c.req.param("id"));
    const result = await refreshMemory(store, c.req.param("id"));
    await emit(c, "memory", c.req.param("id"), {
      members: result.members.length,
      demands: result.demands.length,
      resources: result.resources.length,
    });
    return c.json(result);
  });
  app.get("/v1/workspaces/:id/briefing", async (c) => c.json(await briefing(store, c.req.param("id"))));
  app.get("/v1/workspaces/:id/demands", async (c) => c.json(await store.listDemands(c.req.param("id"))));
  app.get("/v1/demands/:demandId", async (c) => {
    const demand = await store.getDemand(c.req.param("demandId"));
    if (!demand) throw new HTTPException(404, { message: "demand not found" });
    return c.json(await openDemand(store, demand.id));
  });
  app.get("/v1/workspaces/:id/resources", async (c) => c.json(await store.listResources(c.req.param("id"))));
  app.get("/v1/workspaces/:id/timeline", async (c) => c.json(await store.listTimeline(c.req.param("id"))));

  app.post("/v1/workspaces/:id/venues", async (c) => {
    await requireWorkspace(c.req.param("id"));
    const body = await c.req.json<{ name: string; area?: string; capacity?: number; contact?: string }>();
    return c.json(
      await store.upsertVenue({
        id: crypto.randomUUID(),
        communityId: c.req.param("id"),
        name: body.name,
        area: body.area ?? null,
        capacity: body.capacity ?? null,
        contact: body.contact ?? null,
      }),
      201,
    );
  });
  app.get("/v1/workspaces/:id/venues", async (c) => c.json(await store.listVenues(c.req.param("id"))));
  app.get("/v1/workspaces/:id/sponsors", async (c) => c.json(await store.listSponsors(c.req.param("id"))));

  app.post("/v1/workspaces/:id/sponsors", async (c) => {
    await requireWorkspace(c.req.param("id"));
    const body = await c.req.json<{ name: string; notes?: string }>();
    return c.json(
      await store.upsertSponsor({
        id: crypto.randomUUID(),
        communityId: c.req.param("id"),
        name: body.name,
        notes: body.notes ?? null,
      }),
      201,
    );
  });

  app.post("/v1/workspaces/:id/proposals", async (c) => {
    await requireWorkspace(c.req.param("id"));
    const body = await c.req.json<{ demandId: string }>();
    const pack = await createProposalFromDemand(store, c.req.param("id"), body.demandId);
    await emit(c, "proposal", c.req.param("id"), pack);
    return c.json(pack, 201);
  });
  app.get("/v1/workspaces/:id/proposals", async (c) => c.json(await store.listProposals(c.req.param("id"))));
  app.get("/v1/proposals/:proposalId", async (c) => {
    const proposal = await requireProposal(store, c.req.param("proposalId"));
    return c.json(await openProposal(store, proposal.id));
  });
  app.post("/v1/proposals/:proposalId/approve", async (c) => {
    const proposal = await requireProposal(store, c.req.param("proposalId"));
    const pack = await setProposalStatus(store, proposal.id, "approved");
    await emit(c, "proposal", proposal.communityId, pack);
    return c.json(pack);
  });
  app.post("/v1/proposals/:proposalId/outreach", async (c) => {
    const proposal = await requireProposal(store, c.req.param("proposalId"));
    const workspace = await store.getWorkspace(proposal.communityId);
    const pack = await makeOutreachDraft(store, proposal.id, workspace?.name ?? "Community");
    await emit(c, "proposal", proposal.communityId, pack);
    return c.json(pack);
  });
  app.post("/v1/proposals/:proposalId/go-live", async (c) => {
    const proposal = await requireProposal(store, c.req.param("proposalId"));
    const event = await goLive(store, proposal.id, requestOrigin(c));
    await emit(c, "published", proposal.communityId, event);
    return c.json(event);
  });

  app.get("/v1/workspaces/:id/events", async (c) => c.json(await store.listEvents(c.req.param("id"))));
  app.get("/v1/events/:eventId/chain", async (c) => {
    const event = await requireEvent(store, c.req.param("eventId"));
    return c.json(await eventChainById(store, event.id));
  });
  app.get("/v1/events/:eventId/guests", async (c) => {
    const event = await requireEvent(store, c.req.param("eventId"));
    return c.json(await store.listGuests(event.id));
  });
  app.post("/v1/events/:eventId/autopilot", async (c) => {
    const event = await requireEvent(store, c.req.param("eventId"));
    return c.json(await generateAutopilot(store, event.id, requestOrigin(c)));
  });

  app.post("/v1/ingest/discord", async (c) => {
    const body = await c.req.json<{
      communityId: string;
      id: string;
      content: string;
      timestamp: string;
      author: { id: string; username: string };
    }>();
    await requireWorkspace(body.communityId);
    const result = await ingestDiscord(store, body.communityId, body);
    await emit(c, "import", body.communityId, result);
    return c.json(result);
  });

  app.post("/v1/workspaces/:id/applications", async (c) => {
    const body = await c.req.json<{ applicant: string; answers: string }>();
    const workspace = await requireWorkspace(c.req.param("id"));
    const application = await submitApplication(store, c.req.param("id"), {
      applicant: body.applicant,
      answers: body.answers,
      communityName: workspace.name,
    });
    await emit(c, "application", c.req.param("id"), application);
    return c.json(application);
  });
  app.get("/v1/workspaces/:id/applications", async (c) =>
    c.json(await store.listApplications(c.req.param("id"))),
  );
  app.post("/v1/workspaces/:id/blocklist", async (c) => {
    await requireWorkspace(c.req.param("id"));
    const body = await c.req.json<{ applicant: string; evidence: string; confirmed?: boolean }>();
    const hash = await sha256Hex(body.applicant.trim().toLowerCase());
    return c.json(
      await store.addBlocklist({
        id: crypto.randomUUID(),
        communityId: c.req.param("id"),
        hash,
        evidence: body.evidence,
        reporter: LOCAL_IDENTITY,
        confirmed: body.confirmed ?? false,
      }),
    );
  });

  app.get("/v1/public/communities/:slug", async (c) => {
    return c.json(await publicOr404(() => publicCommunity(store, c.req.param("slug"), requestOrigin(c))));
  });
  app.get("/v1/public/events/:slug", async (c) => {
    const event = await publicOr404(() => publicEvent(store, c.req.param("slug")));
    await recordEventPageView(store, event.slug);
    return c.json(event);
  });
  app.post("/v1/public/events/:slug/rsvp", async (c) => {
    const body = await c.req.json<{ name?: string; email?: string }>();
    const guest = await rsvp(store, c.req.param("slug"), { name: body.name ?? "", email: body.email ?? "" });
    await emit(c, "rsvp", guest.communityId, guest);
    return c.json(guest, 201);
  });
  app.get("/v1/public/members/:slug", async (c) =>
    c.json(await publicOr404(() => publicMember(store, c.req.param("slug")))),
  );

  app.get("/v1/search", async (c) => {
    const q = (c.req.query("q") ?? "").toLowerCase();
    const workspaces = await store.listWorkspaces();
    const hits = [];
    for (const ws of workspaces) {
      for (const member of await store.listMembers(ws.id)) {
        const blob = `${member.displayName} ${member.do} ${member.want} ${member.offer}`.toLowerCase();
        if (blob.includes(q)) hits.push({ type: "member", workspaceId: ws.id, member });
      }
      for (const demand of await store.listDemands(ws.id)) {
        if (demand.topic.toLowerCase().includes(q)) hits.push({ type: "demand", workspaceId: ws.id, demand });
      }
    }
    return c.json(hits);
  });

  app.post("/v1/workspaces/:id/webhooks", async (c) => {
    await requireWorkspace(c.req.param("id"));
    const body = await c.req.json<{ url?: string; kinds?: string[] }>();
    let url: URL;
    try {
      url = new URL(body.url ?? "");
    } catch {
      throw new HTTPException(400, { message: "valid url required" });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new HTTPException(400, { message: "url must be http or https" });
    }
    const sub = await store.createWebhookSubscription({
      communityId: c.req.param("id"),
      url: url.toString(),
      secret: randomSecret(),
      kinds: body.kinds ?? [],
    });
    return c.json(sub, 201);
  });

  app.get("/v1/workspaces/:id/webhooks", async (c) => {
    await requireWorkspace(c.req.param("id"));
    const subs = await store.listWebhookSubscriptions(c.req.param("id"));
    return c.json(subs.map(({ secret: _secret, ...rest }) => rest));
  });

  app.delete("/v1/webhooks/:id", async (c) => {
    const deleted = await store.deleteWebhookSubscription(c.req.param("id"));
    if (!deleted) throw new HTTPException(404, { message: "webhook not found" });
    return c.json({ ok: true });
  });

  mountMcp(app);

  return app;
}

function requestOrigin(c: Context): string {
  return c.req.header("x-public-origin") || c.req.header("origin") || new URL(c.req.url).origin;
}

async function publicOr404<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new HTTPException(404, { message: err instanceof Error ? err.message : "not found" });
  }
}

async function requireProposal(store: Store, proposalId: string) {
  const proposal = await store.getProposal(proposalId);
  if (!proposal) throw new HTTPException(404, { message: "proposal not found" });
  return proposal;
}

async function requireEvent(store: Store, eventId: string) {
  const event = await store.getEvent(eventId);
  if (!event) throw new HTTPException(404, { message: "event not found" });
  return event;
}


export const memoryStore = new MemoryStore();
