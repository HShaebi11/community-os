import { describe, expect, it } from "vitest";
import { explainProposal, draftOutreach, runSheet, promoPost, newsletter } from "./match.ts";
import { qrSvg } from "./qr.ts";
import { titleFromTopic, clipQuote, scoreApplication } from "./extract.ts";
import { venue } from "@community-os/testkit";
import type { Member } from "./types.ts";

const member = (over: Partial<Member>): Member => ({
  id: "m1",
  communityId: "c1",
  displayName: "M",
  aliases: [],
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

/**
 * Golden snapshots for user-facing generated text. These outputs ship to real
 * community surfaces (event pages, outreach drafts, newsletters) — a wording or
 * format change must be a deliberate, reviewable diff, not a silent side effect
 * of a refactor. Snapshots intentionally cover the empty/degenerate branches,
 * since those are where format regressions hide.
 */

describe("golden — generated public text", () => {
  describe("explainProposal", () => {
    it("full evidence pack", () => {
      expect(
        explainProposal({
          topic: "meetup",
          speakers: [member({ displayName: "Ada" }), member({ displayName: "Grace" })],
          venue: venue({ name: "Blue Door", area: "Downtown" }),
          quotes: ["we need a meetup", "been asking for months", "yes please"],
        }),
      ).toMatchSnapshot();
    });
    it("empty speakers, no venue, no quotes", () => {
      expect(explainProposal({ topic: "potluck", speakers: [], venue: null, quotes: [] })).toMatchSnapshot();
    });
    it("quotes clipped at three", () => {
      expect(
        explainProposal({
          topic: "talk",
          speakers: [member({ displayName: "Kai" })],
          venue: venue({ name: "Hall" }),
          quotes: ["a", "b", "c", "d", "e"],
        }),
      ).toMatchSnapshot();
    });
  });

  describe("draftOutreach", () => {
    it("speakers + venue", () => {
      expect(
        draftOutreach({ communityName: "Bakers", topic: "sourdough night", speakers: ["Ada", "Grace"], venue: "Blue Door" }),
      ).toMatchSnapshot();
    });
    it("no speakers, no venue", () => {
      expect(draftOutreach({ communityName: "Hacknight", topic: "demo day", speakers: [], venue: null })).toMatchSnapshot();
    });
  });

  describe("runSheet", () => {
    it("complete sheet", () => {
      expect(
        runSheet({ title: "Launch Night", speakers: ["Ada"], venue: "Blue Door", startsAt: "2025-06-01T18:00:00Z" }),
      ).toMatchSnapshot();
    });
    it("all TBD fallbacks", () => {
      expect(runSheet({ title: "TBD Event", speakers: [], venue: null, startsAt: null })).toMatchSnapshot();
    });
  });

  describe("promoPost + newsletter", () => {
    it("promoPost", () => {
      expect(promoPost({ title: "Launch", url: "https://c.test/e/launch", communityName: "Bakers" })).toMatchSnapshot();
    });
    it("newsletter", () => {
      expect(
        newsletter({ title: "Launch", url: "https://c.test/e/launch", explanation: "Demand for meetup. Speakers: Ada." }),
      ).toMatchSnapshot();
    });
  });

  describe("qr", () => {
    it("renders a stable SVG for a public URL", () => {
      expect(qrSvg("https://community.test/e/launch-abc123")).toMatchSnapshot();
    });
    it("honors moduleSize", () => {
      expect(qrSvg("x", 2)).toContain('width="54"'); // 27-module matrix incl. quiet zone, * 2
    });
  });

  describe("extract helpers", () => {
    it("titleFromTopic", () => {
      expect(titleFromTopic("meetup", 12)).toMatchSnapshot();
      expect(titleFromTopic("sourdough workshop", 0)).toMatchSnapshot();
    });
    it("clipQuote truncates long bodies", () => {
      expect(clipQuote("short")).toMatchSnapshot();
      expect(clipQuote("x".repeat(200))).toMatchSnapshot();
    });
    it("scoreApplication decision text", () => {
      const strong = scoreApplication("I organize meetups and can host", "Hacknight");
      const weak = scoreApplication("idk", "Hacknight");
      expect({ score: strong.score, decision: strong.decision }).toMatchSnapshot();
      expect({ score: weak.score, decision: weak.decision }).toMatchSnapshot();
    });
  });
});
