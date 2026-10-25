import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { Kicker } from "@/components/kicker";

export const metadata: Metadata = { title: "API Docs" };

const SECTIONS: Array<{ title: string; routes: string[] }> = [
  {
    title: "workspaces",
    routes: [
      "POST /v1/workspaces { name, joinUrl? }",
      "GET /v1/workspaces — every workspace on this deployment",
      "GET /v1/workspaces/:id",
      "GET /v1/workspaces/by-slug/:slug",
      "PATCH /v1/workspaces/:id — name, joinUrl",
      "GET /v1/workspaces/:id/export — full JSON archive, attachment download",
    ],
  },
  {
    title: "evidence — append-only",
    routes: [
      "POST /v1/workspaces/:id/imports (WhatsApp zip or txt)",
      "POST /v1/ingest/discord",
      "GET /v1/workspaces/:id/messages",
      "GET /v1/workspaces/:id/files",
      "GET /v1/workspaces/:id/timeline",
    ],
  },
  {
    title: "memory — cited truth",
    routes: [
      "POST /v1/workspaces/:id/memory",
      "GET /v1/workspaces/:id/members",
      "GET /v1/members/:id",
      "PATCH /v1/members/:id — lead edits win",
      "GET /v1/workspaces/:id/briefing",
      "GET /v1/workspaces/:id/demands",
      "GET /v1/demands/:id",
      "GET /v1/workspaces/:id/resources",
      "GET /v1/search?q= — same route MCP search_memory uses",
    ],
  },
  {
    title: "proposals → live",
    routes: [
      "POST /v1/workspaces/:id/venues { name, area?, capacity?, contact? } — the venue book",
      "GET /v1/workspaces/:id/venues",
      "POST /v1/workspaces/:id/proposals { demandId }",
      "GET /v1/proposals/:id",
      "POST /v1/proposals/:id/outreach — draft only",
      "POST /v1/proposals/:id/approve",
      "POST /v1/proposals/:id/go-live",
      "GET /v1/workspaces/:id/events",
      "GET /v1/events/:id/guests",
      "GET /v1/events/:id/chain",
      "POST /v1/events/:id/autopilot",
    ],
  },
  {
    title: "the front door — public, opted-in only",
    routes: [
      "GET /v1/public/communities/:slug",
      "GET /v1/public/events/:slug",
      "POST /v1/public/events/:slug/rsvp",
      "GET /v1/public/members/:slug — 404 unless opted in",
    ],
  },
  {
    title: "gatekeeper",
    routes: [
      "POST /v1/workspaces/:id/applications",
      "GET /v1/workspaces/:id/applications",
      "POST /v1/workspaces/:id/blocklist",
    ],
  },
  {
    title: "agents",
    routes: [
      "POST /mcp?workspace=<id> — Streamable HTTP MCP, six tools",
      "POST /mcp/code — same tools wrapped in Cloudflare Code Mode",
      "GET /v1/health",
    ],
  },
];

export default function DocsPage() {
  return (
    <section className="py-12">
      <Kicker>contracts</Kicker>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">The product is the HTTP API.</h1>
      <p className="text-muted-foreground mb-8 max-w-xl text-sm">
        The app, the public pages, and the MCP adapter are all clients of these routes. There are no accounts and
        no tokens — anyone who can reach <code className="font-mono text-xs">/v1</code> can use it, so deploy where
        you trust the network.
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <h2 className="mb-2 font-mono text-xs tracking-wider text-muted-foreground uppercase">{s.title}</h2>
            <Card className="gap-2 py-4">
              <CardContent>
                <ul className="space-y-1.5">
                  {s.routes.map((r) => (
                    <li key={r}>
                      <code className="text-xs">{r}</code>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}
