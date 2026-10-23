"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, Kicker } from "@/components/kicker";
import { api, getWorkspaceId } from "@/lib/api";
import type { Briefing } from "@/lib/types";

export default function BriefingPage() {
  const [brief, setBrief] = useState<Briefing | null>(null);

  useEffect(() => {
    const id = getWorkspaceId();
    if (!id) return;
    api<Briefing>(`/v1/workspaces/${id}/briefing`)
      .then(setBrief)
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "failed"));
  }, []);

  return (
    <section>
      <Kicker>Today</Kicker>
      <h1 className="mb-2 text-3xl tracking-tight">Briefing</h1>
      <p className="text-muted-foreground mb-4">Who is here, what they want, and what is live.</p>
      {!brief ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="People" value={brief.people} />
            <Stat label="Messages" value={brief.messages} />
            <Stat label="Resources" value={(brief.resources ?? []).length} />
          </div>
          {!brief.people && <Empty>No people yet. Import a chat, then refresh memory.</Empty>}
          {brief.people && !(brief.topDemands ?? []).length && (
            <Empty>No demand extracted yet. Refresh memory after import.</Empty>
          )}
          <h2 className="text-lg font-semibold">Top demand</h2>
          {(brief.topDemands ?? []).map((d) => (
            <Card key={d.id} className="gap-2 py-4">
              <CardContent>
                <strong>{d.title || d.topic}</strong>
                {d.oneLiner ? <p className="text-muted-foreground mt-1">{d.oneLiner}</p> : null}
              </CardContent>
            </Card>
          ))}
          {(brief.nextEvents ?? []).length > 0 && (
            <>
              <h2 className="text-lg font-semibold">Next events</h2>
              {(brief.nextEvents ?? []).map((e) => (
                <Card key={e.slug} className="gap-2 py-4">
                  <CardContent>
                    <Link href={`/e/${e.slug}`}>{e.title}</Link>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
          {(brief.resources ?? []).length > 0 && (
            <>
              <h2 className="text-lg font-semibold">Resources</h2>
              {(brief.resources ?? []).map((r) => (
                <Card key={r.url} className="gap-2 py-4">
                  <CardContent>
                    <a href={r.url}>{r.title || r.url}</a>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
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
