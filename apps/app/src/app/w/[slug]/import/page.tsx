"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImportDropzone, type ImportResult } from "@/components/import-dropzone";
import { PageHeader } from "@/components/desk/page-header";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { api } from "@/lib/api";

type MemoryResult = { members: unknown[]; demands: unknown[]; resources: unknown[] };

export default function ImportPage() {
  const { workspace } = useWorkspace();
  const [phase, setPhase] = useState<"idle" | "memorising" | "done">("idle");
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [memory, setMemory] = useState<MemoryResult | null>(null);

  async function onImported(data: ImportResult) {
    setImported(data);
    setMemory(null);
    setPhase("memorising");
    try {
      const mem = await api<MemoryResult>(`/v1/workspaces/${workspace.id}/memory`, { method: "POST" });
      setMemory(mem);
      setPhase("done");
      toast.success("Imported and remembered.");
    } catch (err) {
      setPhase("idle");
      toast.error(err instanceof Error ? err.message : "memory failed");
    }
  }

  return (
    <section className="max-w-2xl">
      <PageHeader
        kicker="ingest"
        title="Import the chat"
        lede="WhatsApp export (.zip / .txt). Evidence is append-only and idempotent — re-importing is safe. Memory rebuilds on top."
      />
      <ImportDropzone workspaceId={workspace.id} onImported={onImported} disabled={phase === "memorising"} />

      {imported ? (
        <Card className="mt-5 gap-3 py-5">
          <CardContent className="space-y-4">
            <p className="font-mono text-xs tracking-wider text-[var(--ok)] uppercase">
              {phase === "memorising" ? "building memory…" : "evidence saved"}
            </p>
            <div className="grid grid-cols-4 gap-2">
              <Stat label="new" value={imported.inserted} />
              <Stat label="dupes" value={imported.skipped} />
              <Stat label="people" value={imported.members.length} />
              <Stat label="demands" value={memory?.demands.length ?? 0} />
            </div>
            {memory ? (
              <Button size="sm" asChild>
                <Link href={`/w/${workspace.slug}/people`} className="text-primary-foreground no-underline">
                  Meet the people <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-background rounded-md border p-3 text-left">
      <span className="text-muted-foreground font-mono text-[0.6rem] tracking-wider uppercase">{label}</span>
      <b className="block text-lg font-semibold">{value}</b>
    </div>
  );
}
