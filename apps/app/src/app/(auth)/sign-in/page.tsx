"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { DevOutbox } from "@/components/auth/dev-outbox";
import { api, safeNext } from "@/lib/api";
import type { Providers } from "@/lib/types";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next")) ?? "/desk";
  const [providers, setProviders] = useState<Providers | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"magic" | "password" | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api<Providers>("/v1/auth/providers")
      .then(setProviders)
      .catch(() => {});
    authClient.getSession().then(({ data }) => {
      if (data?.session) router.replace(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy("magic");
    try {
      const { error } = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: next });
      if (error) throw new Error(error.message ?? "failed");
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  async function passwordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy("password");
    try {
      const { error } = await authClient.signIn.email({ email: email.trim(), password });
      if (error) throw new Error(error.message ?? "invalid credentials");
      router.push(next);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "sign in failed");
    } finally {
      setBusy(null);
    }
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm gap-4 py-6">
        <CardHeader>
          <h1 className="font-semibold">Check your email</h1>
          <p className="text-muted-foreground text-sm">
            A sign-in link is on its way to <span className="font-mono">{email}</span>.
          </p>
        </CardHeader>
        <CardContent>
          <DevOutbox email={email} kind="magic-link" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm gap-4 py-6">
      <CardHeader>
        <h1 className="font-semibold">Sign in</h1>
        <p className="text-muted-foreground text-sm">Back to the console.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {providers?.google ? (
          <>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: next })}
            >
              Continue with Google
            </Button>
            <div className="border-border relative border-t">
              <span className="bg-card text-muted-foreground absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 font-mono text-[0.6rem] tracking-wider uppercase">
                or
              </span>
            </div>
          </>
        ) : null}

        <form onSubmit={(e) => void magicLink(e)} className="space-y-3">
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
          <Button type="submit" variant="outline" className="w-full" disabled={busy !== null}>
            {busy === "magic" ? "sending…" : "send a magic link"}
          </Button>
        </form>

        <div className="border-border relative border-t">
          <span className="bg-card text-muted-foreground absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 font-mono text-[0.6rem] tracking-wider uppercase">
            password
          </span>
        </div>

        <form onSubmit={(e) => void passwordSignIn(e)} className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-muted-foreground text-xs">
                forgot?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy !== null}>
            {busy === "password" ? "signing in…" : "sign in"}
          </Button>
        </form>

        <p className="text-muted-foreground text-center text-sm">
          No account? <Link href="/sign-up">Sign up</Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
