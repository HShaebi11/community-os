"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { api, apiBinary } from "@/lib/api";
import { ImportDropzone } from "@/components/import-dropzone";
import type { Demand, MemberCard, Workspace } from "@/lib/types";

const STEPS = ["community", "import", "memory", "done"] as const;
type Step = (typeof STEPS)[number];

type MemoryResult = {
  members: MemberCard[];
  demands: Demand[];
  resources: Array<{ url: string; title?: string | null }>;
};

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "your-community"
  );
}

function Onboarding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step") as Step | null;
  const step: Step = STEPS.includes(stepParam as Step) ? (stepParam as Step) : "community";
  const wsParam = searchParams.get("ws");

  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [name, setName] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [memorising, setMemorising] = useState(false);
  const [memory, setMemory] = useState<MemoryResult | null>(null);
  const [imported, setImported] = useState(false);

  function go(next: Step, slug?: string) {
    const q = new URLSearchParams({ step: next });
    const s = slug ?? ws?.slug ?? wsParam;
    if (s) q.set("ws", s);
    router.replace(`/onboarding?${q.toString()}`);
  }

  useEffect(() => {
    (async () => {
      try {
        const list = await api<Workspace[]>("/v1/workspaces");
        setWorkspaces(list);
        const found = wsParam ? list.find((w) => w.slug === wsParam) : undefined;
        if (found) setWs(found);
      } catch {
        // unauthenticated: the proxy redirect handles this
      }
    })();
  }, [wsParam]);

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const created = await api<Workspace>("/v1/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), joinUrl: joinUrl.trim() || undefined }),
      });
      setWs(created);
      go("import", created.slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function buildMemory() {
    if (!ws) return;
    setMemorising(true);
    try {
      setMemory(await api<MemoryResult>(`/v1/workspaces/${ws.id}/memory`, { method: "POST" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "memory failed");
      setMemory({ members: [], demands: [], resources: [] });
    } finally {
      setMemorising(false);
    }
  }

  async function loadSample() {
    if (!ws) return;
    try {
      const res = await fetch("/sample/_chat.txt");
      if (!res.ok) throw new Error("Couldn't load the sample chat.");
      const buf = await res.arrayBuffer();
      await apiBinary(`/v1/workspaces/${ws.id}/imports?filename=${encodeURIComponent("_chat.txt")}`, buf, "text/plain");
      setImported(true);
      toast.success("Sample imported — building memory.");
      go("memory");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "import failed");
    }
  }

  useEffect(() => {
    if (step === "memory" && ws && memory === null && !memorising) void buildMemory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ws?.id]);

  const idx = STEPS.indexOf(step);
  const topMembers = useMemo(() => (memory?.members ?? []).slice(0, 3), [memory]);
  const topDemands = useMemo(() => (memory?.demands ?? []).slice(0, 2), [memory]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <nav className="mb-8 flex flex-wrap items-center gap-x-1 gap-y-2 font-mono text-xs">
        {STEPS.map((s, i) => (
          <span key={s} className="flex items-center">
            {i > 0 ? <span className="text-border mx-1.5">/</span> : null}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1",
                i < idx && "text-[var(--ok)]",
                i === idx && "bg-secondary text-primary font-semibold",
                i > idx && "text-muted-foreground/60",
              )}
            >
              {i < idx ? <Check className="size-3" /> : null}
              {s}
            </span>
          </span>
        ))}
      </nav>

      {step === "community" ? (
        <Card className="gap-4 py-6">
          <CardContent>
            <h1 className="mb-1 font-semibold">Name your community</h1>
            <p className="text-muted-foreground mb-5 text-sm">One workspace per chat. You can add more later.</p>
            {workspaces && workspaces.length > 0 ? (
              <p className="mb-4 text-sm">
                You already have workspaces —{" "}
                <Link href="/desk" className="text-primary">
                  skip to my workspaces
                </Link>
                .
              </p>
            ) : null}
            <form onSubmit={(e) => void createWorkspace(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Community name</Label>
                <Input
                  id="name"
                  required
                  placeholder="Hackers in Residence"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {name.trim() ? (
                  <p className="text-muted-foreground font-mono text-xs">/w/{slugify(name)}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="join">
                  Chat join link <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="join"
                  type="url"
                  placeholder="https://chat.whatsapp.com/…"
                  value={joinUrl}
                  onChange={(e) => setJoinUrl(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "creating…" : "continue"} <ChevronRight className="size-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {!ws && step !== "community" ? (
        <Card className="gap-3 py-6">
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              {workspaces === null ? "Loading…" : "Create your community first."}
            </p>
            {workspaces !== null ? (
              <Button variant="outline" size="sm" onClick={() => go("community")}>
                <ChevronLeft className="size-4" /> back to step one
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {step === "import" && ws ? (
        <div className="space-y-5">
          <div>
            <h1 className="font-semibold">Drop the chat export</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              WhatsApp export (.txt or .zip). Private by default — nothing sends anywhere.
            </p>
          </div>
          <ImportDropzone
            workspaceId={ws.id}
            onImported={() => {
              setImported(true);
              go("memory");
            }}
          />
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => go("community")}>
              <ChevronLeft className="size-4" /> back
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => go("memory")}>
                skip
              </Button>
              <Button variant="outline" size="sm" onClick={() => void loadSample()}>
                <Download className="size-4" /> use sample chat
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "memory" && ws ? (
        <div className="space-y-5">
          <div>
            <h1 className="font-semibold">Your briefing</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {memorising
                ? "Reading the chat and building memory…"
                : `What memory extracted from ${ws.name}'s chat.`}
            </p>
          </div>
          {memorising ? (
            <Card className="gap-2 py-10">
              <CardContent className="text-muted-foreground text-center text-sm">
                Extracting people and demands…
              </CardContent>
            </Card>
          ) : memory ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="people" value={memory.members.length} />
                <Stat label="demands" value={memory.demands.length} />
                <Stat label="resources" value={memory.resources.length} />
              </div>
              {topMembers.length === 0 && topDemands.length === 0 ? (
                <Card className="gap-2 py-6">
                  <CardContent className="text-muted-foreground text-sm">
                    {imported
                      ? "Nothing extracted yet — the chat may be too small."
                      : "No import yet — skip ahead and import from the console later."}
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {topMembers.map((m) => (
                      <Card key={m.id} className="gap-1 py-4">
                        <CardContent>
                          <p className="text-sm font-medium">{m.displayName}</p>
                          <p className="text-muted-foreground text-xs">{m.do || m.offer || "—"}</p>
                          {m.citations?.[0]?.quote ? (
                            <p className="text-muted-foreground/70 mt-1 text-[0.7rem] italic">
                              “{m.citations[0].quote.slice(0, 90)}”
                            </p>
                          ) : null}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {topDemands.map((d) => (
                    <Card key={d.id} className="gap-1 py-4">
                      <CardContent className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm">{d.title || d.topic}</p>
                        <Link
                          href={`/w/${ws.slug}/demand`}
                          className="text-primary flex shrink-0 items-center gap-1 font-mono text-xs"
                        >
                          propose an event <ChevronRight className="size-3" />
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </>
          ) : null}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => go("import")}>
              <ChevronLeft className="size-4" /> back
            </Button>
            <Button size="sm" onClick={() => go("done")} disabled={memorising}>
              next: finish <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" && ws ? (
        <div className="space-y-5">
          <h1 className="font-semibold">You're set.</h1>
          <Card className="gap-2 py-5">
            <CardContent className="space-y-2">
              <CheckItem done>workspace created — {ws.name}</CheckItem>
              <CheckItem done={imported || (memory?.members.length ?? 0) > 0}>chat imported</CheckItem>
              <CheckItem done={(memory?.demands.length ?? 0) > 0}>demand extracted</CheckItem>
            </CardContent>
          </Card>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => go("memory")}>
              <ChevronLeft className="size-4" /> back
            </Button>
            <Button asChild>
              <Link href={`/w/${ws.slug}`} className="text-primary-foreground no-underline">
                open {ws.name}
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="text-center">
        <p className="font-mono text-2xl">{value}</p>
        <p className="text-muted-foreground font-mono text-[0.6rem] tracking-wider uppercase">{label}</p>
      </CardContent>
    </Card>
  );
}

function CheckItem({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm">
      <Check className={cn("size-4", done ? "text-[var(--ok)]" : "text-muted-foreground/40")} />
      <span className={done ? "" : "text-muted-foreground"}>{children}</span>
    </p>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}
