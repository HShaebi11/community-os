"use client";

import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/desk/page-header";
import { CopyButton } from "@/components/copy-button";
import { useWorkspace } from "@/components/workspace/workspace-context";

export default function AgentsPage() {
  const { workspace } = useWorkspace();
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3002";
  const apiBase = `${origin}/v1`;

  const remoteMcpConfig = JSON.stringify(
    {
      mcpServers: {
        "community-os": {
          url: `${origin}/mcp?workspace=${workspace.id}`,
        },
      },
    },
    null,
    2,
  );

  const stdioMcpConfig = JSON.stringify(
    {
      mcpServers: {
        "community-os": {
          command: "node",
          args: ["apps/mcp/src/index.ts"],
          env: {
            COMMUNITY_OS_API_URL: apiBase.replace(/\/v1$/, ""),
            COMMUNITY_OS_WORKSPACE_ID: workspace.id,
          },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="max-w-2xl">
      <PageHeader
        kicker="agent access"
        title="Connect agents"
        lede="There are no accounts or tokens — anything that can reach the API can use it. Point a client at /v1 or the MCP endpoints and it just works."
      />

      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">mcp — remote</h2>
          <p className="text-muted-foreground text-sm">
            Streamable HTTP MCP served by the API itself — six tools, plus <code>/mcp/code</code> for Cloudflare Code
            Mode.
          </p>
          <div className="bg-background relative rounded-md border p-4">
            <div className="absolute top-3 right-3">
              <CopyButton text={remoteMcpConfig} label="copy" />
            </div>
            <pre className="text-muted-foreground overflow-x-auto text-xs">{remoteMcpConfig}</pre>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">mcp — stdio</h2>
          <p className="text-muted-foreground text-sm">
            The same tools as a local process, for clients that prefer stdio.
          </p>
          <div className="bg-background relative rounded-md border p-4">
            <div className="absolute top-3 right-3">
              <CopyButton text={stdioMcpConfig} label="copy" />
            </div>
            <pre className="text-muted-foreground overflow-x-auto text-xs">{stdioMcpConfig}</pre>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">curl</h2>
          <Card className="gap-2 py-4">
            <CardContent>
              <pre className="text-muted-foreground overflow-x-auto text-xs">{`curl ${apiBase}/workspaces
curl ${apiBase}/workspaces/${workspace.id}/demands
curl "${apiBase}/search?q=speakers"`}</pre>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
