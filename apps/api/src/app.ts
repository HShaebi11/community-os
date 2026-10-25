import {
  assignPublicSlug,
  briefing,
  createProposalFromDemand,
  eventChainById,
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
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { Auth } from "./auth.ts";
import { devOutbox } from "./email.ts";
import { mountMcp } from "./mcp.ts";

export type AuthKind = "session" | "token" | "cookie";

export type AppEnv = {
  Variables: {
    store: Store;
    userId: string;
    email: string;
    userName: string | null;
    authKind: AuthKind;
  };
};

export type AppOptions = {
  allowDevAuth?: boolean;
  appOrigins?: string[];
  providers?: { google: boolean; email: "resend" | "log" };
};

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function isTrustedOrigin(origin: string, appOrigins: string[], allowDevAuth: boolean): boolean {
  if (appOrigins.includes(origin)) return true;
  return allowDevAuth && LOOPBACK_ORIGIN.test(origin);
}

export function createApp(store: Store, auth?: Auth, opts: AppOptions = {}) {
  const allowDevAuth = opts.allowDevAuth ?? !auth;
  const appOrigins = opts.appOrigins ?? [];
  const providers = opts.providers ?? { google: false, email: "log" };
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

  if (auth) {
    app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  }

  app.post("/v1/auth/dev", async (c) => {
    if (!allowDevAuth) throw new HTTPException(404, { message: "not found" });
    const body = await c.req.json<{ email?: string }>();
    if (!body.email) throw new HTTPException(400, { message: "email required" });
    const user = await store.upsertUser(body.email);
    const session = await store.createSession(user);
    return c.json({ token: session.token, userId: user.id, email: user.email });
  });

  app.get("/v1/auth/providers", (c) =>
    c.json({ password: true, magicLink: true, google: providers.google, email: providers.email, devAuth: allowDevAuth }),
  );

  app.get("/v1/health", (c) => c.json({ ok: true, product: "community-os" }));

  if (allowDevAuth) {
    app.get("/v1/dev/outbox", (c) => c.json(devOutbox));
  }

  const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (bearer.startsWith("cos_")) {
      const session = await store.getSessionByApiTokenHash(await sha256Hex(bearer));
      if (!session) throw new HTTPException(401, { message: "unauthorized" });
      c.set("userId", session.userId);
      c.set("email", session.email);
      c.set("userName", session.name ?? null);
      c.set("authKind", "token");
    } else if (bearer) {
      const session = await store.getSession(bearer);
      if (!session) throw new HTTPException(401, { message: "unauthorized" });
      c.set("userId", session.userId);
      c.set("email", session.email);
      c.set("userName", session.name ?? null);
      c.set("authKind", "session");
    } else if (auth) {
      const result = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!result) throw new HTTPException(401, { message: "unauthorized" });
      if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        const origin = c.req.header("origin") ?? "";
        if (!isTrustedOrigin(origin, appOrigins, allowDevAuth))
          throw new HTTPException(403, { message: "untrusted origin" });
      }
      c.set("userId", result.user.id);
      c.set("email", result.user.email);
      c.set("userName", result.user.name ?? null);
      c.set("authKind", "cookie");
    } else {
      throw new HTTPException(401, { message: "unauthorized" });
    }
    await next();
  };

  app.get("/v1/me", requireAuth, async (c) =>
    c.json({ userId: c.get("userId"), email: c.get("email"), name: c.get("userName"), authKind: c.get("authKind") }),
  );

  const requireSessionOrCookie: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (c.get("authKind") === "token") throw new HTTPException(403, { message: "tokens cannot manage tokens" });
    await next();
  };

  app.post("/v1/tokens", requireAuth, requireSessionOrCookie, async (c) => {
    const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = `cos_${btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
    const created = await store.createApiToken({
      userId: c.get("userId"),
      name: body.name || "token",
      prefix: token.slice(0, 8),
      tokenHash: await sha256Hex(token),
    });
    return c.json(
      { id: created.id, name: created.name, prefix: created.prefix, token, createdAt: created.createdAt },
      201,
    );
  });

  app.get("/v1/tokens", requireAuth, async (c) => c.json(await store.listApiTokens(c.get("userId"))));

  app.delete("/v1/tokens/:id", requireAuth, requireSessionOrCookie, async (c) => {
    const ok = await store.revokeApiToken(c.req.param("id"), c.get("userId"));
    if (!ok) throw new HTTPException(404, { message: "token not found" });
    return c.json({ ok: true });
  });

  app.post("/v1/workspaces", requireAuth, async (c) => {
    const body = await c.req.json<{ name?: string; joinUrl?: string }>();
    if (!body.name) throw new HTTPException(400, { message: "name required" });
    const workspace = await store.createWorkspace({
      name: body.name,
      createdBy: c.get("userId"),
      joinUrl: body.joinUrl,
    });
    return c.json(workspace, 201);
  });

  app.get("/v1/workspaces", requireAuth, async (c) => {
    return c.json(await store.listWorkspacesForUser(c.get("userId")));
  });

  const lead: MiddlewareHandler<AppEnv> = async (c, next) => {
    const id = c.req.param("id") ?? c.req.param("workspaceId");
    if (!id || !(await store.isLead(id, c.get("userId")))) {
      throw new HTTPException(403, { message: "not a lead of this workspace" });
    }
    await next();
  };

  app.get("/v1/workspaces/by-slug/:slug", requireAuth, async (c) => {
    const workspace = await store.getWorkspaceBySlug(c.req.param("slug"));
    if (!workspace) throw new HTTPException(404, { message: "workspace not found" });
    const list = await store.listWorkspacesForUser(c.get("userId"));
    const entry = list.find((w) => w.id === workspace.id);
    if (!entry) throw new HTTPException(404, { message: "workspace not found" });
    return c.json(entry);
  });

  app.get("/v1/workspaces/:id", requireAuth, lead, async (c) => c.json(await store.getWorkspace(c.req.param("id"))));

  app.patch("/v1/workspaces/:id", requireAuth, lead, async (c) => {
    const body = await c.req.json<{ name?: string; joinUrl?: string | null }>();
    return c.json(await store.updateWorkspace(c.req.param("id"), { name: body.name, joinUrl: body.joinUrl }));
  });

  app.post("/v1/workspaces/:id/imports", requireAuth, lead, async (c) => {
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
    return c.json(result);
  });

  app.get("/v1/workspaces/:id/messages", requireAuth, lead, async (c) => c.json(await store.listMessages(c.req.param("id"))));
  app.get("/v1/workspaces/:id/members", requireAuth, lead, async (c) => c.json(await store.listMembers(c.req.param("id"))));
  app.get("/v1/workspaces/:id/files", requireAuth, lead, async (c) => c.json(await store.listFiles(c.req.param("id"))));

  app.get("/v1/workspaces/:id/export", requireAuth, lead, async (c) => {
    const data = await exportWorkspace(store, c.req.param("id"));
    c.header("content-disposition", `attachment; filename="${data.workspace?.slug ?? c.req.param("id")}-export.json"`);
    return c.json(data);
  });

  app.get("/v1/members/:memberId", requireAuth, async (c) => {
    const member = await store.getMember(c.req.param("memberId"));
    if (!member || !(await store.isLead(member.communityId, c.get("userId")))) {
      throw new HTTPException(403, { message: "forbidden" });
    }
    return c.json(await memberCard(store, member.id));
  });

  app.patch("/v1/members/:memberId", requireAuth, async (c) => {
    const member = await store.getMember(c.req.param("memberId"));
    if (!member || !(await store.isLead(member.communityId, c.get("userId")))) {
      throw new HTTPException(403, { message: "forbidden" });
    }
    const patch = await c.req.json();
    const updated = await store.updateMember(member.id, patch, true);
    if (updated.publicOptIn && !updated.publicSlug) {
      await assignPublicSlug(store, updated.id);
      return c.json(await store.getMember(updated.id));
    }
    return c.json(updated);
  });

  app.post("/v1/workspaces/:id/memory", requireAuth, lead, async (c) => {
    return c.json(await refreshMemory(store, c.req.param("id")));
  });
  app.get("/v1/workspaces/:id/briefing", requireAuth, lead, async (c) => c.json(await briefing(store, c.req.param("id"))));
  app.get("/v1/workspaces/:id/demands", requireAuth, lead, async (c) => c.json(await store.listDemands(c.req.param("id"))));
  app.get("/v1/demands/:demandId", requireAuth, async (c) => {
    const demand = await store.getDemand(c.req.param("demandId"));
    if (!demand || !(await store.isLead(demand.communityId, c.get("userId")))) {
      throw new HTTPException(403, { message: "forbidden" });
    }
    return c.json(await openDemand(store, demand.id));
  });
  app.get("/v1/workspaces/:id/resources", requireAuth, lead, async (c) => c.json(await store.listResources(c.req.param("id"))));
  app.get("/v1/workspaces/:id/timeline", requireAuth, lead, async (c) => c.json(await store.listTimeline(c.req.param("id"))));

  app.post("/v1/workspaces/:id/venues", requireAuth, lead, async (c) => {
    const body = await c.req.json<{ name: string; area?: string; capacity?: number; contact?: string }>();
    return c.json(
      await store.upsertVenue({
        id: crypto.randomUUID(),
        communityId: c.req.param("id"),
        name: body.name,
        area: body.area ?? null,
        capacity: body.capacity ?? null,
        contact: body.contact ?? null,
        userId: null,
      }),
      201,
    );
  });
  app.get("/v1/workspaces/:id/venues", requireAuth, lead, async (c) => c.json(await store.listVenues(c.req.param("id"))));
  app.post("/v1/venues/:venueId/claim", requireAuth, async (c) => {
    const venue = await store.getVenue(c.req.param("venueId"));
    if (!venue) throw new HTTPException(404, { message: "venue not found" });
    venue.userId = c.get("userId");
    return c.json(await store.upsertVenue(venue));
  });
  app.get("/v1/workspaces/:id/sponsors", requireAuth, lead, async (c) => c.json(await store.listSponsors(c.req.param("id"))));

  app.post("/v1/workspaces/:id/sponsors", requireAuth, lead, async (c) => {
    const body = await c.req.json<{ name: string; notes?: string }>();
    return c.json(
      await store.upsertSponsor({
        id: crypto.randomUUID(),
        communityId: c.req.param("id"),
        name: body.name,
        notes: body.notes ?? null,
        userId: null,
      }),
      201,
    );
  });
  app.post("/v1/sponsors/:sponsorId/claim", requireAuth, async (c) => {
    const sponsor = await store.getSponsor(c.req.param("sponsorId"));
    if (!sponsor) throw new HTTPException(404, { message: "sponsor not found" });
    sponsor.userId = c.get("userId");
    return c.json(await store.upsertSponsor(sponsor));
  });

  app.post("/v1/workspaces/:id/proposals", requireAuth, lead, async (c) => {
    const body = await c.req.json<{ demandId: string }>();
    return c.json(await createProposalFromDemand(store, c.req.param("id"), body.demandId), 201);
  });
  app.get("/v1/workspaces/:id/proposals", requireAuth, lead, async (c) => c.json(await store.listProposals(c.req.param("id"))));
  app.get("/v1/proposals/:proposalId", requireAuth, async (c) => {
    const proposal = await requireProposalLead(store, c.req.param("proposalId"), c.get("userId"));
    return c.json(await openProposal(store, proposal.id));
  });
  app.post("/v1/proposals/:proposalId/approve", requireAuth, async (c) => {
    const proposal = await requireProposalLead(store, c.req.param("proposalId"), c.get("userId"));
    return c.json(await setProposalStatus(store, proposal.id, "approved"));
  });
  app.post("/v1/proposals/:proposalId/outreach", requireAuth, async (c) => {
    const proposal = await requireProposalLead(store, c.req.param("proposalId"), c.get("userId"));
    const workspace = await store.getWorkspace(proposal.communityId);
    return c.json(await makeOutreachDraft(store, proposal.id, workspace?.name ?? "Community"));
  });
  app.post("/v1/proposals/:proposalId/go-live", requireAuth, async (c) => {
    const proposal = await requireProposalLead(store, c.req.param("proposalId"), c.get("userId"));
    return c.json(await goLive(store, proposal.id, requestOrigin(c)));
  });

  app.get("/v1/workspaces/:id/events", requireAuth, lead, async (c) => c.json(await store.listEvents(c.req.param("id"))));
  app.get("/v1/events/:eventId/chain", requireAuth, async (c) => {
    const event = await store.getEvent(c.req.param("eventId"));
    if (!event || !(await store.isLead(event.communityId, c.get("userId")))) {
      throw new HTTPException(403, { message: "forbidden" });
    }
    return c.json(await eventChainById(store, event.id));
  });
  app.get("/v1/events/:eventId/guests", requireAuth, async (c) => {
    const event = await store.getEvent(c.req.param("eventId"));
    if (!event || !(await store.isLead(event.communityId, c.get("userId")))) {
      throw new HTTPException(403, { message: "forbidden" });
    }
    return c.json(await store.listGuests(event.id));
  });
  app.post("/v1/events/:eventId/autopilot", requireAuth, async (c) => {
    const event = await store.getEvent(c.req.param("eventId"));
    if (!event || !(await store.isLead(event.communityId, c.get("userId")))) {
      throw new HTTPException(403, { message: "forbidden" });
    }
    return c.json(await generateAutopilot(store, event.id, requestOrigin(c)));
  });

  app.post("/v1/ingest/discord", requireAuth, async (c) => {
    const body = await c.req.json<{
      communityId: string;
      id: string;
      content: string;
      timestamp: string;
      author: { id: string; username: string };
    }>();
    if (!(await store.isLead(body.communityId, c.get("userId")))) {
      throw new HTTPException(403, { message: "forbidden" });
    }
    return c.json(await ingestDiscord(store, body.communityId, body));
  });

  app.post("/v1/workspaces/:id/applications", requireAuth, lead, async (c) => {
    const body = await c.req.json<{ applicant: string; answers: string }>();
    const workspace = await store.getWorkspace(c.req.param("id"));
    return c.json(
      await submitApplication(store, c.req.param("id"), {
        applicant: body.applicant,
        answers: body.answers,
        communityName: workspace?.name ?? "",
      }),
    );
  });
  app.get("/v1/workspaces/:id/applications", requireAuth, lead, async (c) =>
    c.json(await store.listApplications(c.req.param("id"))),
  );
  app.post("/v1/workspaces/:id/blocklist", requireAuth, lead, async (c) => {
    const body = await c.req.json<{ applicant: string; evidence: string; confirmed?: boolean }>();
    const hash = await sha256Hex(body.applicant.trim().toLowerCase());
    return c.json(
      await store.addBlocklist({
        id: crypto.randomUUID(),
        communityId: c.req.param("id"),
        hash,
        evidence: body.evidence,
        reporter: c.get("email"),
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
    return c.json(await rsvp(store, c.req.param("slug"), { name: body.name ?? "", email: body.email ?? "" }), 201);
  });
  app.get("/v1/public/members/:slug", async (c) =>
    c.json(await publicOr404(() => publicMember(store, c.req.param("slug")))),
  );

  app.get("/v1/search", requireAuth, async (c) => {
    const q = (c.req.query("q") ?? "").toLowerCase();
    const workspaces = await store.listWorkspacesForUser(c.get("userId"));
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

async function exportWorkspace(store: Store, communityId: string) {
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

async function requireProposalLead(store: Store, proposalId: string, userId: string) {
  const proposal = await store.getProposal(proposalId);
  if (!proposal || !(await store.isLead(proposal.communityId, userId))) {
    throw new HTTPException(403, { message: "forbidden" });
  }
  return proposal;
}

export const memoryStore = new MemoryStore();
