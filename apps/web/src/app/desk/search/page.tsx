"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Empty, Kicker } from "@/components/kicker";
import { api } from "@/lib/api";
import type { SearchHit } from "@/lib/types";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  async function search() {
    try {
      const data = await api<SearchHit[]>(`/v1/search?q=${encodeURIComponent(q)}`);
      setHits(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  return (
    <section>
      <Kicker>Memory</Kicker>
      <h1 className="mb-2 text-3xl tracking-tight">Search</h1>
      <p className="text-muted-foreground mb-4">
        Same <code>GET /v1/search</code> the MCP <code>search_memory</code> tool uses.
      </p>
      <div className="mb-3 flex gap-2">
        <Input placeholder="workshop, speaker, demand…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button onClick={() => void search()}>Search</Button>
      </div>
      <div className="space-y-3">
        {hits && hits.length === 0 ? <Empty>No hits.</Empty> : null}
        {(hits ?? []).map((h, i) => (
          <Card key={i} className="gap-2 py-4">
            <CardContent className="flex items-center gap-2">
              <Badge variant="outline">{h.type}</Badge>
              <span>{h.member?.displayName || h.demand?.title || h.demand?.topic || ""}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
