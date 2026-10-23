"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Empty, Kicker } from "@/components/kicker";
import { api, getWorkspaceId } from "@/lib/api";
import type { MemberCard } from "@/lib/types";

export default function PeoplePage() {
  const [cards, setCards] = useState<MemberCard[]>([]);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { do: string; want: string; offer: string }>>({});

  async function load() {
    const id = getWorkspaceId();
    if (!id) return;
    try {
      const members = await api<Array<{ id: string }>>(`/v1/workspaces/${id}/members`);
      const next = await Promise.all(members.map((m) => api<MemberCard>(`/v1/members/${m.id}`)));
      setCards(next);
      setDrafts(
        Object.fromEntries(
          next.map((m) => [m.id, { do: m.do ?? "", want: m.want ?? "", offer: m.offer ?? "" }]),
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const shown = cards.filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${m.displayName} ${m.do} ${m.want} ${m.offer}`.toLowerCase().includes(q);
  });

  function patchDraft(id: string, patch: Partial<{ do: string; want: string; offer: string }>) {
    setDrafts((d) => {
      const current = d[id] ?? { do: "", want: "", offer: "" };
      return { ...d, [id]: { ...current, ...patch } };
    });
  }

  async function save(id: string) {
    const draft = drafts[id];
    try {
      await api(`/v1/members/${id}`, { method: "PATCH", body: JSON.stringify(draft) });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "save failed");
    }
  }

  async function makePublic(id: string) {
    try {
      await api(`/v1/members/${id}`, { method: "PATCH", body: JSON.stringify({ publicOptIn: true }) });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  return (
    <section>
      <Kicker>Members</Kicker>
      <h1 className="mb-2 text-3xl tracking-tight">People</h1>
      <p className="text-muted-foreground mb-4">Lead edits win. Citations stay on the card.</p>
      <Input className="mb-4" placeholder="Find someone…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="space-y-3">
        {shown.length === 0 ? (
          <Empty>No people match. Import a chat, then refresh memory.</Empty>
        ) : (
          shown.map((m) => (
            <Card key={m.id} className="gap-2 py-4">
              <CardContent className="space-y-3">
                <strong>{m.displayName}</strong>
                {m.citations?.[0]?.quote ? (
                  <p className="text-muted-foreground">“{m.citations[0].quote}”</p>
                ) : null}
                <div>
                  <Label>Does</Label>
                  <Input
                    value={drafts[m.id]?.do ?? ""}
                    onChange={(e) => patchDraft(m.id, { do: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Wants</Label>
                  <Input
                    value={drafts[m.id]?.want ?? ""}
                    onChange={(e) => patchDraft(m.id, { want: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Offers</Label>
                  <Input
                    value={drafts[m.id]?.offer ?? ""}
                    onChange={(e) => patchDraft(m.id, { offer: e.target.value })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => void save(m.id)}>Save</Button>
                  {m.publicOptIn && m.publicSlug ? (
                    <Link href={`/m/${m.publicSlug}`}>Public ID</Link>
                  ) : (
                    <Button variant="outline" onClick={() => void makePublic(m.id)}>
                      Public ID
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
