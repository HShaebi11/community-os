import type { Member, Venue } from "./types.ts";

export function matchSpeakers(members: Member[], topic: string): Member[] {
  const needle = topic.toLowerCase();
  return members
    .map((member) => ({ member, score: scoreMember(member, needle) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.member);
}

export function matchVenues(venues: Venue[], people: number): Venue[] {
  return venues
    .filter((venue) => venue.capacity == null || venue.capacity >= people)
    .sort((a, b) => (a.capacity ?? 9999) - (b.capacity ?? 9999));
}

function scoreMember(member: Member, needle: string): number {
  const blob = `${member.offer ?? ""} ${member.do ?? ""} ${member.want ?? ""}`.toLowerCase();
  if (!blob.trim()) return 0;
  if (blob.includes(needle)) return 3;
  const parts = needle.split(/\s+/).filter(Boolean);
  return parts.some((p) => blob.includes(p)) ? 1 : 0;
}

export function explainProposal(input: {
  topic: string;
  speakers: Member[];
  venue: Venue | null;
  quotes: string[];
}): string {
  const names = input.speakers.map((s) => s.displayName).join(", ") || "no matched speakers yet";
  const venue = input.venue ? `${input.venue.name}${input.venue.area ? ` (${input.venue.area})` : ""}` : "no venue record yet";
  const cited = input.quotes.slice(0, 3).map((q) => `“${q}”`).join(" ");
  return `Demand for ${input.topic}. Speakers: ${names}. Venue: ${venue}. Evidence: ${cited || "member cards and demand messages."}`;
}

export function draftOutreach(input: {
  communityName: string;
  topic: string;
  speakers: string[];
  venue: string | null;
}): string {
  const who = input.speakers.join(" and ") || "a member who offered to help";
  const where = input.venue ? ` at ${input.venue}` : "";
  return `Hey — people in ${input.communityName} have been asking for ${input.topic}. ${who} could run it${where}. If you're in, I'll put up our event page and QR. Reply here and I'll go live.`;
}

export function runSheet(input: {
  title: string;
  speakers: string[];
  venue: string | null;
  startsAt: string | null;
}): string {
  return [
    `# Run sheet — ${input.title}`,
    "",
    `- When: ${input.startsAt ?? "TBD"}`,
    `- Where: ${input.venue ?? "TBD"}`,
    `- Speakers: ${input.speakers.join(", ") || "TBD"}`,
    "",
    "## Night of",
    "1. Doors + QR check-in",
    "2. Welcome (5 min)",
    "3. Main session",
    "4. Intros / close",
    "",
    "## Follow-up",
    "- Thank-you in the original chat (lead sends)",
    "- Attach guest list from native RSVP",
  ].join("\n");
}

export function promoPost(input: { title: string; url: string; communityName: string }): string {
  return `${input.communityName}: ${input.title}. RSVP on our page (not a rented link): ${input.url}`;
}

export function newsletter(input: { title: string; url: string; explanation: string }): string {
  return `This week: ${input.title}\n\n${input.explanation}\n\nRSVP: ${input.url}\n`;
}
