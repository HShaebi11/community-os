"use client";

import Link from "next/link";
import { BadgeCheck, Pencil, RefreshCw, Search as SearchIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Citations } from "@/components/desk/citations";
import { PageHeader } from "@/components/desk/page-header";
import { Empty } from "@/components/kicker";
import { api, getWorkspaceId } from "@/lib/api";
import type { MemberCard } from "@/lib/types";

export default function PeoplePage() {
  const [cards, setCards] = useState<MemberCard[] | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ do: "", want: "", offer: "", notes: "" });
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const id = getWorkspaceId();
    if (!id) return;
    try {
      const members = await api<Array<{ id: string }>>(`/v1/workspaces/${id}/members`);
      const next = await Promise.all(members.map((m) => api<MemberCard>(`/v1/members/${m.id}`)));
      next.sort((a, b) => (b.lastActive ?? "").localeCompare(a.lastActive ?? ""));
      setCards(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function refreshMemory() {
    const id = getWorkspaceId();
    if (!id) return;
    setRefreshing(true);
    try {
      await api(`/v1/workspaces/${id}/memory`, { method: "POST" });
      await load();
      toast.success("Memory refreshed from the latest messages.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  function startEdit(m: MemberCard) {
    setEditing(m.id);
    setDraft({ do: m.do ?? "", want: m.want ?? "", offer: m.offer ?? "", notes: m.notes ?? "" });
  }

  async function save(id: string) {
    try {
      await api(`/v1/members/${id}`, { method: "PATCH", body: JSON.stringify(draft) });
      setEditing(null);
      toast.success("Saved — your edits always win over the model.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "save failed");
    }
  }

  async function togglePublic(m: MemberCard) {
    try {
      await api(`/v1/members/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ publicOptIn: !m.publicOptIn }),
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  const shown = (cards ?? []).filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${m.displayName} ${m.do} ${m.want} ${m.offer}`.toLowerCase().includes(q);
  });

  return (
    <section>
      <PageHeader
        kicker="Step 2 · Member memory"
        title="People"
        lede="Who they are, what they want, what they can offer — each field cited back to the chat. Your edits are never overwritten."
        actions={
          <Button variant="outline" onClick={() => void refreshMemory()} disabled={refreshing}>
            <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
            Refresh memory
          </Button>
        }
      />
      <div className="relative mb-5">
        <SearchIcon className="text-muted-foreground absolute top-2.5 left-3 size-4" />
        <Input
          className="pl-9"
          placeholder="Find someone by name, skill, or want…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {cards === null ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <Empty>
          {cards.length === 0 ? (
            <>
              No people yet. <Link href="/desk/import">Import a chat</Link>, then refresh memory.
            </>
          ) : (
            "Nobody matches that search."
          )}
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((m) => (
            <Card key={m.id} className="gap-3 py-5">
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">{m.displayName}</p>
                    <p className="text-muted-foreground text-xs">
                      {m.lastActive ? `Last active ${new Date(m.lastActive).toLocaleDateString()}` : "Seen in the chat"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.publicOptIn ? (
                      <Badge variant="outline" className="border-[var(--ok)] text-[var(--ok)]">
                        <BadgeCheck className="size-3" /> Public
                      </Badge>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => (editing === m.id ? setEditing(null) : startEdit(m))}
                      title={editing === m.id ? "Close editor" : "Edit card"}
                    >
                      {editing === m.id ? <X className="size-4" /> : <Pencil className="size-4" />}
                    </Button>
                  </div>
                </div>

                {editing === m.id ? (
                  <div className="space-y-3">
                    <Field label="Does" value={draft.do} onChange={(v) => setDraft((d) => ({ ...d, do: v }))} />
                    <Field label="Wants" value={draft.want} onChange={(v) => setDraft((d) => ({ ...d, want: v }))} />
                    <Field label="Offers" value={draft.offer} onChange={(v) => setDraft((d) => ({ ...d, offer: v }))} />
                    <Field label="Lead notes" value={draft.notes} onChange={(v) => setDraft((d) => ({ ...d, notes: v }))} />
                    <Button size="sm" onClick={() => void save(m.id)}>
                      Save card
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Row label="Does" value={m.do} />
                    <Row label="Wants" value={m.want} />
                    <Row label="Offers" value={m.offer} />
                    {m.notes ? <Row label="Notes" value={m.notes} /> : null}
                    <Citations citations={m.citations} />
                  </div>
                )}

                <div className="border-border flex items-center justify-between gap-2 border-t pt-3">
                  {m.publicOptIn && m.publicSlug ? (
                    <Link href={`/m/${m.publicSlug}`} className="text-sm">
                      Public ID /m/{m.publicSlug}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground text-sm">Public ID off</span>
                  )}
                  <Button variant="outline" size="sm" onClick={() => void togglePublic(m)}>
                    {m.publicOptIn ? "Make private" : "Give public ID"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2 text-sm">
      <span className="text-muted-foreground pt-px">{label}</span>
      {value ? <span>{value}</span> : <span className="text-muted-foreground/60 italic">—</span>}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
