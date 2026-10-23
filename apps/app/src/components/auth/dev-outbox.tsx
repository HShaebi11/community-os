"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Providers } from "@/lib/types";

type OutboxEntry = { kind: string; to: string; link: string; subject?: string };

export function DevOutbox({ email, kind }: { email: string; kind: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [entry, setEntry] = useState<OutboxEntry | null>(null);
  const [elapsed, setElapsed] = useState(false);
  const found = useRef(false);

  useEffect(() => {
    let stop = false;
    api<Providers>("/v1/auth/providers")
      .then((p) => setEnabled(p.devAuth && p.email === "log"))
      .catch(() => setEnabled(false));
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    const poll = async () => {
      try {
        const entries = await api<OutboxEntry[]>("/v1/dev/outbox");
        const hit = entries.find((e) => e.to === email && e.kind === kind);
        if (hit) {
          found.current = true;
          setEntry(hit);
          return;
        }
      } catch {
        // dev outbox may be unavailable; keep polling until timeout
      }
      if (++tries >= 30) {
        setElapsed(true);
        return;
      }
      timer = setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => clearTimeout(timer);
  }, [enabled, email, kind]);

  if (!enabled || elapsed) return null;

  return (
    <div className="bg-secondary/40 rounded-md border border-dashed p-3">
      <p className="text-muted-foreground mb-2 font-mono text-[0.6rem] tracking-wider uppercase">
        dev outbox
      </p>
      {entry ? (
        <Button size="sm" variant="outline" asChild className="w-full">
          <a href={entry.link} className="truncate font-mono text-xs no-underline">
            open {kind === "invite" ? "invite" : kind === "magic-link" ? "magic link" : "reset"} link
          </a>
        </Button>
      ) : (
        <p className="text-muted-foreground text-xs">waiting for the email…</p>
      )}
    </div>
  );
}
