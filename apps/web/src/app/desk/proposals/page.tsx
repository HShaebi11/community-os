"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Empty, Kicker } from "@/components/kicker";
import { api, getWorkspaceId } from "@/lib/api";
import type { ProposalPack, Venue } from "@/lib/types";

export default function ProposalsPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [packs, setPacks] = useState<ProposalPack[]>([]);
  const [vname, setVname] = useState("");
  const [varea, setVarea] = useState("");
  const [vcap, setVcap] = useState("");

  async function load() {
    const id = getWorkspaceId();
    if (!id) return;
    try {
      const vs = await api<Venue[]>(`/v1/workspaces/${id}/venues`);
      setVenues(vs);
      const proposals = await api<Array<{ id: string }>>(`/v1/workspaces/${id}/proposals`);
      setPacks(await Promise.all(proposals.map((p) => api<ProposalPack>(`/v1/proposals/${p.id}`))));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addVenue() {
    const id = getWorkspaceId();
    if (!id) return;
    try {
      await api(`/v1/workspaces/${id}/venues`, {
        method: "POST",
        body: JSON.stringify({
          name: vname,
          area: varea,
          capacity: Number(vcap) || undefined,
        }),
      });
      setVname("");
      setVarea("");
      setVcap("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function act(path: string, then?: string) {
    try {
      await api(path, { method: "POST" });
      if (then) router.push(then);
      else await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  return (
    <section>
      <Kicker>Pack</Kicker>
      <h1 className="mb-2 text-3xl tracking-tight">Proposals</h1>
      <p className="text-muted-foreground mb-4">Speakers and a venue from memory. Draft outreach — do not auto-send.</p>
      <h2 className="mb-2 text-lg font-semibold">Venues</h2>
      <div className="space-y-3">
        {venues.length === 0 ? <Empty>Add a room so proposals can pick a venue.</Empty> : null}
        {venues.map((v) => (
          <Card key={v.id} className="gap-2 py-4">
            <CardContent>
              <strong>{v.name}</strong>
              <p className="text-muted-foreground">
                {v.area || ""}
                {v.capacity ? ` · ${v.capacity}` : ""}
              </p>
            </CardContent>
          </Card>
        ))}
        <Card className="gap-2 py-4">
          <CardContent className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={vname} onChange={(e) => setVname(e.target.value)} />
            </div>
            <div>
              <Label>Area</Label>
              <Input value={varea} onChange={(e) => setVarea(e.target.value)} />
            </div>
            <div>
              <Label>Capacity</Label>
              <Input type="number" value={vcap} onChange={(e) => setVcap(e.target.value)} />
            </div>
            <Button onClick={() => void addVenue()}>Add venue</Button>
          </CardContent>
        </Card>
      </div>
      <h2 className="mt-6 mb-2 text-lg font-semibold">Open packs</h2>
      <div className="space-y-3">
        {packs.length === 0 ? (
          <Empty>Open a proposal from Demand.</Empty>
        ) : (
          packs.map((p) => (
            <Card key={p.id} className="gap-2 py-4">
              <CardContent className="space-y-3">
                <Badge variant={p.status === "live" ? "default" : "outline"} className={p.status === "live" ? "bg-[var(--ok)]" : ""}>
                  {p.status}
                </Badge>
                {p.explanation ? <p>{p.explanation}</p> : null}
                <p className="text-muted-foreground">
                  Speakers: {(p.speakers || []).map((s) => s.displayName).join(", ")}
                </p>
                <p className="text-muted-foreground">Venue: {p.venue?.name ?? "none"}</p>
                {p.outreachDraft ? (
                  <pre className="text-muted-foreground overflow-x-auto text-sm whitespace-pre-wrap">{p.outreachDraft}</pre>
                ) : (
                  <Button onClick={() => void act(`/v1/proposals/${p.id}/outreach`)}>Draft outreach</Button>
                )}
                {p.status === "draft" ? (
                  <Button onClick={() => void act(`/v1/proposals/${p.id}/approve`)}>Approve</Button>
                ) : null}
                {p.status === "approved" ? (
                  <Button onClick={() => void act(`/v1/proposals/${p.id}/go-live`, "/desk/events")}>Go live</Button>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
