import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "@community-os/core";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

const chat = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/whatsapp-sample/_chat.txt"),
);

const headers = { "content-type": "application/json" };

describe("kernel loop", () => {
  it("import → memory → members (citations) → proposal → go-live → RSVP → guests", async () => {
    const app = createApp(new MemoryStore());

    const wsRes = await app.request("/v1/workspaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Weird Stuff" }),
    });
    expect(wsRes.status).toBe(201);
    const workspace = (await wsRes.json()) as { id: string; slug: string };

    const importRes = await app.request(`/v1/workspaces/${workspace.id}/imports?filename=_chat.txt`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: chat,
    });
    expect(importRes.status).toBe(200);
    const imported = (await importRes.json()) as { inserted: number; members: Array<{ id: string }> };
    expect(imported.inserted).toBeGreaterThan(0);
    expect(imported.members.length).toBeGreaterThan(2);

    const memoryRes = await app.request(`/v1/workspaces/${workspace.id}/memory`, { method: "POST", headers });
    expect(memoryRes.status).toBe(200);
    const memory = (await memoryRes.json()) as {
      members: Array<{ id: string; do: string | null; want: string | null; offer: string | null }>;
      demands: Array<{ id: string }>;
    };
    const filled = memory.members.find((m) => m.do || m.want || m.offer);
    expect(filled).toBeTruthy();
    expect(memory.demands.length).toBeGreaterThan(0);

    const membersRes = await app.request(`/v1/workspaces/${workspace.id}/members`, { headers });
    expect(membersRes.status).toBe(200);
    const members = (await membersRes.json()) as unknown[];
    expect(members.length).toBe(imported.members.length);

    const cardRes = await app.request(`/v1/members/${filled!.id}`, { headers });
    expect(cardRes.status).toBe(200);
    const card = (await cardRes.json()) as { citations: Array<{ quote: string; messageId: string }> };
    expect(card.citations.length).toBeGreaterThan(0);
    expect(card.citations[0].quote).toBeTruthy();
    expect(card.citations[0].messageId).toBeTruthy();

    const venueRes = await app.request(`/v1/workspaces/${workspace.id}/venues`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Expedite HQ", area: "Hammersmith", capacity: 80 }),
    });
    expect(venueRes.status).toBe(201);

    const proposalRes = await app.request(`/v1/workspaces/${workspace.id}/proposals`, {
      method: "POST",
      headers,
      body: JSON.stringify({ demandId: memory.demands[0].id }),
    });
    expect(proposalRes.status).toBe(201);
    const pack = (await proposalRes.json()) as {
      id: string;
      status: string;
      speakers: unknown[];
      citations: unknown[];
    };
    expect(pack.status).toBe("draft");
    expect(pack.speakers.length).toBeGreaterThan(0);
    expect(pack.citations.length).toBeGreaterThan(0);

    const openRes = await app.request(`/v1/proposals/${pack.id}`, { headers });
    expect(openRes.status).toBe(200);

    const approveRes = await app.request(`/v1/proposals/${pack.id}/approve`, { method: "POST", headers });
    expect(approveRes.status).toBe(200);
    expect(((await approveRes.json()) as { status: string }).status).toBe("approved");

    const liveRes = await app.request(`/v1/proposals/${pack.id}/go-live`, { method: "POST", headers });
    expect(liveRes.status).toBe(200);
    const event = (await liveRes.json()) as { id: string; slug: string; title: string };
    expect(event.id).toBeTruthy();
    expect(event.slug).toBeTruthy();

    const eventPage = await app.request(`/v1/public/events/${event.slug}`);
    expect(eventPage.status).toBe(200);
    const eventBody = (await eventPage.json()) as {
      slug: string;
      title: string;
      messages?: unknown;
      demand?: unknown;
    };
    expect(eventBody.slug).toBe(event.slug);
    expect(eventBody.title).toBe(event.title);
    expect(eventBody.messages).toBeUndefined();
    expect(eventBody.demand).toBeUndefined();

    const communityRes = await app.request(`/v1/public/communities/${workspace.slug}`);
    expect(communityRes.status).toBe(200);
    const community = (await communityRes.json()) as { events: Array<{ slug: string }> };
    expect(community.events.some((e) => e.slug === event.slug)).toBe(true);

    const rsvpRes = await app.request(`/v1/public/events/${event.slug}/rsvp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Kernel Guest", email: "guest@example.com" }),
    });
    expect(rsvpRes.status).toBe(201);

    const guestsRes = await app.request(`/v1/events/${event.id}/guests`, { headers });
    expect(guestsRes.status).toBe(200);
    const guests = (await guestsRes.json()) as Array<{ name: string; email: string }>;
    expect(guests.some((g) => g.email === "guest@example.com" && g.name === "Kernel Guest")).toBe(true);
  });
});
