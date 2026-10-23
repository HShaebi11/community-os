"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, Kicker } from "@/components/kicker";
import { api, getWorkspaceId } from "@/lib/api";
import type { Demand } from "@/lib/types";

export default function DemandPage() {
  const router = useRouter();
  const [demands, setDemands] = useState<Demand[]>([]);

  useEffect(() => {
    const id = getWorkspaceId();
    if (!id) return;
    api<Demand[]>(`/v1/workspaces/${id}/demands`)
      .then(setDemands)
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "failed"));
  }, []);

  async function openProposal(demandId: string) {
    const id = getWorkspaceId();
    if (!id) return;
    try {
      await api(`/v1/workspaces/${id}/proposals`, {
        method: "POST",
        body: JSON.stringify({ demandId }),
      });
      router.push("/desk/proposals");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  return (
    <section>
      <Kicker>Wanting</Kicker>
      <h1 className="mb-2 text-3xl tracking-tight">Demand</h1>
      <p className="text-muted-foreground mb-4">
        Unique people asking for a thing. Open a proposal when you are ready to run it.
      </p>
      <div className="space-y-3">
        {demands.length === 0 ? (
          <Empty>Refresh memory to extract demand.</Empty>
        ) : (
          demands.map((d) => (
            <Card key={d.id} className="gap-2 py-4">
              <CardContent className="space-y-3">
                <Badge variant="outline">{d.memberIds.length} people</Badge>
                <h2 className="text-lg font-semibold">{d.title || d.topic}</h2>
                <Button onClick={() => void openProposal(d.id)}>Open proposal</Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
