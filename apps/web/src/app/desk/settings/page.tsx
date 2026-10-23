"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DecisionBadge } from "@/components/desk/status-badge";
import { PageHeader } from "@/components/desk/page-header";
import { Empty } from "@/components/kicker";
import { api, getWorkspaceId, setWorkspaceId } from "@/lib/api";
import type { Application, Workspace } from "@/lib/types";

export default function SettingsPage() {
  const [who, setWho] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [applicant, setApplicant] = useState("");
  const [answers, setAnswers] = useState("");
  const [scoring, setScoring] = useState(false);

  async function load() {
    try {
      const me = await api<{ email: string }>("/v1/me");
      setWho(me.email);
      const list = await api<Workspace[]>("/v1/workspaces");
      setWorkspaces(list);
      const id = getWorkspaceId();
      if (!id) {
        setWorkspace(null);
        setApps([]);
        return;
      }
      const ws = await api<Workspace>(`/v1/workspaces/${id}`);
      setWorkspace(ws);
      setApps(await api<Application[]>(`/v1/workspaces/${id}/applications`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function score(e: React.FormEvent) {
    e.preventDefault();
    const id = getWorkspaceId();
    if (!id || !applicant.trim() || !answers.trim()) return;
    setScoring(true);
    try {
      await api(`/v1/workspaces/${id}/applications`, {
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
    <section>
      <PageHeader kicker="Workspace" title="Settings" lede="Switch communities, check the gate, keep the door tidy." />

      <Card className="mb-8 gap-3 py-5">
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">Signed in as {who}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setWorkspaceId(null);
                window.location.reload();
              }}
            >
              New community
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>Workspace</Label>
            <Select
              value={workspace?.id}
              onValueChange={(id) => {
                setWorkspaceId(id);
                void load();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a community…" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {workspace ? (
            <p className="text-muted-foreground text-sm">
              Public front door:{" "}
              <Link href={`/c/${workspace.slug}`}>/c/{workspace.slug}</Link>
              {workspace.joinUrl ? (
                <>
                  {" "}
                  · join link points to{" "}
                  <a href={workspace.joinUrl} target="_blank" rel="noreferrer">
                    the chat
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="size-5" />
        <h2 className="text-lg font-semibold">Gatekeeper</h2>
      </div>
      <p className="text-muted-foreground mb-4 text-sm">
        Score a membership application before you let someone in. Confirmed blocklist entries are declined
        automatically.
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
              <Label htmlFor="answers">Their answers</Label>
              <Textarea
                id="answers"
                required
                rows={4}
                placeholder="Paste the application answers…"
                value={answers}
                onChange={(e) => setAnswers(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={scoring}>
              {scoring ? "Scoring…" : "Score application"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="mt-4 space-y-3">
        {apps.length === 0 ? (
          <Empty>No applications scored yet.</Empty>
        ) : (
          apps.map((a, i) => (
            <Card key={a.id ?? i} className="gap-2 py-4">
              <CardContent className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{a.applicant}</p>
                  <p className="text-muted-foreground text-sm">{a.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  {typeof a.score === "number" ? (
                    <span className="text-muted-foreground text-sm">{a.score}/100</span>
                  ) : null}
                  <DecisionBadge decision={a.decision} />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
