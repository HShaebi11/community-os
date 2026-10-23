"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useJourney } from "@/components/desk/journey";
import { PageHeader } from "@/components/desk/page-header";
import { Empty } from "@/components/kicker";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { api } from "@/lib/api";
import type { Briefing, Guest, TimelineEvent } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  import: "chat imported",
  memory: "memory refreshed",
  proposal: "proposal opened",
  published: "event went live",
  rsvp: "new guest",
  page_view: "event page viewed",
};

export default function BriefingPage() {
  const { workspace } = useWorkspace();
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [guests, setGuests] = useState(0);
  const { next } = useJourney(workspace.id, workspace.slug);

  useEffect(() => {
    const id = workspace.id;
    (async () => {
      try {
        const [b, tl] = await Promise.all([
          api<Briefing>(`/v1/workspaces/${id}/briefing`),
          api<TimelineEvent[]>(`/v1/workspaces/${id}/timeline`),
        ]);
        setBrief(b);
        setTimeline(tl.slice(-10).reverse());
        const counts = await Promise.all(
          (b.nextEvents ?? []).map((e) => api<Guest[]>(`/v1/events/${e.id}/guests`).catch(() => [])),
        );
        setGuests(counts.reduce((n, g) => n + g.length, 0));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "failed");
      }
    })();
  }, [workspace.id]);

  return (
    <section>
      <PageHeader kicker="briefing" title="What the room looks like today" />
      {!brief ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
          <div className="space-y-6">
            {brief.messages === 0 ? (
              <Card className="border-primary/30 gap-3 py-5">
                <CardContent>
                  <p className="text-primary mb-2 font-mono text-[0.65rem] tracking-wider uppercase">get started</p>
                  <ol className="text-muted-foreground list-inside list-decimal space-y-1 text-sm">
                    <li>
                      <Link href={`/w/${workspace.slug}/import`}>Import a chat</Link>
                    </li>
                    <li>
                      <Link href={`/w/${workspace.slug}/people`}>Build memory</Link>
                    </li>
                    <li>
                      <Link href={`/w/${workspace.slug}/settings/team`}>Invite co-leads</Link>
                    </li>
                    <li>
                      <Link href={`/w/${workspace.slug}/demand`}>Propose an event</Link>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            ) : next ? (
              <Card className="border-primary/30 gap-3 py-5">
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-primary font-mono text-[0.65rem] tracking-wider uppercase">
                      next → {next.label}
                    </p>
                    <p className="mt-1 font-medium">
                      {next.key === "import" && "Import the chat to build the evidence base."}
                      {next.key === "memory" && "Refresh memory so people become cards."}
                      {next.key === "propose" && "Turn a demand into a proposal pack."}
                      {next.key === "live" && "Approve a pack, publish the native page."}
                      {next.key === "guests" && "Share the link — own the guest list."}
                    </p>
                  </div>
                  <Button size="sm" asChild>
                    <Link href={next.href} className="text-primary-foreground no-underline">
                      Go <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-[var(--ok)]/40 gap-3 py-5">
                <CardContent>
                  <p className="font-medium">Loop closed — chat to guest list, all native.</p>
                  <p className="text-muted-foreground text-sm">Re-import as the chat moves and run it again.</p>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="people" value={brief.people} />
              <Stat label="messages" value={brief.messages} />
              <Stat label="live events" value={(brief.nextEvents ?? []).length} />
              <Stat label="guests" value={guests} />
            </div>

            <div>
              <h2 className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">top demand</h2>
              {!brief.people ? (
                <Empty>
                  No people yet — <Link href={`/w/${workspace.slug}/import`}>import a chat</Link>.
                </Empty>
              ) : (brief.topDemands ?? []).length === 0 ? (
                <Empty>Nothing asked for yet. Refresh memory after the next import.</Empty>
              ) : (
                <div className="space-y-2">
                  {(brief.topDemands ?? []).map((d) => (
                    <Card key={d.id} className="gap-2 py-4">
                      <CardContent className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{d.title || d.topic}</p>
                          <p className="text-muted-foreground truncate text-sm">{d.oneLiner}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            {d.memberIds.length}p
                          </Badge>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/w/${workspace.slug}/demand`} className="text-muted-foreground no-underline">
                              <ArrowUpRight className="size-4" />
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {(brief.nextEvents ?? []).length > 0 ? (
              <div>
                <h2 className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">live</h2>
                <div className="space-y-2">
                  {(brief.nextEvents ?? []).map((e) => (
                    <Card key={e.id} className="gap-2 py-4">
                      <CardContent className="flex items-center justify-between gap-3">
                        <Link href={`/e/${e.slug}`} className="truncate font-medium">
                          {e.title}
                        </Link>
                        <code className="text-muted-foreground text-xs">/e/{e.slug}</code>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : null}

            {(brief.resources ?? []).length > 0 ? (
              <div>
                <h2 className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">
                  trusted resources
                </h2>
                <ul className="space-y-1.5">
                  {(brief.resources ?? []).slice(0, 6).map((r) => (
                    <li key={r.url}>
                      <a href={r.url} target="_blank" rel="noreferrer" className="text-sm">
                        {r.title || r.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <aside>
            <h2 className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">activity</h2>
            {timeline.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing yet.</p>
            ) : (
              <ol className="border-border space-y-3 border-l pl-3">
                {timeline.map((t) => (
                  <li key={t.id} className="relative">
                    <span className="bg-primary absolute top-1.5 -left-[1.03rem] size-1.5 rounded-full" aria-hidden />
                    <p className="text-sm">{KIND_LABEL[t.kind] ?? t.kind}</p>
                    <p className="text-muted-foreground font-mono text-[0.65rem]">{formatWhen(t.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <span className="text-muted-foreground font-mono text-[0.65rem] tracking-wider uppercase">{label}</span>
      <b className="mt-1 block text-2xl font-semibold tracking-tight">{value}</b>
    </div>
  );
}

function formatWhen(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
