"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { DevOutbox } from "@/components/auth/dev-outbox";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: "/reset-password",
      });
      if (error) throw new Error(error.message ?? "failed");
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm gap-4 py-6">
      <CardHeader>
        <h1 className="font-semibold">Reset your password</h1>
        <p className="text-muted-foreground text-sm">
          {sent ? (
            <>A reset link is on its way to <span className="font-mono">{email}</span>.</>
          ) : (
            "Enter your email and we'll send a reset link."
          )}
        </p>
      </CardHeader>
      {!sent ? (
        <CardContent>
          <form onSubmit={(e) => void send(e)} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "sending…" : "send reset link"}
            </Button>
          </form>
          <p className="text-muted-foreground mt-4 text-center text-sm">
            <Link href="/sign-in">Back to sign in</Link>
          </p>
        </CardContent>
      ) : (
        <CardContent className="space-y-4">
          <DevOutbox email={email} kind="reset-password" />
          <Link href="/sign-in" className="block text-sm">
            Back to sign in
          </Link>
        </CardContent>
      )}
    </Card>
  );
}
