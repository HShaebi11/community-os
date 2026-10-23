"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, Sparkles, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/desk/page-header";
import { CopyButton } from "@/components/copy-button";
import { Empty } from "@/components/kicker";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { api } from "@/lib/api";
import type { AutopilotArtifact, CommunityEvent, EventChain, Guest } from "@/lib/types";

const ART_LABEL: Record<string, string> = {
  run_sheet: "run sheet",
  post: "promo post",
  newsletter: "newsletter",
};

export default function EventsPage() {
  const { workspace } = useWorkspace();
  const [rows, setRows] = useState<Array<{ event: CommunityEvent; guests: Guest[] }> | null>(null);
  const [chains, setChains] = useState<Record<string, EventChain>>({});
  const [autos, setAutos] = useState<Record<string, AutopilotArtifact[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const id = workspace.id;
    (async () => {
      try {
        const events = await api<CommunityEvent[]>(`/v1/workspaces/${id}/events`);
        const guests = await Promise.all(events.map((e) => api<Guest[]>(`/v1/events/${e.id}/guests`)));
        setRows(events.map((event, i) => ({ event, guests: guests[i] })));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "failed");
      }
    })();
  }, [workspace.id]);

  async function toggleChain(id: string) {
    setOpen((o) => ({ ...o, [id]: !o[id] }));
    if (chains[id]) return;
    try {
      const chain = await api<EventChain>(`/v1/events/${id}/chain`);
      setChains((c) => ({ ...c, [id]: chain }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function autopilot(id: string) {
    setBusy(id);
    try {
      const arts = await api<AutopilotArtifact[]>(`/v1/events/${id}/autopilot`, { method: "POST" });
      setAutos((a) => ({ ...a, [id]: arts }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <PageHeader
        kicker="the door"
        title="Live events"
        lede="Native pages, QR, a guest list you own. The chain back to chat stays private."
      />
      {rows === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <Empty>
          Nothing live yet. <Link href={`/w/${workspace.slug}/proposals`}>Approve a pack</Link> and go live.
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map(({ event, guests }) => (
            <Card key={event.id} className="gap-4 py-5">
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/e/${event.slug}`} className="block truncate font-semibold">
                      {event.title}
                    </Link>
                    <p className="text-muted-foreground font-mono text-xs">
                      {guests.length} {guests.length === 1 ? "guest" : "guests"} · /e/{event.slug}
                    </p>
                  </div>
                  <CopyButton text={`${window.location.origin}/e/${event.slug}`} label="link" />
                </div>

                {guests.length > 0 ? (
                  <div className="bg-background rounded-md border p-3">
                    <p className="text-muted-foreground mb-2 font-mono text-[0.6rem] tracking-wider uppercase">
                      guest list
                    </p>
                    <ul className="divide-border divide-y">
                      {guests.map((g) => (
                        <li key={g.email} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                          <span className="truncate">{g.name}</span>
                          <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
                            {g.memberId ? (
                              <Badge variant="outline" className="border-[var(--ok)]/50 font-mono text-[var(--ok)]">
                                <UserCheck className="size-3" /> member
                              </Badge>
                            ) : null}
                            {g.email}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No RSVPs yet — share the link in the chat.</p>
                )}

                <div className="border-border flex flex-wrap gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" onClick={() => void autopilot(event.id)} disabled={busy === event.id}>
                    <Sparkles className="size-3.5" />
                    {busy === event.id ? "drafting…" : autos[event.id] ? "regen autopilot" : "autopilot drafts"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void toggleChain(event.id)}>
                    {open[event.id] ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    chain
                  </Button>
                </div>

                {autos[event.id] ? (
                  <div className="grid gap-2">
                    {autos[event.id].map((a) => (
                      <div key={a.id} className="bg-background space-y-2 rounded-md border p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-muted-foreground font-mono text-[0.6rem] tracking-wider uppercase">
                            {ART_LABEL[a.kind] ?? a.kind}
                          </p>
                          <CopyButton text={a.body} label="copy" />
                        </div>
                        <pre className="text-muted-foreground overflow-x-auto text-xs whitespace-pre-wrap">{a.body}</pre>
                      </div>
                    ))}
                  </div>
                ) : null}

                {open[event.id] ? (
                  <div className="bg-background rounded-md border p-3">
                    {!chains[event.id] ? (
                      <p className="text-muted-foreground text-sm">Loading…</p>
                    ) : (
                      <ol className="border-border space-y-2.5 border-l pl-3">
                        <ChainStep label="event" value={chains[event.id].event.title} />
                        {chains[event.id].proposal ? (
                          <ChainStep label="proposal" value={chains[event.id].proposal?.status ?? ""} />
                        ) : null}
                        {chains[event.id].demand ? (
                          <ChainStep
                            label="demand"
                            value={chains[event.id].demand?.title ?? chains[event.id].demand?.topic ?? ""}
                          />
                        ) : null}
                        {chains[event.id].messages.map((m) => (
                          <ChainStep
                            key={m.id}
                            label={`${m.authorRaw} said`}
                            value={`“${m.body.slice(0, 140)}${m.body.length > 140 ? "…" : ""}”`}
                          />
                        ))}
                      </ol>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function ChainStep({ label, value }: { label: string; value: string }) {
  return (
    <li className="relative">
      <span className="bg-primary absolute top-1.5 -left-[0.83rem] size-1.5 rounded-full" aria-hidden />
      <p className="text-muted-foreground font-mono text-[0.6rem] tracking-wider uppercase">{label}</p>
      <p className="text-sm">{value}</p>
    </li>
  );
}
