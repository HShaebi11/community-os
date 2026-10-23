"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Flame } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Citations } from "@/components/desk/citations";
import { PageHeader } from "@/components/desk/page-header";
import { Empty } from "@/components/kicker";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { api } from "@/lib/api";
import type { Demand } from "@/lib/types";

export default function DemandPage() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [demands, setDemands] = useState<Demand[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    const id = workspace.id;
    (async () => {
      try {
        const list = await api<Demand[]>(`/v1/workspaces/${id}/demands`);
        const detailed = await Promise.all(list.map((d) => api<Demand>(`/v1/demands/${d.id}`).catch(() => d)));
        setDemands(detailed);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "failed");
      }
    })();
  }, [workspace.id]);

  async function openProposal(demandId: string) {
    setOpening(demandId);
    try {
      await api(`/v1/workspaces/${workspace.id}/proposals`, {
        method: "POST",
        body: JSON.stringify({ demandId }),
      });
      router.push(`/w/${workspace.slug}/proposals`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
      setOpening(null);
    }
  }

  return (
    <section className="max-w-2xl">
      <PageHeader
        kicker="demand"
        title="What the room wants"
        lede="Unique people asking, ranked by count and recency. Open a proposal to turn one into an event."
      />
      {demands === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : demands.length === 0 ? (
        <Empty>
          Nothing asked for yet. <Link href={`/w/${workspace.slug}/import`}>Import a chat</Link> and refresh memory.
        </Empty>
      ) : (
        <div className="space-y-3">
          {demands.map((d, i) => (
            <Card key={d.id} className="gap-3 py-5">
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {d.memberIds.length} {d.memberIds.length === 1 ? "person" : "people"}
                  </Badge>
                  {i === 0 ? (
                    <Badge className="border-transparent bg-[var(--primary)] font-mono text-[#0a0c12]">
                      <Flame className="size-3" /> hottest
                    </Badge>
                  ) : null}
                </div>
                <div>
                  <h2 className="font-semibold">{d.title || d.topic}</h2>
                  {d.oneLiner ? <p className="text-muted-foreground text-sm">{d.oneLiner}</p> : null}
                </div>
                <Citations citations={d.citations} label="asked in the chat" />
                <div>
                  <Button size="sm" onClick={() => void openProposal(d.id)} disabled={opening === d.id}>
                    {opening === d.id ? "opening…" : "open proposal"} <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
