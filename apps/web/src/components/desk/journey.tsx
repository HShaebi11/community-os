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

export function useJourney(workspaceId: string | null): Journey {
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
          { key: "import", label: "Import", href: "/desk/import", done: brief.messages > 0 },
          { key: "memory", label: "Remember", href: "/desk/people", done: remembered },
          { key: "propose", label: "Propose", href: "/desk/demand", done: proposals.length > 0 },
          { key: "live", label: "Go live", href: "/desk/proposals", done: events.length > 0 },
          { key: "guests", label: "Fill the room", href: "/desk/events", done: guests > 0 },
        ]);
      } catch {
        if (!cancelled) setSteps(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const next = steps?.find((s) => !s.done) ?? null;
  return { steps: steps ?? [], next, loading: steps === null };
}

export function JourneyRail({ workspaceId }: { workspaceId: string }) {
  const { steps, next } = useJourney(workspaceId);
  if (steps.length === 0) return null;
  return (
    <nav aria-label="Community journey" className="border-border mb-8 rounded-md border bg-card px-4 py-3">
      <ol className="flex flex-wrap items-center gap-y-2">
        {steps.map((step, i) => {
          const current = next?.key === step.key;
          return (
            <li key={step.key} className="flex items-center">
              {i > 0 ? <span className="bg-border mx-2 h-px w-4 sm:w-6" aria-hidden /> : null}
              <Link
                href={step.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-sm no-underline",
                  step.done ? "text-foreground" : "text-muted-foreground",
                  current && "font-bold text-foreground",
                )}
                aria-current={current ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-[0.65rem]",
                    step.done
                      ? "border-[var(--ok)] bg-[var(--ok)] text-[var(--primary-foreground)]"
                      : current
                        ? "border-primary text-primary"
                        : "border-border",
                  )}
                >
                  {step.done ? <Check className="size-3" /> : i + 1}
                </span>
                {step.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
