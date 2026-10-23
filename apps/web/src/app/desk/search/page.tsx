"use client";

import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/desk/page-header";
import { Empty } from "@/components/kicker";
import { api } from "@/lib/api";
import type { SearchHit } from "@/lib/types";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    try {
      const data = await api<SearchHit[]>(`/v1/search?q=${encodeURIComponent(q.trim())}`);
      setHits(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <section>
      <PageHeader
        kicker="Memory"
        title="Search the brain"
        lede="Same GET /v1/search the MCP search_memory tool uses — the desk and your agents query one memory."
      />
      <form onSubmit={(e) => void search(e)} className="mb-5 flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground absolute top-2.5 left-3 size-4" />
          <Input
            className="pl-9"
            placeholder="workshop, speaker, a topic the room keeps asking for…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </Button>
      </form>
      {hits === null ? null : hits.length === 0 ? (
        <Empty>Nothing in memory matches “{q}”.</Empty>
      ) : (
        <div className="space-y-3">
          {hits.map((h, i) => (
            <Card key={i} className="gap-2 py-4">
              <CardContent className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{h.type}</Badge>
                  <span className="font-medium">{h.member?.displayName || h.demand?.title || h.demand?.topic || ""}</span>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link
                    href={h.type === "member" ? "/desk/people" : "/desk/demand"}
                    className="text-foreground no-underline"
                  >
                    Open
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
