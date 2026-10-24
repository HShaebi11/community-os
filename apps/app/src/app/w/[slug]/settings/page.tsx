"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DecisionBadge } from "@/components/desk/status-badge";
import { PageHeader } from "@/components/desk/page-header";
import { Empty } from "@/components/kicker";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { api } from "@/lib/api";
import type { Application, Workspace } from "@/lib/types";

export default function SettingsPage() {
  const { workspace, role, refresh } = useWorkspace();
  const [name, setName] = useState(workspace.name);
  const [joinUrl, setJoinUrl] = useState(workspace.joinUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  const [applicant, setApplicant] = useState("");
  const [answers, setAnswers] = useState("");
  const [scoring, setScoring] = useState(false);
  const canEdit = role === "owner" || role === "admin";

  async function load() {
    try {
      setApps(await api<Application[]>(`/v1/workspaces/${workspace.id}/applications`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  useEffect(() => {
    setName(workspace.name);
    setJoinUrl(workspace.joinUrl ?? "");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api<Workspace>(`/v1/workspaces/${workspace.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() || undefined, joinUrl: joinUrl.trim() || null }),
      });
      toast.success("Saved.");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setSaving(false);
    }
  }

  async function score(e: React.FormEvent) {
    e.preventDefault();
    if (!applicant.trim() || !answers.trim()) return;
    setScoring(true);
    try {
      await api(`/v1/workspaces/${workspace.id}/applications`, {
        method: "POST",
        body: JSON.stringify({ applicant: applicant.trim(), answers: answers.trim() }),
      });
      setApplicant("");
      setAnswers("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setScoring(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader kicker="workspace" title="General" />

      <Card className="mb-8 gap-3 py-5">
        <CardContent>
          <form onSubmit={(e) => void save(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Community name</Label>
              <Input id="ws-name" required value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-join">Chat join link</Label>
              <Input
                id="ws-join"
                type="url"
                placeholder="https://chat.whatsapp.com/…"
                value={joinUrl}
                onChange={(e) => setJoinUrl(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                front door:{" "}
                <Link href={`/c/${workspace.slug}`} className="font-mono">
                  /c/{workspace.slug}
                </Link>
                {" · "}
                <a href={`/v1/workspaces/${workspace.id}/export`} className="font-mono" download>
                  export json
                </a>
              </p>
              {canEdit ? (
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "saving…" : "save"}
                </Button>
              ) : (
                <Badge variant="outline" className="font-mono">{role}</Badge>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="size-4" />
        <h2 className="font-semibold">Gatekeeper</h2>
      </div>
      <p className="text-muted-foreground mb-4 text-sm">
        Score an application before letting someone in. Confirmed blocklist entries decline automatically.
      </p>
      <Card className="gap-3 py-5">
        <CardContent>
          <form onSubmit={(e) => void score(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="applicant">Applicant</Label>
              <Input
                id="applicant"
                required
                placeholder="name or handle"
                value={applicant}
                onChange={(e) => setApplicant(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="answers">Answers</Label>
              <Textarea
                id="answers"
                required
                rows={4}
                value={answers}
                onChange={(e) => setAnswers(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={scoring}>
              {scoring ? "scoring…" : "score application"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="mt-4 space-y-2">
        {apps.length === 0 ? (
          <Empty>No applications scored yet.</Empty>
        ) : (
          apps.map((a, i) => (
            <Card key={a.id ?? i} className="gap-2 py-3">
              <CardContent className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.applicant}</p>
                  <p className="text-muted-foreground truncate text-xs">{a.reason}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {typeof a.score === "number" ? (
                    <span className="text-muted-foreground font-mono text-xs">{a.score}</span>
                  ) : null}
                  <DecisionBadge decision={a.decision} />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
