"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Briefing, CommunityEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

export type JourneyStep = {
  key: string;
  label: string;
  href: string;
  done: boolean;
};

export type Journey = {
  steps: JourneyStep[];
  next: JourneyStep | null;
  loading: boolean;
};

export function useJourney(workspaceId: string | null, slug: string): Journey {
  const [steps, setSteps] = useState<JourneyStep[] | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setSteps(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [brief, members, proposals, events] = await Promise.all([
          api<Briefing>(`/v1/workspaces/${workspaceId}/briefing`),
          api<Array<{ id: string; do: string | null; want: string | null; offer: string | null }>>(
            `/v1/workspaces/${workspaceId}/members`,
          ),
          api<Array<{ id: string }>>(`/v1/workspaces/${workspaceId}/proposals`),
          api<CommunityEvent[]>(`/v1/workspaces/${workspaceId}/events`),
        ]);
        const guestLists = await Promise.all(
          events.map((e) => api<unknown[]>(`/v1/events/${e.id}/guests`).catch(() => [])),
        );
        const guests = guestLists.reduce((n, g) => n + g.length, 0);
        const remembered =
          members.some((m) => m.do || m.want || m.offer) ||
          (brief.topDemands ?? []).length > 0 ||
          (brief.resources ?? []).length > 0;
        if (cancelled) return;
        setSteps([
          { key: "import", label: "Import", href: `/w/${slug}/import`, done: brief.messages > 0 },
          { key: "memory", label: "Remember", href: `/w/${slug}/people`, done: remembered },
          { key: "propose", label: "Propose", href: `/w/${slug}/demand`, done: proposals.length > 0 },
          { key: "live", label: "Go live", href: `/w/${slug}/proposals`, done: events.length > 0 },
          { key: "guests", label: "Fill the room", href: `/w/${slug}/events`, done: guests > 0 },
        ]);
      } catch {
        if (!cancelled) setSteps(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, slug]);

  const next = steps?.find((s) => !s.done) ?? null;
  return { steps: steps ?? [], next, loading: steps === null };
}

export function JourneyRail({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const { steps, next } = useJourney(workspaceId, slug);
  if (steps.length === 0) return null;
  return (
    <nav
      aria-label="Community journey"
      className="border-border bg-card/60 mb-8 flex flex-wrap items-center gap-x-1 gap-y-2 rounded-lg border px-4 py-2.5"
    >
      <span className="text-muted-foreground mr-2 font-mono text-[0.65rem] tracking-wider uppercase">Loop</span>
      {steps.map((step, i) => {
        const current = next?.key === step.key;
        return (
          <span key={step.key} className="flex items-center">
            {i > 0 ? <span className="text-border mx-1.5" aria-hidden>/</span> : null}
            <Link
              href={step.href}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs tracking-wide no-underline transition-colors",
                step.done ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/60",
                current && "bg-secondary text-primary font-semibold",
              )}
              aria-current={current ? "step" : undefined}
            >
              {step.done ? <Check className="size-3 text-[var(--ok)]" /> : null}
              {step.label}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
