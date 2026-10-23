"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kicker } from "@/components/kicker";
import { api, apiBinary, getWorkspaceId } from "@/lib/api";

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");

  async function upload() {
    const id = getWorkspaceId();
    if (!id) return;
    if (!file) {
      toast.error("Choose a zip or txt export first.");
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const data = await apiBinary<{ inserted: number; skipped: number; members: unknown[] }>(
        `/v1/workspaces/${id}/imports?filename=${encodeURIComponent(file.name)}`,
        buf,
        file.type || "application/octet-stream",
      );
      setStatus(`Inserted ${data.inserted}, skipped ${data.skipped}, members ${data.members.length}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "import failed");
    }
  }

  async function memory() {
    const id = getWorkspaceId();
    if (!id) return;
    try {
      await api(`/v1/workspaces/${id}/memory`, { method: "POST" });
      router.push("/desk");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "memory failed");
    }
  }

  return (
    <section>
      <Kicker>Evidence</Kicker>
      <h1 className="mb-2 text-3xl tracking-tight">Import</h1>
      <p className="text-muted-foreground mb-4">
        Upload a WhatsApp zip or txt. Then refresh memory so people and demand appear.
      </p>
      <div className="bg-card space-y-3 rounded-md border border-dashed p-6 text-center">
        <Input type="file" accept=".zip,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <p className="text-muted-foreground text-sm">Accepted: .zip, .txt</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => void upload()}>Upload export</Button>
          <Button variant="outline" onClick={() => void memory()}>
            Refresh memory
          </Button>
        </div>
        {status ? <p className="text-muted-foreground text-sm">{status}</p> : null}
      </div>
    </section>
  );
}
