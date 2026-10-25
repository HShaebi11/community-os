import { describe, expect, it } from "vitest";
import { draftOutreach, explainProposal, matchSpeakers, matchVenues, newsletter, promoPost, runSheet } from "./match.ts";
import type { Member, Venue } from "./types.ts";

const member = (over: Partial<Member>): Member => ({
  id: crypto.randomUUID(),
  communityId: "c1",
  displayName: "X",
  aliases: ["X"],
  do: null,
  want: null,
  offer: null,
  notes: null,
  publicOptIn: false,
  publicSlug: null,
  lastActive: null,
  leadLockedFields: [],
  ...over,
});

const venueF = (over: Partial<Venue>): Venue => ({
  id: crypto.randomUUID(),
  communityId: "c1",
  name: "V",
  area: null,
  capacity: null,
  contact: null,
  ...over,
});

describe("matchSpeakers", () => {
  it("ranks exact topic matches above partial-word matches, drops zero scores", () => {
    const members = [
      member({ displayName: "none", do: "accountant" }),
      member({ displayName: "partial", offer: "i can teach sourdough basics" }),
      member({ displayName: "exact", do: "i run a bread workshop every month" }),
    ];
    const ranked = matchSpeakers(members, "bread workshop");
    expect(ranked[0].displayName).toBe("exact");
    expect(ranked.map((m) => m.displayName)).not.toContain("none");
  });

  it("ignores members with no profile text", () => {
    expect(matchSpeakers([member({ displayName: "blank" })], "bread")).toHaveLength(0);
  });

  it("matches on ANY single topic word (some, not every)", () => {
    // "workshop" appears in the blob, "bread" does not — a partial match must
    // still score > 0, or long-tail offers never surface.
    const members = [member({ displayName: "partial", offer: "i run a workshop on pottery" })];
    const ranked = matchSpeakers(members, "bread workshop");
    expect(ranked.map((m) => m.displayName)).toEqual(["partial"]);
  });
});

describe("matchVenues", () => {
  it("filters out too-small venues and prefers the smallest fit", () => {
    const venues = [
      venueF({ name: "huge", capacity: 200 }),
      venueF({ name: "fits", capacity: 30 }),
      venueF({ name: "tiny", capacity: 5 }),
      venueF({ name: "unknown", capacity: null }),
    ];
    const ranked = matchVenues(venues, 20);
    // null capacity is treated as 9999 — sorts last, after real capacities.
    expect(ranked.map((v) => v.name)).toEqual(["fits", "huge", "unknown"]);
    expect(ranked.map((v) => v.name)).not.toContain("tiny");
  });

  it("treats capacity === people as a fit (inclusive bound)", () => {
    const venues = [venueF({ name: "exact", capacity: 20 }), venueF({ name: "under", capacity: 19 })];
    expect(matchVenues(venues, 20).map((v) => v.name)).toEqual(["exact"]);
  });
});

describe("explainProposal", () => {
  it("composes topic + speakers + venue + cited quotes", () => {
    const text = explainProposal({
      topic: "bread workshop",
      speakers: [member({ displayName: "Ada" })],
      venue: venueF({ name: "Studio", area: "east" }),
      quotes: ["i want a bread workshop"],
    });
    expect(text).toContain("Demand for bread workshop");
    expect(text).toContain("Ada");
    expect(text).toContain("Studio (east)");
    expect(text).toContain("i want a bread workshop");
  });

  it("degrades gracefully with no speakers, venue, or quotes", () => {
    const text = explainProposal({ topic: "x", speakers: [], venue: null, quotes: [] });
    expect(text).toContain("no matched speakers yet");
    expect(text).toContain("no venue record yet");
  });
});

describe("draftOutreach", () => {
  it("names the community, topic, speakers and venue — a draft, not a send", () => {
    const draft = draftOutreach({ communityName: "Bread Town", topic: "bread workshop", speakers: ["Ada", "Lin"], venue: "Studio" });
    expect(draft).toContain("Bread Town");
    expect(draft).toContain("bread workshop");
    expect(draft).toContain("Ada and Lin");
    expect(draft).toContain("at Studio");
  });

  it("falls back cleanly without speakers or venue", () => {
    const draft = draftOutreach({ communityName: "C", topic: "t", speakers: [], venue: null });
    expect(draft).toContain("a member who offered to help");
  });
});

describe("autopilot copy", () => {
  it("runSheet carries title, venue, speakers, when", () => {
    const sheet = runSheet({ title: "Bake Night", speakers: ["Ada"], venue: "Studio", startsAt: "2025-07-01" });
    expect(sheet).toContain("Bake Night");
    expect(sheet).toContain("2025-07-01");
    expect(sheet).toContain("Studio");
    expect(sheet).toContain("Ada");
  });

  it("promoPost and newsletter both carry the RSVP url", () => {
    const url = "https://os.test/e/abc";
    expect(promoPost({ title: "T", url, communityName: "C" })).toContain(url);
    expect(newsletter({ title: "T", url, explanation: "why" })).toContain(url);
    expect(newsletter({ title: "T", url, explanation: "why" })).toContain("why");
  });
});
