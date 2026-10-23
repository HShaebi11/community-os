"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { Kicker } from "@/components/kicker";
import { api, getToken, getWorkspaceId, setToken, setWorkspaceId } from "@/lib/api";
import type { Workspace } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/desk", label: "Briefing" },
  { href: "/desk/import", label: "Import" },
  { href: "/desk/people", label: "People" },
  { href: "/desk/demand", label: "Demand" },
  { href: "/desk/proposals", label: "Proposals" },
  { href: "/desk/events", label: "Events" },
  { href: "/desk/search", label: "Search" },
  { href: "/desk/settings", label: "Settings" },
];

export function DeskShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);
  const [workspaceId, setWs] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [email, setEmail] = useState("lead@example.com");
  const [name, setName] = useState("Weird Stuff");
  const [joinUrl, setJoinUrl] = useState("");

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
      await api("/v1/me");
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
      if (id) {
        const ws = await api<Workspace>(`/v1/workspaces/${id}`);
        setWorkspace(ws);
      } else {
        setWorkspace(null);
      }
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

  async function signIn() {
    try {
      const data = await api<{ token: string }>("/v1/auth/dev", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setToken(data.token);
      setTokenState(data.token);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "sign in failed");
    }
  }

  async function createWorkspace() {
    try {
      const data = await api<Workspace>("/v1/workspaces", {
        method: "POST",
        body: JSON.stringify({ name, joinUrl }),
      });
      setWorkspaceId(data.id);
      setWs(data.id);
      router.push("/desk/import");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "create failed");
    }
  }

  async function pickWorkspace(id: string) {
    setWorkspaceId(id);
    setWs(id);
    await load();
  }

  const showSetup = Boolean(token && !workspaceId && pathname !== "/desk/settings");

  return (
    <div className="grid min-h-screen md:grid-cols-[13.5rem_1fr]">
      <aside className="flex flex-col gap-1 border-b p-4 md:border-r md:border-b-0 md:p-5">
        <Link href="/" className="text-foreground mb-3 font-bold no-underline">
          Community OS
        </Link>
        <p className="text-muted-foreground mb-3 text-sm break-words">{workspace?.name ?? "No workspace"}</p>
        {NAV.map((item) => {
          const active = item.href === "/desk" ? pathname === "/desk" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-foreground block rounded-sm px-2 py-1.5 no-underline",
                active && "border-primary border-l-2 font-bold",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </aside>
      <main className="max-w-3xl px-6 py-6">
        {!ready ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !token ? (
          <section>
            <Kicker>Lead</Kicker>
            <h1 className="mb-2 text-3xl tracking-tight">Sign in to the desk</h1>
            <p className="text-muted-foreground mb-4">
              Same API a Cursor agent uses. Sign in, import a WhatsApp export, then run the community from memory.
            </p>
            <Card className="max-w-md gap-3 py-4">
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <Button onClick={() => void signIn()}>Sign in</Button>
              </CardContent>
            </Card>
          </section>
        ) : showSetup ? (
          <section>
            <Kicker>Workspace</Kicker>
            <h1 className="mb-2 text-3xl tracking-tight">Name the community</h1>
            <p className="text-muted-foreground mb-4">One community, one habitat, one lead.</p>
            <Card className="max-w-lg gap-3 py-4">
              <CardContent className="space-y-3">
                {workspaces.length > 0 && (
                  <div>
                    <Label>Existing</Label>
                    <Select onValueChange={(id) => void pickWorkspace(id)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="— start new —" />
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
                )}
                <div>
                  <Label htmlFor="name">Community name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="join">Join link (their WhatsApp / Discord)</Label>
                  <Input
                    id="join"
                    placeholder="https://chat.whatsapp.com/..."
                    value={joinUrl}
                    onChange={(e) => setJoinUrl(e.target.value)}
                  />
                </div>
                <Button onClick={() => void createWorkspace()}>Create workspace</Button>
              </CardContent>
            </Card>
          </section>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
