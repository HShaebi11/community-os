"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flame, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Citations } from "@/components/desk/citations";
import { PageHeader } from "@/components/desk/page-header";
import { Empty } from "@/components/kicker";
import { api, getWorkspaceId } from "@/lib/api";
import type { Demand } from "@/lib/types";

export default function DemandPage() {
  const router = useRouter();
  const [demands, setDemands] = useState<Demand[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    const id = getWorkspaceId();
    if (!id) return;
    (async () => {
      try {
        const list = await api<Demand[]>(`/v1/workspaces/${id}/demands`);
        const detailed = await Promise.all(list.map((d) => api<Demand>(`/v1/demands/${d.id}`).catch(() => d)));
        setDemands(detailed);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "failed");
      }
    })();
  }, []);

  async function openProposal(demandId: string) {
    const id = getWorkspaceId();
    if (!id) return;
    setOpening(demandId);
    try {
      await api(`/v1/workspaces/${id}/proposals`, {
        method: "POST",
        body: JSON.stringify({ demandId }),
      });
      router.push("/desk/proposals");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
      setOpening(null);
    }
  }

  return (
    <section>
      <PageHeader
        kicker="Step 3 · Demand"
        title="What the room wants"
        lede="Unique people asking for a thing, ranked by recency and count. Open a proposal when you're ready to run it."
      />
      {demands === null ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : demands.length === 0 ? (
        <Empty>
          Nothing asked for yet. <Link href="/desk/import">Import a chat</Link> and refresh memory — “we should”, “I
          want”, and “looking for” lines become demand.
        </Empty>
      ) : (
        <div className="space-y-4">
          {demands.map((d, i) => (
            <Card key={d.id} className="gap-3 py-5">
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    <Users className="size-3" /> {d.memberIds.length} {d.memberIds.length === 1 ? "person" : "people"}
                  </Badge>
                  {i === 0 ? (
                    <Badge variant="outline" className="border-primary text-primary">
                      <Flame className="size-3" /> Hottest
                    </Badge>
                  ) : null}
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{d.title || d.topic}</h2>
                  {d.oneLiner ? <p className="text-muted-foreground">{d.oneLiner}</p> : null}
                </div>
                <Citations citations={d.citations} label="Asked in the chat" />
                <div>
                  <Button onClick={() => void openProposal(d.id)} disabled={opening === d.id}>
                    {opening === d.id ? "Opening…" : "Open proposal"}
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
