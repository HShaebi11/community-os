import { describe, expect, it } from "vitest";
import { clipQuote, extractFromMessages, scoreApplication, titleFromTopic, topicFrom } from "./extract.ts";

describe("extractFromMessages", () => {
  it("recognizes do-patterns", () => {
    for (const body of ["i'm a baker", "i am an organizer", "i work at the studio", "i build apps", "i'm a designer"]) {
      expect(extractFromMessages([body]).do).toBeTruthy();
    }
  });

  it("recognizes want-patterns and derives demand topics", () => {
    const out = extractFromMessages(["i want a bread workshop"]);
    expect(out.want).toContain("bread workshop");
    expect(out.demandTopics).toContain("workshop");
    expect(out.citations.some((c) => c.kind === "demand")).toBe(true);
  });

  it("recognizes offer-patterns", () => {
    for (const body of ["i can host at my place", "i'll host the next one", "happy to teach", "i have a space downtown"]) {
      expect(extractFromMessages([body]).offer).toBeTruthy();
    }
  });

  it("keeps only the first do/want/offer but every demand citation", () => {
    const out = extractFromMessages(["i'm a baker", "i'm also a teacher", "i want a workshop", "i want a meetup"]);
    expect(out.do).toContain("baker");
    expect(out.want).toContain("workshop");
    expect(out.demandTopics.length).toBeGreaterThanOrEqual(2);
  });

  it("returns nulls for plain chatter", () => {
    const out = extractFromMessages(["hey everyone", "nice weather"]);
    expect(out).toMatchObject({ do: null, want: null, offer: null, demandTopics: [] });
  });
});

describe("topicFrom", () => {
  it("prefers interesting nouns over generic words", () => {
    expect(topicFrom("we should do a sourdough workshop")).toBe("workshop");
    expect(topicFrom("anyone up for a hack night")).toBe("hack");
  });

  it("strips urls and punctuation before choosing", () => {
    const topic = topicFrom("check https://spam.example.com then a workshop!!!");
    expect(topic).not.toContain("http");
    expect(topic).not.toContain("!");
  });

  it("falls back to the first three content words, else null", () => {
    expect(topicFrom("please someone organize this thing")).toBeTruthy();
    expect(topicFrom("a an the to for")).toBeNull();
  });
});

describe("clipQuote", () => {
  it("collapses whitespace and truncates beyond 180 chars", () => {
    expect(clipQuote("  hello\n  world ")).toBe("hello world");
    const long = "x".repeat(300);
    const clipped = clipQuote(long);
    expect(clipped.length).toBe(180);
    expect(clipped.endsWith("...")).toBe(true);
  });
});

describe("titleFromTopic", () => {
  it("phrases the crowd size", () => {
    expect(titleFromTopic("bread workshop", 4)).toBe("4 people want bread workshop");
  });
});

describe("scoreApplication", () => {
  it("declines spam signatures", () => {
    for (const answers of ["airdrop now", "free crypto!!!", "seo backlink service", "onlyfans link"]) {
      expect(scoreApplication(answers, "Bread Town").decision).toBe("decline");
    }
  });

  it("accepts substance + community mention, asks on substance alone, asks on thin", () => {
    const long = "I have run three community dinners and can organize volunteers.";
    expect(scoreApplication(`${long} I found Bread Town online.`, "Bread Town").decision).toBe("accept");
    expect(scoreApplication(long, "Bread Town").decision).toBe("ask");
    expect(scoreApplication("hi", "Bread Town").decision).toBe("ask");
  });
});
