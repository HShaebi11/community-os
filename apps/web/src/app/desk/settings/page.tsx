"use client";

import Link from "next/link";
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
import { Kicker } from "@/components/kicker";
import { api, getWorkspaceId, setWorkspaceId } from "@/lib/api";
import type { Application, CommunityEvent, Workspace } from "@/lib/types";

export default function SettingsPage() {
  const [who, setWho] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [name, setName] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [applicant, setApplicant] = useState("");
  const [answers, setAnswers] = useState("");
  const [autos, setAutos] = useState<Record<string, string>>({});

  async function load() {
    try {
      const me = await api<{ email: string }>("/v1/me");
      setWho(me.email);
      const list = await api<Workspace[]>("/v1/workspaces");
      setWorkspaces(list);
      const id = getWorkspaceId();
      if (!id) return;
      const ws = await api<Workspace>(`/v1/workspaces/${id}`);
      setWorkspace(ws);
      setName(ws.name);
      setJoinUrl(ws.joinUrl ?? "");
      setEvents(await api<CommunityEvent[]>(`/v1/workspaces/${id}/events`));
      setApps(await api<Application[]>(`/v1/workspaces/${id}/applications`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createAnother() {
    try {
      const data = await api<Workspace>("/v1/workspaces", {
        method: "POST",
        body: JSON.stringify({ name, joinUrl }),
      });
      setWorkspaceId(data.id);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function autopilot(id: string) {
    try {
      const arts = await api<Array<{ kind: string; body: string }>>(`/v1/events/${id}/autopilot`, { method: "POST" });
      setAutos((a) => ({ ...a, [id]: arts.map((x) => `${x.kind}\n${x.body}`).join("\n\n") }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function apply() {
    const id = getWorkspaceId();
    if (!id) return;
    try {
      await api(`/v1/workspaces/${id}/applications`, {
        method: "POST",
        body: JSON.stringify({ applicant, answers }),
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  return (
    <section>
      <Kicker>Workspace</Kicker>
      <h1 className="mb-4 text-3xl tracking-tight">Settings</h1>
      <Card className="mb-4 gap-2 py-4">
        <CardContent className="space-y-3">
          <p className="text-muted-foreground">{who}</p>
          <div>
            <Label>Workspace</Label>
            <Select
              value={workspace?.id}
              onValueChange={(id) => {
                setWorkspaceId(id);
                void load();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— pick —" />
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
            <p className="text-muted-foreground">
              {workspace.name} · <Link href={`/c/${workspace.slug}`}>/c/{workspace.slug}</Link>
            </p>
          ) : null}
          <div>
            <Label>Community name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Join link</Label>
            <Input
              placeholder="https://chat.whatsapp.com/..."
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
            />
          </div>
          <Button onClick={() => void createAnother()}>Create another workspace</Button>
        </CardContent>
      </Card>
      <Card className="gap-2 py-4">
        <CardContent className="space-y-4">
          <h2 className="font-semibold">Later (autopilot + gatekeeper)</h2>
          {events.length === 0 ? <p className="text-muted-foreground">Go live first.</p> : null}
          {events.map((e) => (
            <div key={e.id} className="space-y-2">
              <span className="text-muted-foreground">{e.title}</span>{" "}
              <Button variant="outline" onClick={() => void autopilot(e.id)}>
                Autopilot drafts
              </Button>
              {autos[e.id] ? (
                <pre className="text-muted-foreground overflow-x-auto text-sm whitespace-pre-wrap">{autos[e.id]}</pre>
              ) : null}
            </div>
          ))}
          <h2 className="font-semibold">Gatekeeper</h2>
          <div>
            <Label>Applicant</Label>
            <Input value={applicant} onChange={(e) => setApplicant(e.target.value)} />
          </div>
          <div>
            <Label>Answers</Label>
            <Textarea value={answers} onChange={(e) => setAnswers(e.target.value)} />
          </div>
          <Button onClick={() => void apply()}>Score application</Button>
          {apps.map((a) => (
            <Card key={`${a.applicant}-${a.reason}`} className="gap-2 py-3">
              <CardContent>
                {a.applicant} · {a.decision} · {a.reason}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
