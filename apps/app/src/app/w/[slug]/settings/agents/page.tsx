"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/desk/page-header";
import { CopyButton } from "@/components/copy-button";
import { Empty } from "@/components/kicker";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { api } from "@/lib/api";
import type { ApiToken } from "@/lib/types";

export default function AgentsPage() {
  const { workspace } = useWorkspace();
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [minted, setMinted] = useState<{ name: string; token: string } | null>(null);

  async function load() {
    try {
      setTokens(await api<ApiToken[]>("/v1/tokens"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const data = await api<{ name: string; token: string }>("/v1/tokens", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setMinted({ name: data.name, token: data.token });
      setName("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(t: ApiToken) {
    try {
      await api(`/v1/tokens/${t.id}`, { method: "DELETE" });
      toast.success("Revoked.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        "community-os": {
          command: "node",
          args: ["apps/mcp/dist/index.js"],
          env: {
            COMMUNITY_OS_API_URL: window.location.origin,
            COMMUNITY_OS_TOKEN: minted?.token ?? "<cos_ token>",
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
        title="API tokens"
        lede="cos_ tokens act as you over /v1 — for curl, MCP and agents. A token can't mint other tokens."
      />

      <Card className="mb-8 gap-3 py-5">
        <CardContent>
          <form onSubmit={(e) => void create(e)} className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="token-name">New token</Label>
              <Input
                id="token-name"
                required
                placeholder="mcp, scripts…"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "creating…" : "create token"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {tokens === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : tokens.length === 0 ? (
        <Empty>No tokens yet.</Empty>
      ) : (
        <div className="mb-8 space-y-2">
          {tokens.map((t) => (
            <Card key={t.id} className="gap-2 py-3">
              <CardContent className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {t.prefix}… · created {new Date(t.createdAt).toLocaleDateString()}
                    {t.lastUsedAt ? ` · used ${new Date(t.lastUsedAt).toLocaleDateString()}` : " · never used"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void revoke(t)}>
                  revoke
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">mcp config</h2>
        <div className="bg-background relative rounded-md border p-4">
          <div className="absolute top-3 right-3">
            <CopyButton text={mcpConfig} label="copy" />
          </div>
          <pre className="text-muted-foreground overflow-x-auto text-xs">{mcpConfig}</pre>
        </div>
        <h2 className="pt-2 font-mono text-xs tracking-wider text-muted-foreground uppercase">curl</h2>
        <div className="bg-background rounded-md border p-4">
          <pre className="text-muted-foreground overflow-x-auto text-xs">{`curl -H "authorization: Bearer ${minted?.token ?? "<cos_ token>"}" \\
  ${typeof window !== "undefined" ? window.location.origin : ""}/v1/workspaces`}</pre>
        </div>
      </div>

      <Dialog open={minted !== null} onOpenChange={(open) => !open && setMinted(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token created</DialogTitle>
            <DialogDescription>
              Shown once — store it somewhere safe. It acts as you across all your workspaces.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-background flex items-center justify-between gap-2 rounded-md border p-3">
            <code className="text-primary overflow-x-auto text-xs">{minted?.token}</code>
            {minted ? <CopyButton text={minted.token} label="copy" /> : null}
          </div>
          <Button onClick={() => setMinted(null)}>done</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
