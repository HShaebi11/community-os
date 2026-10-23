export type ExtractedFields = {
  do: string | null;
  want: string | null;
  offer: string | null;
  citations: Array<{ quote: string; kind: "do" | "want" | "offer" | "demand" }>;
  demandTopics: string[];
};

const WANT =
  /\b(i want|i'd love|looking for|we should|anyone (?:want|up for)|can we (?:do|run|host)|need a|would be (?:cool|great) to)\b/i;
const OFFER =
  /\b(i can|i'll host|i will host|happy to (?:teach|host|speak|help)|i teach|i run|i have a (?:space|room|venue)|i could (?:teach|speak|host))\b/i;
const DO =
  /\b(i(?:'m| am) (?:a|an|the)|i work|i build|i run|i design|i found|founder|engineer|designer|organiser|organizer)\b/i;

export function extractFromMessages(bodies: string[]): ExtractedFields {
  const citations: ExtractedFields["citations"] = [];
  let doField: string | null = null;
  let want: string | null = null;
  let offer: string | null = null;
  const demandTopics = new Set<string>();

  for (const body of bodies) {
    const quote = clipQuote(body);
    if (!doField && DO.test(body)) {
      doField = quote;
      citations.push({ quote, kind: "do" });
    }
    if (WANT.test(body)) {
      if (!want) {
        want = quote;
        citations.push({ quote, kind: "want" });
      }
      const topic = topicFrom(body);
      if (topic) {
        demandTopics.add(topic);
        citations.push({ quote, kind: "demand" });
      }
    }
    if (!offer && OFFER.test(body)) {
      offer = quote;
      citations.push({ quote, kind: "offer" });
    }
  }

  return { do: doField, want, offer, citations, demandTopics: [...demandTopics] };
}

export function topicFrom(body: string): string | null {
  const cleaned = body
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase();
  const stop = new Set(
    "i we you they the a an to for of and or in on at is are was be do can should want need looking anyone someone please just this that with from our".split(
      " ",
    ),
  );
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  if (words.length === 0) return null;
  const interesting = words.filter((w) =>
    /workshop|talk|meetup|hack|ai|design|venue|sponsor|demo|panel|social|build/.test(w),
  );
  return (interesting[0] ?? words.slice(0, 3).join(" ")).slice(0, 40);
}

export function titleFromTopic(topic: string, people: number): string {
  return `${people} people want ${topic}`;
}

export function clipQuote(body: string): string {
  const one = body.replace(/\s+/g, " ").trim();
  return one.length > 180 ? `${one.slice(0, 177)}...` : one;
}

export function scoreApplication(answers: string, communityName: string): { score: number; reason: string; decision: "accept" | "ask" | "decline" } {
  const text = answers.toLowerCase();
  const spam = /(airdrop|free crypto|telegram\.me|whatsapp me for investment|seo backlink|onlyfans)/i.test(text);
  if (spam) return { score: 0, reason: "Looks like spam or solicitation.", decision: "decline" };
  const mentions = communityName.toLowerCase().split(/\s+/).some((w) => w.length > 3 && text.includes(w));
  const substance = answers.trim().length > 40;
  if (mentions && substance) return { score: 86, reason: "Named the community and gave a real answer.", decision: "accept" };
  if (substance) return { score: 62, reason: "Real answer, unclear fit — ask one follow-up.", decision: "ask" };
  return { score: 28, reason: "Too thin to judge fit.", decision: "ask" };
}
