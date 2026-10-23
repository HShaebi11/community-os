"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, Kicker } from "@/components/kicker";
import { api, getWorkspaceId } from "@/lib/api";
import type { CommunityEvent, Guest } from "@/lib/types";

export default function EventsPage() {
  const [rows, setRows] = useState<Array<{ event: CommunityEvent; guests: Guest[] }>>([]);
  const [chains, setChains] = useState<Record<string, string>>({});

  useEffect(() => {
    const id = getWorkspaceId();
    if (!id) return;
    (async () => {
      try {
        const events = await api<CommunityEvent[]>(`/v1/workspaces/${id}/events`);
        const guests = await Promise.all(events.map((e) => api<Guest[]>(`/v1/events/${e.id}/guests`)));
        setRows(events.map((event, i) => ({ event, guests: guests[i] })));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "failed");
      }
    })();
  }, []);

  async function showChain(id: string) {
    try {
      const chain = await api<{ messages?: Array<{ body?: string; quote?: string }> }>(`/v1/events/${id}/chain`);
      const lines = (chain.messages || []).slice(0, 8).map((m) => m.body || m.quote || JSON.stringify(m));
      setChains((c) => ({ ...c, [id]: lines.join("\n") || JSON.stringify(chain, null, 2) }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  return (
    <section>
      <Kicker>Front door</Kicker>
      <h1 className="mb-2 text-3xl tracking-tight">Events</h1>
      <p className="text-muted-foreground mb-4">Native pages, QR, guests. The chain back to chat is private.</p>
      <div className="space-y-3">
        {rows.length === 0 ? (
          <Empty>Nothing live yet. Approve a proposal, then go live.</Empty>
        ) : (
          rows.map(({ event, guests }) => (
            <Card key={event.id} className="gap-2 py-4">
              <CardContent className="space-y-2">
                <Link href={`/e/${event.slug}`}>{event.title}</Link>
                <p className="text-muted-foreground">
                  {guests.length} guests · <Link href={`/e/${event.slug}`}>/e/{event.slug}</Link>
                </p>
                {guests.map((g) => (
                  <div key={g.email} className="text-muted-foreground border-b py-1 text-sm last:border-0">
                    {g.name} · {g.email}
                  </div>
                ))}
                <Button variant="outline" onClick={() => void showChain(event.id)}>
                  Show chain
                </Button>
                {chains[event.id] ? (
                  <pre className="text-muted-foreground overflow-x-auto text-sm whitespace-pre-wrap">{chains[event.id]}</pre>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
