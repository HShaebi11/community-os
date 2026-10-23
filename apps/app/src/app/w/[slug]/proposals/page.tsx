"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ExternalLink, Mic, Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Citations } from "@/components/desk/citations";
import { PageHeader } from "@/components/desk/page-header";
import { ProposalStatusBadge } from "@/components/desk/status-badge";
import { CopyButton } from "@/components/copy-button";
import { Empty } from "@/components/kicker";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { api } from "@/lib/api";
import type { CommunityEvent, ProposalPack, Venue } from "@/lib/types";

export default function ProposalsPage() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [packs, setPacks] = useState<ProposalPack[] | null>(null);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [showVenueForm, setShowVenueForm] = useState(false);
  const [vname, setVname] = useState("");
  const [varea, setVarea] = useState("");
  const [vcap, setVcap] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const id = workspace.id;
    try {
      const [vs, proposals, evs] = await Promise.all([
        api<Venue[]>(`/v1/workspaces/${id}/venues`),
        api<Array<{ id: string }>>(`/v1/workspaces/${id}/proposals`),
        api<CommunityEvent[]>(`/v1/workspaces/${id}/events`),
      ]);
      setVenues(vs);
      setEvents(evs);
      setPacks(await Promise.all(proposals.map((p) => api<ProposalPack>(`/v1/proposals/${p.id}`))));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  async function addVenue(e: React.FormEvent) {
    e.preventDefault();
    if (!vname.trim()) return;
    try {
      await api(`/v1/workspaces/${workspace.id}/venues`, {
        method: "POST",
        body: JSON.stringify({ name: vname.trim(), area: varea.trim(), capacity: Number(vcap) || undefined }),
      });
      setVname("");
      setVarea("");
      setVcap("");
      setShowVenueForm(false);
      await load();
      toast.success("Venue saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function act(key: string, path: string, then?: string) {
    setBusy(key);
    try {
      await api(path, { method: "POST" });
      if (then) router.push(then);
      else await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  const liveEventFor = (proposalId: string) => events.find((e) => e.proposalId === proposalId);

  return (
    <section>
      <PageHeader
        kicker="proposal packs"
        title="Proposals"
        lede="Speakers and a venue matched from memory. Approve, draft the outreach, go live. The lead still sends."
      />
      {packs === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : packs.length === 0 ? (
        <Empty>
          No packs yet. <Link href={`/w/${workspace.slug}/demand`}>Open one from demand</Link>.
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {packs.map((p) => {
            const event = liveEventFor(p.id);
            return (
              <Card key={p.id} className="gap-4 py-5">
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <ProposalStatusBadge status={p.status} />
                    {event ? (
                      <Link href={`/e/${event.slug}`} className="flex items-center gap-1 font-mono text-xs">
                        /e/{event.slug} <ExternalLink className="size-3" />
                      </Link>
                    ) : null}
                  </div>

                  {p.explanation ? <p className="text-sm">{p.explanation}</p> : null}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="bg-background rounded-md border p-3">
                      <p className="text-muted-foreground mb-1 flex items-center gap-1 font-mono text-[0.6rem] tracking-wider uppercase">
                        <Mic className="size-3" /> speakers
                      </p>
                      <p className="text-sm">
                        {p.speakers.length ? (
                          p.speakers.map((s) => s.displayName).join(", ")
                        ) : (
                          <span className="text-muted-foreground">no matches</span>
                        )}
                      </p>
                    </div>
                    <div className="bg-background rounded-md border p-3">
                      <p className="text-muted-foreground mb-1 flex items-center gap-1 font-mono text-[0.6rem] tracking-wider uppercase">
                        <Building2 className="size-3" /> venue
                      </p>
                      <p className="text-sm">
                        {p.venue ? (
                          <>
                            {p.venue.name}
                            {p.venue.area ? ` · ${p.venue.area}` : ""}
                          </>
                        ) : (
                          <span className="text-muted-foreground">none matched</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <Citations citations={p.citations} label="why this pack" />

                  {p.outreachDraft ? (
                    <div className="bg-background space-y-2 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-muted-foreground font-mono text-[0.6rem] tracking-wider uppercase">
                          outreach draft — you send it
                        </p>
                        <CopyButton text={p.outreachDraft} label="copy" />
                      </div>
                      <p className="text-muted-foreground text-sm whitespace-pre-wrap">{p.outreachDraft}</p>
                    </div>
                  ) : null}

                  <div className="border-border flex flex-wrap gap-2 border-t pt-3">
                    {!p.outreachDraft ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void act(`outreach-${p.id}`, `/v1/proposals/${p.id}/outreach`)}
                        disabled={busy === `outreach-${p.id}`}
                      >
                        {busy === `outreach-${p.id}` ? "drafting…" : "draft outreach"}
                      </Button>
                    ) : null}
                    {p.status === "draft" ? (
                      <Button
                        size="sm"
                        onClick={() => void act(`approve-${p.id}`, `/v1/proposals/${p.id}/approve`)}
                        disabled={busy === `approve-${p.id}`}
                      >
                        {busy === `approve-${p.id}` ? "approving…" : "approve"}
                      </Button>
                    ) : null}
                    {p.status === "approved" ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          void act(`live-${p.id}`, `/v1/proposals/${p.id}/go-live`, `/w/${workspace.slug}/events`)
                        }
                        disabled={busy === `live-${p.id}`}
                      >
                        <Rocket className="size-3.5" />
                        {busy === `live-${p.id}` ? "publishing…" : "go live"}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-10 max-w-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">venue book</h2>
          <Button variant="outline" size="sm" onClick={() => setShowVenueForm((v) => !v)}>
            {showVenueForm ? "close" : "+ add a room"}
          </Button>
        </div>
        {venues.length === 0 && !showVenueForm ? (
          <Empty>No rooms yet — add one so proposals can match a venue.</Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {venues.map((v) => (
              <Card key={v.id} className="gap-1 py-3">
                <CardContent>
                  <p className="text-sm font-medium">{v.name}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {[v.area, v.capacity ? `${v.capacity} cap` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {showVenueForm ? (
          <Card className="mt-3 gap-2 py-4">
            <CardContent>
              <form onSubmit={(e) => void addVenue(e)} className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="vname">Name</Label>
                  <Input id="vname" required value={vname} onChange={(e) => setVname(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="varea">Area</Label>
                  <Input id="varea" value={varea} onChange={(e) => setVarea(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vcap">Capacity</Label>
                  <Input id="vcap" type="number" min={1} value={vcap} onChange={(e) => setVcap(e.target.value)} />
                </div>
                <div className="sm:col-span-3">
                  <Button type="submit" size="sm">
                    save venue
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
