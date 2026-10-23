import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "@community-os/core";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import type { Auth } from "./auth.ts";

const chat = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/whatsapp-sample/_chat.txt"),
);

describe("kernel API", () => {
  it("curl path: auth → workspace → import → members", async () => {
    const app = createApp(new MemoryStore());
    const auth = await app.request("/v1/auth/dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com" }),
    });
    expect(auth.status).toBe(200);
    const { token } = (await auth.json()) as { token: string };
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };
    expect(workspace.id).toBeTruthy();

    const imported = await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
      body: chat,
    });
    const result = (await imported.json()) as { inserted: number; members: unknown[] };
    expect(imported.status).toBe(200);
    expect(result.inserted).toBeGreaterThan(0);
    expect(result.members.length).toBeGreaterThan(2);

    const members = await app.request(`/v1/workspaces/${workspace.id}/members`, { headers });
    const list = (await members.json()) as unknown[];
    expect(list.length).toBe(result.members.length);
  });

  it("curl path: import → memory → cited member and demand cards", async () => {
    const app = createApp(new MemoryStore());
    const auth = await app.request("/v1/auth/dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com" }),
    });
    const { token } = (await auth.json()) as { token: string };
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };

    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
      body: chat,
    });

    const memoryRes = await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST", headers });
    expect(memoryRes.status).toBe(200);
    const memory = (await memoryRes.json()) as {
      members: Array<{ id: string; do: string | null; want: string | null; offer: string | null }>;
      demands: Array<{ id: string }>;
      resources: Array<{ url: string }>;
    };
    expect(memory.members.some((m) => m.do || m.want || m.offer)).toBe(true);
    expect(memory.demands.length).toBeGreaterThan(0);

    const filled = memory.members.find((m) => m.do || m.want || m.offer)!;
    const cardRes = await app.request(`/v1/members/${filled.id}`, { headers });
    const card = (await cardRes.json()) as { citations: Array<{ quote: string }> };
    expect(cardRes.status).toBe(200);
    expect(card.citations.length).toBeGreaterThan(0);

    const briefRes = await app.request(`/v1/workspaces/${workspace.id}/briefing`, { headers });
    const brief = (await briefRes.json()) as {
      people: number;
      topDemands: unknown[];
      resources: Array<{ url: string }>;
    };
    expect(brief.people).toBeGreaterThan(2);
    expect(brief.topDemands.length).toBeGreaterThan(0);
    expect(brief.resources.some((r) => r.url.includes("example.com/community-os-notes"))).toBe(true);

    const demandRes = await app.request(`/v1/demands/${memory.demands[0].id}`, { headers });
    const demand = (await demandRes.json()) as { title: string | null; citations: unknown[] };
    expect(demandRes.status).toBe(200);
    expect(demand.title).toBeTruthy();
    expect(demand.citations.length).toBeGreaterThan(0);

    const resources = await app.request(`/v1/workspaces/${workspace.id}/resources`, { headers });
    const list = (await resources.json()) as Array<{ url: string }>;
    expect(list.some((r) => r.url === "https://example.com/community-os-notes")).toBe(true);
  });

  it("curl path: demand → proposal pack → approve → outreach", async () => {
    const app = createApp(new MemoryStore());
    const auth = await app.request("/v1/auth/dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com" }),
    });
    const { token } = (await auth.json()) as { token: string };
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };

    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
      body: chat,
    });

    const memoryRes = await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST", headers });
    const memory = (await memoryRes.json()) as { demands: Array<{ id: string }> };
    expect(memory.demands.length).toBeGreaterThan(0);

    const venueRes = await app.request(`/v1/workspaces/${workspace.id}/venues`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Expedite HQ", area: "Hammersmith", capacity: 80 }),
    });
    expect(venueRes.status).toBe(201);

    const created = await app.request(`/v1/workspaces/${workspace.id}/proposals`, {
      method: "POST",
      headers,
      body: JSON.stringify({ demandId: memory.demands[0].id }),
    });
    expect(created.status).toBe(201);
    const pack = (await created.json()) as {
      id: string;
      status: string;
      explanation: string | null;
      speakers: unknown[];
      venue: { name: string } | null;
      citations: Array<{ quote: string }>;
    };
    expect(pack.status).toBe("draft");
    expect(pack.speakers.length).toBeGreaterThan(0);
    expect(pack.venue?.name).toBe("Expedite HQ");
    expect(pack.explanation).toBeTruthy();
    expect(pack.citations.length).toBeGreaterThan(0);

    const got = await app.request(`/v1/proposals/${pack.id}`, { headers });
    expect(got.status).toBe(200);
    const opened = (await got.json()) as { id: string; speakers: unknown[] };
    expect(opened.id).toBe(pack.id);
    expect(opened.speakers.length).toBe(pack.speakers.length);

    const approved = await app.request(`/v1/proposals/${pack.id}/approve`, { method: "POST", headers });
    expect(approved.status).toBe(200);
    const approvedPack = (await approved.json()) as { status: string };
    expect(approvedPack.status).toBe("approved");

    const outreach = await app.request(`/v1/proposals/${pack.id}/outreach`, { method: "POST", headers });
    expect(outreach.status).toBe(200);
    const drafted = (await outreach.json()) as { outreachDraft: string | null };
    expect(drafted.outreachDraft).toMatch(/Weird Stuff/);
  });

  it("curl path: go-live → public pages → RSVP → guests", async () => {
    const app = createApp(new MemoryStore());
    const auth = await app.request("/v1/auth/dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com" }),
    });
    const { token } = (await auth.json()) as { token: string };
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string; slug: string };

    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
      body: chat,
    });
    const memoryRes = await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST", headers });
    const memory = (await memoryRes.json()) as { demands: Array<{ id: string }>; members: Array<{ id: string }> };
    await app.request(`/v1/workspaces/${workspace.id}/venues`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Expedite HQ", area: "Hammersmith", capacity: 80 }),
    });
    const created = await app.request(`/v1/workspaces/${workspace.id}/proposals`, {
      method: "POST",
      headers,
      body: JSON.stringify({ demandId: memory.demands[0].id }),
    });
    const pack = (await created.json()) as { id: string; speakers: Array<{ id: string }> };
    await app.request(`/v1/proposals/${pack.id}/approve`, { method: "POST", headers });
    const live = await app.request(`/v1/proposals/${pack.id}/go-live`, { method: "POST", headers });
    expect(live.status).toBe(200);
    const event = (await live.json()) as { id: string; slug: string; title: string };

    const rsvpRes = await app.request(`/v1/public/events/${event.slug}/rsvp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Guest", email: "guest@example.com" }),
    });
    expect(rsvpRes.status).toBe(201);
    const guests = await app.request(`/v1/events/${event.id}/guests`, { headers });
    const list = (await guests.json()) as Array<{ email: string }>;
    expect(list.some((g) => g.email === "guest@example.com")).toBe(true);

    const pub = await app.request(`/v1/public/events/${event.slug}`);
    expect(pub.status).toBe(200);
    const body = (await pub.json()) as {
      title: string;
      venue: { name: string } | null;
      messages?: unknown;
      demand?: unknown;
    };
    expect(body.title).toBe(event.title);
    expect(body.venue?.name).toBe("Expedite HQ");
    expect(body.messages).toBeUndefined();
    expect(body.demand).toBeUndefined();

    const community = await app.request(`/v1/public/communities/${workspace.slug}`);
    expect(community.status).toBe(200);
    const communityBody = (await community.json()) as { qrSvg: string; name: string };
    expect(communityBody.qrSvg).toContain("<svg");
    expect(communityBody.name).toBeTruthy();

    const hidden = await app.request(`/v1/public/members/not-a-member`);
    expect(hidden.status).toBe(404);

    const opted = await app.request(`/v1/members/${pack.speakers[0].id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ publicOptIn: true }),
    });
    const member = (await opted.json()) as { publicSlug: string; publicOptIn: boolean };
    expect(member.publicOptIn).toBe(true);
    expect(member.publicSlug).toBeTruthy();
    const publicMember = await app.request(`/v1/public/members/${member.publicSlug}`);
    expect(publicMember.status).toBe(200);
    const publicBody = (await publicMember.json()) as Record<string, unknown>;
    expect(publicBody.want).toBeUndefined();

    const chain = await app.request(`/v1/events/${event.id}/chain`, { headers });
    expect(chain.status).toBe(200);
    const privateChain = (await chain.json()) as { messages: unknown[] };
    expect(privateChain.messages.length).toBeGreaterThan(0);
  });

  it("desk and search are clients of the same /v1 memory", async () => {
    const app = createApp(new MemoryStore());
    const auth = await app.request("/v1/auth/dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com" }),
    });
    const { token } = (await auth.json()) as { token: string };
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const ws = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await ws.json()) as { id: string };
    await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
      body: chat,
    });
    await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST", headers });
    const search = await app.request("/v1/search?q=workshop", { headers });
    expect(search.status).toBe(200);
    const hits = (await search.json()) as Array<{ type: string }>;
    expect(hits.some((h) => h.type === "member" || h.type === "demand")).toBe(true);
  });
});

