"use client";

import { FileUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiBinary } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ImportResult = { inserted: number; skipped: number; members: unknown[] };

export function ImportDropzone({
  workspaceId,
  onImported,
  disabled,
}: {
  workspaceId: string;
  onImported?: (result: ImportResult, filename: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);

  async function run(chosen?: File) {
    const f = chosen ?? file;
    if (!f) {
      toast.error("Choose a WhatsApp export first.");
      return;
    }
    setImporting(true);
    try {
      const buf = await f.arrayBuffer();
      const data = await apiBinary<ImportResult>(
        `/v1/workspaces/${workspaceId}/imports?filename=${encodeURIComponent(f.name)}`,
        buf,
        f.type || "application/octet-stream",
      );
      await onImported?.(data, f.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "import failed");
    } finally {
      setImporting(false);
    }
  }

  const busy = importing || disabled;

  return (
    <Card
      className={cn("gap-2 border-dashed py-10 text-center transition-colors", dragging && "border-primary/60")}
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
        <FileUp className="text-muted-foreground mx-auto size-7" />
        <p className="text-sm">
          <span className="font-medium">Drop the export</span>
          <span className="text-muted-foreground block text-xs">WhatsApp → chat → More → Export chat</span>
        </p>
        <div className="mx-auto max-w-xs">
          <Label htmlFor="chat-export" className="sr-only">
            Export file
          </Label>
          <Input
            id="chat-export"
            type="file"
            accept=".zip,.txt"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <Button size="sm" onClick={() => void run()} disabled={!file || busy}>
          {importing ? "importing…" : "import"}
        </Button>
      </CardContent>
    </Card>
  );
}
