"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  Download,
  Flame,
  Inbox,
  ListChecks,
  LogOut,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { JourneyRail } from "@/components/desk/journey";
import { Kicker } from "@/components/kicker";
import { api, getToken, getWorkspaceId, setToken, setWorkspaceId } from "@/lib/api";
import type { Workspace } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/desk", label: "Briefing", icon: Inbox },
  { href: "/desk/import", label: "Import", icon: Download },
  { href: "/desk/people", label: "People", icon: Users },
  { href: "/desk/demand", label: "Demand", icon: Flame },
  { href: "/desk/proposals", label: "Proposals", icon: ListChecks },
  { href: "/desk/events", label: "Events", icon: CalendarDays },
  { href: "/desk/search", label: "Search", icon: Search },
  { href: "/desk/settings", label: "Settings", icon: Settings },
];

export function DeskShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);
  const [workspaceId, setWs] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [who, setWho] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const t = getToken();
    setTokenState(t);
    if (!t) {
      setReady(true);
      setWorkspace(null);
      setWorkspaces([]);
      return;
    }
    try {
      const me = await api<{ email: string }>("/v1/me");
      setWho(me.email);
      const list = await api<Workspace[]>("/v1/workspaces");
      setWorkspaces(list);
      let id = getWorkspaceId();
      if (id && !list.some((w) => w.id === id)) {
        id = null;
        setWorkspaceId(null);
      }
      if (!id && list[0]) {
        id = list[0].id;
        setWorkspaceId(id);
      }
      setWs(id);
      setWorkspace(id ? await api<Workspace>(`/v1/workspaces/${id}`) : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "error";
      toast.error(message);
      if (message.includes("unauthorized")) {
        setToken(null);
        setTokenState(null);
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const data = await api<{ token: string; email: string }>("/v1/auth/dev", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setToken(data.token);
      setTokenState(data.token);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const data = await api<Workspace>("/v1/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), joinUrl: joinUrl.trim() || null }),
      });
      setWorkspaceId(data.id);
      setWs(data.id);
      toast.success(`${data.name} is set up. Now import the chat.`);
      router.push("/desk/import");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "create failed");
    } finally {
      setBusy(false);
    }
  }

  async function pickWorkspace(id: string) {
    setWorkspaceId(id);
    setWs(id);
    router.push("/desk");
    await load();
  }

  function signOut() {
    setToken(null);
    setWorkspaceId(null);
    setTokenState(null);
    setWs(null);
    setWorkspace(null);
    setWorkspaces([]);
    setWho("");
  }

  const showSetup = Boolean(token && !workspaceId && pathname !== "/desk/settings");

  return (
    <div className="grid min-h-screen md:grid-cols-[14.5rem_1fr]">
      <aside className="border-border flex flex-col border-b bg-card md:border-r md:border-b-0">
        <div className="flex flex-1 flex-col gap-1 p-4 md:p-5">
          <Link href="/" className="text-foreground mb-4 block font-bold tracking-tight no-underline">
            Community OS
          </Link>
          {workspace ? (
            <div className="border-border mb-4 rounded-md border bg-background p-3">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">Workspace</p>
              <p className="font-semibold break-words">{workspace.name}</p>
              <Link href={`/c/${workspace.slug}`} className="mt-1 block text-xs">
                Front door /c/{workspace.slug}
              </Link>
            </div>
          ) : (
            <p className="text-muted-foreground mb-4 text-sm">The desk — where the lead runs the community.</p>
          )}
          {NAV.map((item) => {
            const active = item.href === "/desk" ? pathname === "/desk" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-muted-foreground flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm no-underline transition-colors",
                  "hover:bg-background hover:text-foreground",
                  active && "bg-background text-foreground border-primary border-l-2 font-semibold",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
        {token ? (
          <div className="border-border flex items-center justify-between gap-2 border-t p-4">
            <p className="text-muted-foreground truncate text-xs" title={who}>
              {who}
            </p>
            <Button variant="ghost" size="sm" onClick={signOut} title="Sign out">
              <LogOut className="size-4" />
            </Button>
          </div>
        ) : null}
      </aside>
      <main className="w-full max-w-4xl px-6 py-8">
        {!ready ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !token ? (
          <section className="mx-auto max-w-md pt-10">
            <Kicker>The desk</Kicker>
            <h1 className="mb-2 text-3xl tracking-tight">Run the room, not the scroll.</h1>
            <p className="text-muted-foreground mb-6">
              Sign in, import the chat, and the desk remembers the people, the demand, and the door.
            </p>
            <Card className="gap-3 py-5">
              <CardContent>
                <form onSubmit={(e) => void signIn(e)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Lead email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      placeholder="lead@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? "Signing in…" : "Sign in"}
                  </Button>
                  <p className="text-muted-foreground text-xs">
                    Local dev sign-in — same API the agents use.
                  </p>
                </form>
              </CardContent>
            </Card>
          </section>
        ) : showSetup ? (
          <section className="mx-auto max-w-lg pt-10">
            <Kicker>Step zero</Kicker>
            <h1 className="mb-2 text-3xl tracking-tight">Name the community.</h1>
            <p className="text-muted-foreground mb-6">One community, one habitat, one lead.</p>
            <Card className="gap-3 py-5">
              <CardContent>
                {workspaces.length > 0 ? (
                  <div className="mb-5 space-y-1.5">
                    <Label>Pick an existing workspace</Label>
                    <Select onValueChange={(id) => void pickWorkspace(id)}>
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
                ) : null}
                <form onSubmit={(e) => void createWorkspace(e)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Community name</Label>
                    <Input
                      id="name"
                      required
                      placeholder="Weird Stuff"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="join">Join link — where the chat actually lives</Label>
                    <Input
                      id="join"
                      type="url"
                      placeholder="https://chat.whatsapp.com/…"
                      value={joinUrl}
                      onChange={(e) => setJoinUrl(e.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? "Creating…" : "Create workspace"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </section>
        ) : (
          <>
            {workspaceId ? <JourneyRail workspaceId={workspaceId} /> : null}
            {children}
          </>
        )}
      </main>
    </div>
  );
}
