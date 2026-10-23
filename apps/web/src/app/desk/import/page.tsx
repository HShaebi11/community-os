"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileUp, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/desk/page-header";
import { api, apiBinary, getWorkspaceId } from "@/lib/api";
import { cn } from "@/lib/utils";

type ImportResult = {
  inserted: number;
  skipped: number;
  members: unknown[];
};

type MemoryResult = {
  members: unknown[];
  demands: unknown[];
  resources: unknown[];
};

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "importing" | "memorising" | "done">("idle");
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [memory, setMemory] = useState<MemoryResult | null>(null);

  async function run(chosen?: File) {
    const id = getWorkspaceId();
    const f = chosen ?? file;
    if (!id || !f) {
      toast.error("Choose a WhatsApp export first.");
      return;
    }
    setPhase("importing");
    setMemory(null);
    try {
      const buf = await f.arrayBuffer();
      const data = await apiBinary<ImportResult>(
        `/v1/workspaces/${id}/imports?filename=${encodeURIComponent(f.name)}`,
        buf,
        f.type || "application/octet-stream",
      );
      setImported(data);
      setPhase("memorising");
      const mem = await api<MemoryResult>(`/v1/workspaces/${id}/memory`, { method: "POST" });
      setMemory(mem);
      setPhase("done");
      toast.success("Import complete — memory refreshed.");
    } catch (err) {
      setPhase("idle");
      toast.error(err instanceof Error ? err.message : "import failed");
    }
  }

  return (
    <section>
      <PageHeader
        kicker="Step 1 · Evidence"
        title="Import the chat"
        lede="Upload a WhatsApp export (.zip or .txt). We store every message as evidence — re-importing is safe and idempotent — then rebuild member memory on top."
      />

      <Card
        className={cn(
          "gap-2 border-dashed py-10 text-center transition-colors",
          dragging && "border-primary bg-secondary/50",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0] ?? null;
          if (f) {
            setFile(f);
            void run(f);
          }
        }}
      >
        <CardContent className="space-y-4">
          <FileUp className="text-muted-foreground mx-auto size-8" />
          <div>
            <p className="font-semibold">Drop the export here</p>
            <p className="text-muted-foreground text-sm">
              WhatsApp → chat → More → Export chat → with or without media
            </p>
          </div>
          <div className="mx-auto max-w-xs">
            <Label htmlFor="file" className="sr-only">
              Export file
            </Label>
            <Input
              id="file"
              type="file"
              accept=".zip,.txt"
              disabled={phase === "importing" || phase === "memorising"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button
            onClick={() => void run()}
            disabled={!file || phase === "importing" || phase === "memorising"}
          >
            {phase === "importing" ? "Importing…" : phase === "memorising" ? "Remembering…" : "Import & remember"}
          </Button>
        </CardContent>
      </Card>

      {imported ? (
        <Card className="mt-6 gap-2 py-5">
          <CardContent className="space-y-4">
            <p className="font-semibold">
              {phase === "memorising" ? (
                <span className="inline-flex items-center gap-2">
                  <RefreshCw className="size-4 animate-spin" /> Building memory…
                </span>
              ) : (
                "Evidence saved."
              )}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="New messages" value={imported.inserted} />
              <Stat label="Duplicates skipped" value={imported.skipped} />
              <Stat label="People seen" value={imported.members.length} />
              <Stat label="Demand found" value={memory?.demands.length ?? 0} />
            </div>
            {memory ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild>
                  <Link href="/desk/people" className="text-primary-foreground no-underline">
                    Meet the people <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/desk" className="text-foreground no-underline">
                    Back to briefing
                  </Link>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="text-muted-foreground mt-6 space-y-1 text-sm">
        <p>· Members stay phone numbers until memory turns them into cards.</p>
        <p>· Nothing is sent back into the chat — this product drafts, the lead sends.</p>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-background rounded-md border p-3 text-left">
      <span className="text-muted-foreground text-xs">{label}</span>
      <b className="block text-xl tracking-tight">{value}</b>
    </div>
  );
}
