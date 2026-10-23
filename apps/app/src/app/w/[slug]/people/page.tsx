"use client";

import Link from "next/link";
import { Globe, Pencil, RefreshCw, Search as SearchIcon, X } from "lucide-react";
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
import { useWorkspace } from "@/components/workspace/workspace-context";
import { api } from "@/lib/api";
import type { MemberCard } from "@/lib/types";

export default function PeoplePage() {
  const { workspace } = useWorkspace();
  const [cards, setCards] = useState<MemberCard[] | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ do: "", want: "", offer: "", notes: "" });
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const id = workspace.id;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  async function refreshMemory() {
    setRefreshing(true);
    try {
      await api(`/v1/workspaces/${workspace.id}/memory`, { method: "POST" });
      await load();
      toast.success("Memory refreshed.");
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
      toast.success("Saved — lead edits always win.");
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
        kicker="member memory"
        title="People"
        lede="Every field cited back to the message it came from. Your edits are never overwritten."
        actions={
          <Button variant="outline" size="sm" onClick={() => void refreshMemory()} disabled={refreshing}>
            <RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
            refresh memory
          </Button>
        }
      />
      <div className="relative mb-5 max-w-sm">
        <SearchIcon className="text-muted-foreground absolute top-2.5 left-3 size-4" />
        <Input className="pl-9" placeholder="name, skill, want…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {cards === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : shown.length === 0 ? (
        <Empty>
          {cards.length === 0 ? (
            <>
              Nobody here yet. <Link href={`/w/${workspace.slug}/import`}>Import a chat</Link>, then refresh memory.
            </>
          ) : (
            "No matches."
          )}
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((m) => (
            <Card key={m.id} className="gap-3 py-5">
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{m.displayName}</p>
                    <p className="text-muted-foreground font-mono text-[0.65rem]">
                      {m.lastActive ? `active ${new Date(m.lastActive).toLocaleDateString()}` : "seen in chat"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {m.publicOptIn ? (
                      <Badge variant="outline" className="border-[var(--ok)]/50 font-mono text-[var(--ok)]">
                        <Globe className="size-3" /> public
                      </Badge>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => (editing === m.id ? setEditing(null) : startEdit(m))}
                    >
                      {editing === m.id ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}
                    </Button>
                  </div>
                </div>

                {editing === m.id ? (
                  <div className="space-y-2.5">
                    <Field label="does" value={draft.do} onChange={(v) => setDraft((d) => ({ ...d, do: v }))} />
                    <Field label="wants" value={draft.want} onChange={(v) => setDraft((d) => ({ ...d, want: v }))} />
                    <Field label="offers" value={draft.offer} onChange={(v) => setDraft((d) => ({ ...d, offer: v }))} />
                    <Field label="notes" value={draft.notes} onChange={(v) => setDraft((d) => ({ ...d, notes: v }))} />
                    <Button size="sm" onClick={() => void save(m.id)}>
                      save
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-sm">
                    <Row label="does" value={m.do} />
                    <Row label="wants" value={m.want} />
                    <Row label="offers" value={m.offer} />
                    <Citations citations={m.citations} label="from the chat" />
                  </div>
                )}

                <div className="border-border flex items-center justify-between gap-2 border-t pt-2.5 text-xs">
                  {m.publicOptIn && m.publicSlug ? (
                    <Link href={`/m/${m.publicSlug}`} className="font-mono">
                      /m/{m.publicSlug}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground font-mono">private</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void togglePublic(m)}
                    className="text-muted-foreground hover:text-foreground font-mono transition-colors"
                  >
                    {m.publicOptIn ? "make private" : "publish ID"}
                  </button>
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
    <div className="grid grid-cols-[3.5rem_1fr] gap-2">
      <span className="text-muted-foreground pt-px font-mono text-[0.65rem] tracking-wider uppercase">{label}</span>
      {value ? <span>{value}</span> : <span className="text-muted-foreground/50">—</span>}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="font-mono text-[0.65rem] tracking-wider uppercase">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
