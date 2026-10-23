import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { Kicker } from "@/components/kicker";

export const metadata: Metadata = { title: "API Docs" };

const SECTIONS: Array<{ title: string; routes: string[] }> = [
  {
    title: "authentication",
    routes: [
      "POST /api/auth/sign-up/email — cookie session",
      "POST /api/auth/sign-in/email — cookie session",
      "POST /api/auth/sign-in/magic-link { email, callbackURL }",
      "GET /api/auth/magic-link/verify — from the emailed link",
      "POST /api/auth/request-password-reset { email, redirectTo }",
      "POST /api/auth/reset-password { newPassword, token }",
      "POST /api/auth/sign-in/social — Google when configured",
      "POST /v1/auth/dev — local-only sign-in (ALLOW_DEV_AUTH)",
      "GET /v1/me — works for cookie, session token, or cos_ token",
      "GET /v1/auth/providers — what this deployment supports",
    ],
  },
  {
    title: "workspaces & teams",
    routes: [
      "POST /v1/workspaces — creates workspace + organization + owner member",
      "GET /v1/workspaces — with your role on each",
      "GET /v1/workspaces/:id",
      "GET /v1/workspaces/by-slug/:slug",
      "PATCH /v1/workspaces/:id — name, joinUrl (owners and admins)",
      "POST /api/auth/organization/invite-member { email, role, organizationId }",
      "GET /api/auth/organization/list-members?organizationId=",
      "POST /api/auth/organization/accept-invitation { invitationId }",
      "POST /api/auth/organization/reject-invitation { invitationId }",
      "POST /api/auth/organization/cancel-invitation { invitationId }",
      "POST /api/auth/organization/update-member-role { memberId, role }",
      "POST /api/auth/organization/remove-member { memberIdOrEmail }",
    ],
  },
  {
    title: "agent tokens",
    routes: [
      "POST /v1/tokens { name } — plaintext shown once, cos_ prefix",
      "GET /v1/tokens — name, prefix, created, last used",
      "DELETE /v1/tokens/:id — revoke",
      "then: Authorization: Bearer cos_… on any /v1 route (cannot mint/revoke tokens)",
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
      "POST /v1/workspaces/:id/proposals { demandId }",
      "GET /v1/proposals/:id",
      "POST /v1/proposals/:id/outreach — draft only",
      "POST /v1/proposals/:id/approve",
      "POST /v1/proposals/:id/go-live",
      "GET /v1/workspaces/:id/events",
      "GET /v1/events/:id/guests",
      "GET /v1/events/:id/chain — lead only",
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
];

export default function DocsPage() {
  return (
    <section className="py-12">
      <Kicker>contracts</Kicker>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">The product is the HTTP API.</h1>
      <p className="text-muted-foreground mb-8 max-w-xl text-sm">
        The app, the public pages, and the MCP adapter are all clients of these routes — same auth, same
        permissions. Cookie sessions for the browser; <code className="font-mono text-xs">cos_</code> tokens for
        agents and curl.
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
