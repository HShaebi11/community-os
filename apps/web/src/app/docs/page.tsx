import { PublicChrome } from "@/components/public-chrome";
import { Card, CardContent } from "@/components/ui/card";
import { Kicker } from "@/components/kicker";

const SECTIONS: Array<{ title: string; note?: string; routes: string[] }> = [
  {
    title: "Auth & workspace",
    routes: [
      "POST /v1/auth/dev — local sign-in, or Better Auth /api/auth/*",
      "GET /v1/me",
      "POST /v1/workspaces",
      "GET /v1/workspaces",
      "GET /v1/workspaces/:id",
    ],
  },
  {
    title: "Evidence — append-only",
    routes: [
      "POST /v1/workspaces/:id/imports (WhatsApp zip or txt body)",
      "POST /v1/ingest/discord (live listen)",
      "GET /v1/workspaces/:id/messages",
      "GET /v1/workspaces/:id/files",
      "GET /v1/workspaces/:id/timeline",
    ],
  },
  {
    title: "Memory — cited truth",
    routes: [
      "POST /v1/workspaces/:id/memory (refresh)",
      "GET /v1/workspaces/:id/members",
      "GET /v1/members/:id (card + citations)",
      "PATCH /v1/members/:id (lead edits win)",
      "GET /v1/workspaces/:id/briefing",
      "GET /v1/workspaces/:id/demands",
      "GET /v1/demands/:id (title + citations)",
      "GET /v1/workspaces/:id/resources",
      "GET /v1/search?q= — same route MCP search_memory uses",
    ],
  },
  {
    title: "Proposals → live",
    routes: [
      "POST /v1/workspaces/:id/proposals { demandId }",
      "GET /v1/proposals/:id (pack: speakers, venue, citations)",
      "POST /v1/proposals/:id/outreach (draft only — lead sends)",
      "POST /v1/proposals/:id/approve",
      "POST /v1/proposals/:id/go-live",
      "GET /v1/workspaces/:id/events",
      "GET /v1/events/:id/guests",
      "GET /v1/events/:id/chain (lead, private)",
      "POST /v1/events/:id/autopilot (run sheet, post, newsletter)",
    ],
  },
  {
    title: "The front door — public, opted-in only",
    routes: [
      "GET /v1/public/communities/:slug",
      "GET /v1/public/events/:slug",
      "POST /v1/public/events/:slug/rsvp",
      "GET /v1/public/members/:slug (404 unless the member opted in)",
    ],
  },
  {
    title: "Gatekeeper",
    routes: [
      "POST /v1/workspaces/:id/applications",
      "GET /v1/workspaces/:id/applications",
      "POST /v1/workspaces/:id/blocklist (hashed applicant)",
    ],
  },
];

export default function DocsPage() {
  return (
    <PublicChrome>
      <section className="py-8">
        <Kicker>Contracts</Kicker>
        <h1 className="mb-2 text-3xl tracking-tight">The product is the HTTP API.</h1>
        <p className="text-muted-foreground mb-8 max-w-xl">
          The desk, the public pages, and the MCP adapter are all clients of these routes. If a human can do it, an
          agent can do it — through the same auth and permissions.
        </p>
        <div className="space-y-6">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="mb-2 text-lg font-semibold">{s.title}</h2>
              <Card className="gap-2 py-4">
                <CardContent>
                  <ul className="space-y-1.5">
                    {s.routes.map((r) => (
                      <li key={r}>
                        <code className="text-sm">{r}</code>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </section>
    </PublicChrome>
  );
}
