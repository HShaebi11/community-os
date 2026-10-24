"use client";

import Link from "next/link";
import { ArrowUpRight, Search as SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/desk/page-header";
import { Empty } from "@/components/kicker";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { api } from "@/lib/api";
import type { SearchHit, Workspace } from "@/lib/types";

export default function SearchPage() {
  const { workspace } = useWorkspace();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [slugs, setSlugs] = useState<Record<string, string>>({});

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    try {
      const [data, workspaces] = await Promise.all([
        api<SearchHit[]>(`/v1/search?q=${encodeURIComponent(q.trim())}`),
        api<Workspace[]>("/v1/workspaces"),
      ]);
      setHits(data);
      setSlugs(Object.fromEntries(workspaces.map((w) => [w.id, w.slug])));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setSearching(false);
    }
  }

  const hitBase = (h: SearchHit) => `/w/${slugs[h.workspaceId] ?? workspace.slug}`;

  return (
    <section className="max-w-2xl">
      <PageHeader
        kicker="query memory"
        title="Search the brain"
        lede="GET /v1/search — the same route the MCP search_memory tool hits."
      />
      <form onSubmit={(e) => void search(e)} className="mb-5 flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground absolute top-2.5 left-3 size-4" />
          <Input
            className="pl-9 font-mono text-sm"
            placeholder="workshop, speaker, venue…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={searching} className="h-9">
          {searching ? "…" : "search"}
        </Button>
      </form>
      {hits === null ? null : hits.length === 0 ? (
        <Empty>Nothing in memory matches “{q}”.</Empty>
      ) : (
        <div className="space-y-2">
          {hits.map((h, i) => (
            <Card key={i} className="gap-2 py-3">
              <CardContent className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {h.type}
                  </Badge>
                  <span className="truncate text-sm font-medium">
                    {h.member?.displayName || h.demand?.title || h.demand?.topic || ""}
                  </span>
                </div>
                <Button variant="ghost" size="icon-xs" asChild>
                  <Link
                    href={h.type === "member" ? `${hitBase(h)}/people` : `${hitBase(h)}/demand`}
                    className="text-muted-foreground no-underline"
                  >
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
