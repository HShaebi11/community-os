"use client";

import { useRouter } from "next/navigation";
import { PartyPopper } from "lucide-react";
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
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch(`/v1/public/events/${slug}/rsvp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || res.statusText);
      router.push(`/e/${slug}?rsvp=1`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "rsvp failed");
      setSending(false);
    }
  }

  return (
    <Card className="gap-3 border-primary/40 py-6">
      <CardContent>
        {ok ? (
          <p className="mb-4 flex items-center gap-2 font-semibold">
            <PartyPopper className="size-5 text-[var(--ok)]" /> You&apos;re on the list. See you there.
          </p>
        ) : null}
        <form className="space-y-4" onSubmit={(e) => void submit(e)}>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">RSVP</h2>
            <p className="text-muted-foreground text-sm">Native guest list — straight to the lead&apos;s desk.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <Button type="submit" disabled={sending}>
            {sending ? "Adding you…" : "I'm coming"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
