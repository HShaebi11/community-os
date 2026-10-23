"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { JourneyRail } from "@/components/desk/journey";
import { AppHeader } from "@/components/workspace/app-header";
import { WorkspaceContext } from "@/components/workspace/workspace-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import type { LeadRole, Me, Workspace } from "@/lib/types";
import { cn } from "@/lib/utils";

const LAST_WS = "cos_last_ws";

const NAV = [
  { path: "", label: "Briefing" },
  { path: "/import", label: "Import" },
  { path: "/people", label: "People" },
  { path: "/demand", label: "Demand" },
  { path: "/proposals", label: "Proposals" },
  { path: "/events", label: "Events" },
  { path: "/search", label: "Search" },
  { path: "/settings", label: "Settings" },
];

export function setLastWorkspace(slug: string) {
  localStorage.setItem(LAST_WS, slug);
}

export function getLastWorkspace(): string | null {
  return localStorage.getItem(LAST_WS);
}

export function WorkspaceShell({ slug, children }: { slug: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [workspace, setWorkspace] = useState<(Workspace & { role: LeadRole }) | null | "loading">("loading");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const load = useCallback(async () => {
    try {
      const [who, entry, list] = await Promise.all([
        api<Me>("/v1/me"),
        api<Workspace & { role: LeadRole }>(`/v1/workspaces/by-slug/${slug}`),
        api<Workspace[]>(`/v1/workspaces`).catch(() => []),
      ]);
      setMe(who);
      setWorkspace(entry);
      setWorkspaces(list);
      setLastWorkspace(slug);
    } catch {
      setWorkspace(null);
    }
  }, [slug]);

  useEffect(() => {
    setWorkspace("loading");
    void load();
  }, [load]);

  if (workspace === "loading" || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppHeader me={me} />
        <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-24 text-center">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">No access</h1>
          <p className="text-muted-foreground mb-6 text-sm">
            This workspace doesn&apos;t exist, or your account isn&apos;t a member of it.
          </p>
          <Button asChild>
            <Link href="/desk" className="text-primary-foreground no-underline">
              back to my workspaces
            </Link>
          </Button>
        </main>
      </div>
    );
  }

  const base = `/w/${workspace.slug}`;
  const active = (path: string) => (path === "" ? pathname === base : pathname.startsWith(base + path));

  return (
    <WorkspaceContext.Provider value={{ workspace, role: workspace.role, me, refresh: load }}>
      <div className="flex min-h-screen flex-col">
        <AppHeader me={me}>
          <nav className="hidden items-center gap-0.5 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.path}
                href={base + item.path}
                className={cn(
                  "text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1.5 text-sm no-underline transition-colors",
                  active(item.path) && "bg-secondary text-foreground font-medium",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger className="border-border bg-card hover:border-input flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors">
              <span className="bg-primary size-1.5 rounded-full" aria-hidden />
              <span className="max-w-36 truncate">{workspace.name}</span>
              <ChevronsUpDown className="text-muted-foreground size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {workspaces.map((w) => (
                <DropdownMenuItem key={w.id} onSelect={() => router.push(`/w/${w.slug}`)}>
                  <span className={cn("truncate", w.id === workspace.id && "text-primary")}>{w.name}</span>
                  {w.role ? <span className="text-muted-foreground ml-auto font-mono text-xs">{w.role}</span> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/onboarding")}>+ New community</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </AppHeader>
        <nav className="border-border flex gap-0.5 overflow-x-auto border-b px-5 py-1.5 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.path}
              href={base + item.path}
              className={cn(
                "text-muted-foreground rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap no-underline",
                active(item.path) && "bg-secondary text-foreground font-medium",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
          <JourneyRail workspaceId={workspace.id} slug={workspace.slug} />
          {children}
        </main>
      </div>
    </WorkspaceContext.Provider>
  );
}
