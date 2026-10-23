"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Check, ExternalLink, Mic, Rocket } from "lucide-react";
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
import { api, getWorkspaceId } from "@/lib/api";
import type { CommunityEvent, ProposalPack, Venue } from "@/lib/types";
import { cn } from "@/lib/utils";

const PIPELINE = ["draft", "approved", "live"] as const;

export default function ProposalsPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [packs, setPacks] = useState<ProposalPack[] | null>(null);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [showVenueForm, setShowVenueForm] = useState(false);
  const [vname, setVname] = useState("");
  const [varea, setVarea] = useState("");
  const [vcap, setVcap] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const id = getWorkspaceId();
    if (!id) return;
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
  }, []);

  async function addVenue(e: React.FormEvent) {
    e.preventDefault();
    const id = getWorkspaceId();
    if (!id || !vname.trim()) return;
    try {
      await api(`/v1/workspaces/${id}/venues`, {
        method: "POST",
        body: JSON.stringify({ name: vname.trim(), area: varea.trim(), capacity: Number(vcap) || undefined }),
      });
      setVname("");
      setVarea("");
      setVcap("");
      setShowVenueForm(false);
      await load();
      toast.success("Venue saved — new proposals can match it.");
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
        kicker="Step 4 · The pack"
        title="Proposals"
        lede="Speakers and a venue pulled from memory, with evidence. Approve the pack, draft the outreach — the lead still sends it — then go live."
      />

      {packs === null ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : packs.length === 0 ? (
        <Empty>
          No packs yet. <Link href="/desk/demand">Open a proposal from demand</Link> — matching runs automatically.
        </Empty>
      ) : (
        <div className="space-y-4">
          {packs.map((p) => {
            const event = liveEventFor(p.id);
            const stage = PIPELINE.indexOf(p.status);
            return (
              <Card key={p.id} className="gap-4 py-5">
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ProposalStatusBadge status={p.status} />
                    <ol className="flex items-center gap-1.5" aria-label={`Stage: ${p.status}`}>
                      {PIPELINE.map((s, i) => (
                        <li key={s} className="flex items-center gap-1.5">
                          {i > 0 ? <span className="bg-border h-px w-5" aria-hidden /> : null}
                          <span
                            className={cn(
                              "text-xs tracking-wide capitalize",
                              i <= stage ? "text-foreground font-semibold" : "text-muted-foreground/60",
                            )}
                          >
                            {i < stage ? <Check className="mr-0.5 inline size-3 text-[var(--ok)]" /> : null}
                            {s}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {p.explanation ? <p>{p.explanation}</p> : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="bg-background rounded-md border p-3">
                      <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs tracking-wide uppercase">
                        <Mic className="size-3" /> Speakers
                      </p>
                      {p.speakers.length ? (
                        <p>{p.speakers.map((s) => s.displayName).join(", ")}</p>
                      ) : (
                        <p className="text-muted-foreground italic">No member offers matched — check People.</p>
                      )}
                    </div>
                    <div className="bg-background rounded-md border p-3">
                      <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs tracking-wide uppercase">
                        <Building2 className="size-3" /> Venue
                      </p>
                      {p.venue ? (
                        <p>
                          {p.venue.name}
                          {p.venue.area ? ` · ${p.venue.area}` : ""}
                          {p.venue.capacity ? ` · seats ${p.venue.capacity}` : ""}
                        </p>
                      ) : (
                        <p className="text-muted-foreground italic">None matched — add a room below.</p>
                      )}
                    </div>
                  </div>

                  <Citations citations={p.citations} label="Why this pack" />

                  {p.outreachDraft ? (
                    <div className="bg-background space-y-2 rounded-md border p-3">
                      <p className="text-muted-foreground text-xs tracking-wide uppercase">
                        Outreach draft — copy it into the chat yourself
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{p.outreachDraft}</p>
                      <CopyButton text={p.outreachDraft} label="Copy draft" />
                    </div>
                  ) : (
                    <div>
                      <Button
                        variant="outline"
                        onClick={() => void act(`outreach-${p.id}`, `/v1/proposals/${p.id}/outreach`)}
                        disabled={busy === `outreach-${p.id}`}
                      >
                        {busy === `outreach-${p.id}` ? "Drafting…" : "Draft outreach"}
                      </Button>
                    </div>
                  )}

                  <div className="border-border flex flex-wrap gap-2 border-t pt-3">
                    {p.status === "draft" ? (
                      <Button
                        onClick={() => void act(`approve-${p.id}`, `/v1/proposals/${p.id}/approve`)}
                        disabled={busy === `approve-${p.id}`}
                      >
                        {busy === `approve-${p.id}` ? "Approving…" : "Approve pack"}
                      </Button>
                    ) : null}
                    {p.status === "approved" ? (
                      <Button
                        onClick={() => void act(`live-${p.id}`, `/v1/proposals/${p.id}/go-live`, "/desk/events")}
                        disabled={busy === `live-${p.id}`}
                      >
                        <Rocket className="size-4" />
                        {busy === `live-${p.id}` ? "Publishing…" : "Go live"}
                      </Button>
                    ) : null}
                    {event ? (
                      <Button variant="outline" asChild>
                        <Link href={`/e/${event.slug}`} className="text-foreground no-underline">
                          <ExternalLink className="size-4" /> View event page
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Venue book</h2>
          <Button variant="outline" size="sm" onClick={() => setShowVenueForm((v) => !v)}>
            {showVenueForm ? "Close" : "Add a room"}
          </Button>
        </div>
        {venues.length === 0 && !showVenueForm ? (
          <Empty>No rooms yet. Add one so proposals can match a venue.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {venues.map((v) => (
              <Card key={v.id} className="gap-1 py-4">
                <CardContent>
                  <p className="font-semibold">{v.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {[v.area, v.capacity ? `seats ${v.capacity}` : null].filter(Boolean).join(" · ") || "—"}
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
                  <Input id="vname" required placeholder="The Hall" value={vname} onChange={(e) => setVname(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="varea">Area</Label>
                  <Input id="varea" placeholder="Old Street" value={varea} onChange={(e) => setVarea(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vcap">Capacity</Label>
                  <Input id="vcap" type="number" min={1} placeholder="40" value={vcap} onChange={(e) => setVcap(e.target.value)} />
                </div>
                <div className="sm:col-span-3">
                  <Button type="submit">Save venue</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
