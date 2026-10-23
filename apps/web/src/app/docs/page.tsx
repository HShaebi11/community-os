import { PublicChrome } from "@/components/public-chrome";
import { Card, CardContent } from "@/components/ui/card";
import { Kicker } from "@/components/kicker";

const ROUTES = [
  "POST /v1/auth/dev or Better Auth /api/auth/*",
  "POST /v1/workspaces",
  "POST /v1/workspaces/:id/imports (zip or txt body)",
  "GET /v1/workspaces/:id/members",
  "POST /v1/workspaces/:id/memory",
  "GET /v1/members/:id (card + citations)",
  "GET /v1/demands/:id (title + citations)",
  "GET /v1/workspaces/:id/demands",
  "POST /v1/workspaces/:id/proposals",
  "POST /v1/proposals/:id/approve",
  "POST /v1/proposals/:id/go-live",
  "GET /v1/events/:id/chain (lead, private)",
  "GET /v1/events/:id/guests",
  "GET /v1/search?q= (desk + MCP search_memory)",
  "GET /v1/public/communities/:slug",
  "GET /v1/public/events/:slug",
  "POST /v1/public/events/:slug/rsvp",
  "GET /v1/public/members/:slug",
  "POST /v1/ingest/discord",
];

export default function DocsPage() {
  return (
    <PublicChrome>
      <Kicker>Contracts</Kicker>
      <h1 className="mb-2 text-3xl tracking-tight">HTTP API</h1>
      <p className="text-muted-foreground mb-4">
        The product is this API. Desk, public pages, and MCP are clients. Humans and agents use the same routes.
      </p>
      <Card className="gap-2 py-4">
        <CardContent>
          <ul className="list-disc space-y-1 pl-5">
            {ROUTES.map((r) => (
              <li key={r}>
                <code>{r}</code>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </PublicChrome>
  );
}
