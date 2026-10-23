"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RsvpForm({ slug, ok }: { slug: string; ok: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/v1/public/events/${slug}/rsvp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || res.statusText);
      router.push(`/e/${slug}?rsvp=1`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "rsvp failed");
    }
  }

  return (
    <Card className="gap-2 py-4">
      <CardContent>
        {ok ? <p className="mb-3">You&apos;re on the list. See you there.</p> : null}
        <form className="space-y-3" onSubmit={(e) => void submit(e)}>
          <h2 className="text-lg font-semibold">RSVP</h2>
          <p className="text-muted-foreground">Native guest list — not a third-party page.</p>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit">I&apos;m coming</Button>
        </form>
      </CardContent>
    </Card>
  );
}
