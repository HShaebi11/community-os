"use client";

import Link from "next/link";
import { ArrowRight, Flame, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useJourney } from "@/components/desk/journey";
import { PageHeader } from "@/components/desk/page-header";
import { Empty } from "@/components/kicker";
import { api, getWorkspaceId } from "@/lib/api";
import type { Briefing, Guest, TimelineEvent } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  import: "Chat imported",
  memory: "Memory refreshed",
  proposal: "Proposal opened",
  published: "Event went live",
  rsvp: "New guest",
  page_view: "Event page viewed",
};

export default function BriefingPage() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [guests, setGuests] = useState(0);
  const workspaceId = typeof window === "undefined" ? null : getWorkspaceId();
  const { next } = useJourney(workspaceId);

  useEffect(() => {
    const id = getWorkspaceId();
    if (!id) return;
    (async () => {
      try {
        const [b, tl] = await Promise.all([
          api<Briefing>(`/v1/workspaces/${id}/briefing`),
          api<TimelineEvent[]>(`/v1/workspaces/${id}/timeline`),
        ]);
        setBrief(b);
        setTimeline(tl.slice(-12).reverse());
        const counts = await Promise.all(
          (b.nextEvents ?? []).map((e) => api<Guest[]>(`/v1/events/${e.id}/guests`).catch(() => [])),
        );
        setGuests(counts.reduce((n, g) => n + g.length, 0));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "failed");
      }
    })();
  }, []);

  return (
    <section>
      <PageHeader
        kicker="Today"
        title="Briefing"
        lede="Who is here, what they want, and what is live."
      />
      {!brief ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-8">
          {next ? (
            <Card className="border-primary/40 gap-2 py-5">
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-muted-foreground text-xs tracking-wide uppercase">Next step</p>
                  <p className="text-lg font-semibold">
                    {next.key === "import" && "Import the chat to build the evidence base."}
                    {next.key === "memory" && "Refresh memory so the people become cards."}
                    {next.key === "propose" && "Turn a demand into a proposal pack."}
                    {next.key === "live" && "Approve a pack and publish the native event page."}
                    {next.key === "guests" && "Share the event link — own the guest list."}
                  </p>
                </div>
                <Button asChild>
                  <Link href={next.href} className="text-primary-foreground no-underline">
                    {next.label} <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-[var(--ok)]/50 gap-2 py-5">
              <CardContent>
                <p className="text-lg font-semibold">The loop is closed — chat to guest list, all yours.</p>
                <p className="text-muted-foreground">Keep importing as the chat moves, and rerun the loop each week.</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="People" value={brief.people} />
            <Stat label="Messages" value={brief.messages} />
            <Stat label="Live events" value={(brief.nextEvents ?? []).length} />
            <Stat label="Guests" value={guests} />
          </div>

          <div>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Flame className="size-4" /> Top demand
            </h2>
            {!brief.people ? (
              <Empty>
                No people yet. <Link href="/desk/import">Import a chat</Link> to start remembering.
              </Empty>
            ) : (brief.topDemands ?? []).length === 0 ? (
              <Empty>
                Nothing asked for yet. <Link href="/desk/import">Refresh memory</Link> after the next import.
              </Empty>
            ) : (
              <div className="space-y-3">
                {(brief.topDemands ?? []).map((d) => (
                  <Card key={d.id} className="gap-2 py-4">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{d.title || d.topic}</p>
                        {d.oneLiner ? <p className="text-muted-foreground text-sm">{d.oneLiner}</p> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          <Users className="size-3" /> {d.memberIds.length}
                        </Badge>
                        <Button variant="outline" size="sm" asChild>
                          <Link href="/desk/demand" className="text-foreground no-underline">
                            Open
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
              <h2 className="mb-3 text-lg font-semibold">Live events</h2>
              <div className="space-y-3">
                {(brief.nextEvents ?? []).map((e) => (
                  <Card key={e.id} className="gap-2 py-4">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <Link href={`/e/${e.slug}`} className="font-semibold">
                        {e.title}
                      </Link>
                      <code className="text-muted-foreground text-sm">/e/{e.slug}</code>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}

          {(brief.resources ?? []).length > 0 ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold">Resources the chat trusts</h2>
              <div className="space-y-3">
                {(brief.resources ?? []).slice(0, 6).map((r) => (
                  <Card key={r.url} className="gap-2 py-4">
                    <CardContent>
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.title || r.url}
                      </a>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}

          {timeline.length > 0 ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold">Activity</h2>
              <ol className="border-border space-y-0 border-l pl-4">
                {timeline.map((t) => (
                  <li key={t.id} className="relative pb-4 last:pb-0">
                    <span className="bg-primary absolute top-1.5 -left-[1.42rem] size-2 rounded-full" aria-hidden />
                    <p className="text-sm font-medium">{KIND_LABEL[t.kind] ?? t.kind}</p>
                    <p className="text-muted-foreground text-xs">{formatWhen(t.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card rounded-md border p-4">
      <span className="text-muted-foreground text-sm">{label}</span>
      <b className="block text-2xl tracking-tight">{value}</b>
    </div>
  );
}

function formatWhen(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
