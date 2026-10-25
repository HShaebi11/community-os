import type { Metadata } from "next";
import { Kicker } from "@/components/kicker";

export const metadata: Metadata = { title: "Changelog" };

type Release = { date: string; title: string; items: string[] };

const RELEASES: Release[] = [
  {
    date: "open source",
    title: "Fully open, no accounts",
    items: [
      "Authentication removed across the API, app and MCP — everything works without login",
      "One deployment = one trusted operator; run it where you trust the network",
      "Self-host guide in the README; a hosted edition is a layer on top of this core",
    ],
  },
  {
    date: "slice 5",
    title: "Accounts, teams and agent tokens",
    items: [
      "Better Auth accounts: email+password, magic link, Google sign-in",
      "Guided onboarding: community → chat import → memory reveal → co-lead invites",
      "Workspaces are organizations: invite, roles (owner/admin/member), team settings",
      "cos_ API tokens for curl, MCP and agents — shown once, revocable",
      "New routes: /sign-in, /onboarding, /w/[slug], /account, /invite/[id]",
    ],
  },
  {
    date: "slice 4",
    title: "Gatekeeper and polish",
    items: ["Application scoring against community norms", "Confirmed blocklist declines", "Desk settings screen"],
  },
  {
    date: "slice 3",
    title: "Autopilot drafts",
    items: ["Run sheet, promo post and newsletter drafts per live event", "Event chain: event → proposal → demand → chat lines"],
  },
  {
    date: "slice 2",
    title: "Events and guest lists",
    items: ["One-click go-live → native event page with QR", "Native RSVP → owned guest list, member-matched"],
  },
  {
    date: "slice 1",
    title: "Memory and proposals",
    items: ["Chat import → cited member cards and demand clusters", "Proposal packs: speakers, venue, outreach draft"],
  },
  {
    date: "slice 0",
    title: "The API",
    items: ["Hono /v1 API on Cloudflare Workers + Neon", "MCP adapter: same routes for agents, no send_message"],
  },
];

export default function ChangelogPage() {
  return (
    <>
      <section className="pt-16 pb-10">
        <Kicker>changelog</Kicker>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">What shipped.</h1>
        <p className="text-muted-foreground max-w-lg text-sm">
          Built in slices, each one an end-to-end loop through the API.
        </p>
      </section>
      <section className="border-border space-y-8 border-t py-10">
        {RELEASES.map((r) => (
          <div key={r.date} className="grid gap-3 sm:grid-cols-4">
            <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{r.date}</p>
            <div className="sm:col-span-3">
              <h2 className="mb-2 font-semibold">{r.title}</h2>
              <ul className="text-muted-foreground space-y-1.5 text-sm">
                {r.items.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