describe("auth modes and workspace admin", () => {
  async function devToken(app: ReturnType<typeof createApp>, email = "lead@example.com") {
    const res = await app.request("/v1/auth/dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const { token } = (await res.json()) as { token: string };
    return { authorization: `Bearer ${token}`, "content-type": "application/json" };
  }

  it("hides dev auth when allowDevAuth is false", async () => {
    const app = createApp(new MemoryStore(), undefined, { allowDevAuth: false });
    const res = await app.request("/v1/auth/dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com" }),
    });
    expect(res.status).toBe(404);
    const providers = await app.request("/v1/auth/providers");
    const body = (await providers.json()) as { devAuth: boolean };
    expect(body.devAuth).toBe(false);
  });

  it("agent token lifecycle: mint, use, list, no mint from token, revoke", async () => {
    const app = createApp(new MemoryStore());
    const headers = await devToken(app);

    const created = await app.request("/v1/tokens", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "mcp" }),
    });
    expect(created.status).toBe(201);
    const token = (await created.json()) as { id: string; token: string; prefix: string };
    expect(token.token.startsWith("cos_")).toBe(true);
    expect(token.prefix).toBe(token.token.slice(0, 8));

    const cos = { authorization: `Bearer ${token.token}`, "content-type": "application/json" };
    const workspaces = await app.request("/v1/workspaces", { headers: cos });
    expect(workspaces.status).toBe(200);

    const list = await app.request("/v1/tokens", { headers });
    const tokens = (await list.json()) as Array<Record<string, unknown>>;
    expect(tokens.length).toBe(1);
    expect(tokens[0].token).toBeUndefined();
    expect(tokens[0].tokenHash).toBeUndefined();

    const minted = await app.request("/v1/tokens", { method: "POST", headers: cos, body: JSON.stringify({ name: "x" }) });
    expect(minted.status).toBe(403);

    const revoked = await app.request(`/v1/tokens/${token.id}`, { method: "DELETE", headers });
    expect(revoked.status).toBe(200);
    const after = await app.request("/v1/workspaces", { headers: cos });
    expect(after.status).toBe(401);
  });

  it("workspaces list includes the caller role", async () => {
    const app = createApp(new MemoryStore());
    const headers = await devToken(app);
    await app.request("/v1/workspaces", { method: "POST", headers, body: JSON.stringify({ name: "Weird Stuff" }) });
    const res = await app.request("/v1/workspaces", { headers });
    const list = (await res.json()) as Array<{ role: string }>;
    expect(list[0].role).toBe("owner");
  });

  it("by-slug resolves for a lead and 404s for another user", async () => {
    const app = createApp(new MemoryStore());
    const headers = await devToken(app);
    const created = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await created.json()) as { slug: string };

    const res = await app.request(`/v1/workspaces/by-slug/${workspace.slug}`, { headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string; role: string };
    expect(body.slug).toBe(workspace.slug);
    expect(body.role).toBe("owner");

    const other = await devToken(app, "other@example.com");
    const denied = await app.request(`/v1/workspaces/by-slug/${workspace.slug}`, { headers: other });
    expect([403, 404]).toContain(denied.status);
  });

  it("PATCH workspace updates the name and rejects non-leads", async () => {
    const app = createApp(new MemoryStore());
    const headers = await devToken(app);
    const created = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    const workspace = (await created.json()) as { id: string };

    const patched = await app.request(`/v1/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: "Weirder Stuff", joinUrl: "https://chat.example.com/x" }),
    });
    expect(patched.status).toBe(200);
    const body = (await patched.json()) as { name: string; joinUrl: string };
    expect(body.name).toBe("Weirder Stuff");
    expect(body.joinUrl).toBe("https://chat.example.com/x");

    const other = await devToken(app, "other@example.com");
    const denied = await app.request(`/v1/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers: other,
      body: JSON.stringify({ name: "Hijack" }),
    });
    expect(denied.status).toBe(403);
  });

  it("cookie auth enforces the Origin check on writes", async () => {
    const stubAuth = {
      api: {
        getSession: async () => ({
          user: { id: "cookie-user", email: "cookie@example.com", name: "Cookie" },
          session: { id: "s1" },
        }),
      },
    } as unknown as Auth;
    const app = createApp(new MemoryStore(), stubAuth, {
      allowDevAuth: true,
      appOrigins: ["http://localhost:3002"],
    });

    const evil = await app.request("/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.test" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(evil.status).toBe(403);

    const trusted = await app.request("/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3002" },
      body: JSON.stringify({ name: "From Cookie" }),
    });
    expect(trusted.status).toBe(201);

    const me = await app.request("/v1/me");
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { authKind: string; userId: string };
    expect(meBody.authKind).toBe("cookie");
    expect(meBody.userId).toBe("cookie-user");

    const headers = await devToken(app);
    const bearer = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "From Bearer" }),
    });
    expect(bearer.status).toBe(201);
  });

  it("allowDevAuth trusts cookie writes from any loopback origin", async () => {
    const stubAuth = {
      api: {
        getSession: async () => ({
          user: { id: "cookie-user", email: "cookie@example.com", name: "Cookie" },
          session: { id: "s1" },
        }),
      },
    } as unknown as Auth;
    const appOrigins = ["http://localhost:3002"];

    const devApp = createApp(new MemoryStore(), stubAuth, { allowDevAuth: true, appOrigins });
    const preview = await devApp.request("/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:57919" },
      body: JSON.stringify({ name: "Preview Community" }),
    });
    expect(preview.status).toBe(201);

    const prodApp = createApp(new MemoryStore(), stubAuth, { allowDevAuth: false, appOrigins });
    const denied = await prodApp.request("/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:57919" },
      body: JSON.stringify({ name: "Preview Community" }),
    });
    expect(denied.status).toBe(403);

    const evil = await devApp.request("/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.test" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(evil.status).toBe(403);
  });
});
