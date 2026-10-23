"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/desk/page-header";
import { AppHeader } from "@/components/workspace/app-header";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import type { Me, Providers } from "@/lib/types";

type Account = { providerId: string };

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [current, setCurrent] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const who = await api<Me>("/v1/me").catch(() => null);
      if (!who) {
        router.replace("/sign-in?next=/account");
        return;
      }
      setMe(who);
      setName(who.name ?? "");
      api<Providers>("/v1/auth/providers").then(setProviders).catch(() => {});
      const { data } = await authClient.listAccounts().catch(() => ({ data: null }));
      setAccounts(((data ?? []) as unknown as Account[]) ?? []);
    })();
  }, [router]);

  const hasCredential = accounts.some((a) => a.providerId === "credential");
  const hasGoogle = accounts.some((a) => a.providerId === "google");

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setBusy("name");
    try {
      const { error } = await authClient.updateUser({ name: name.trim() });
      if (error) throw new Error(error.message ?? "failed");
      toast.success("Name updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy("password");
    try {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: nextPassword,
        revokeOtherSessions: false,
      });
      if (error) throw new Error(error.message ?? "failed");
      setCurrent("");
      setNextPassword("");
      toast.success("Password changed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  if (!me) return <p className="text-muted-foreground px-4 py-10 text-sm">Loading…</p>;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader me={me} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
        <PageHeader kicker="you" title="Account" />

        <Card className="mb-6 gap-3 py-5">
          <CardContent>
            <form onSubmit={(e) => void saveName(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={me.email} disabled />
              </div>
              <Button type="submit" size="sm" disabled={busy === "name"}>
                {busy === "name" ? "saving…" : "save"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {hasCredential ? (
          <Card className="mb-6 gap-3 py-5">
            <CardContent>
              <h2 className="mb-3 text-sm font-semibold">Change password</h2>
              <form onSubmit={(e) => void changePassword(e)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="current">Current password</Label>
                  <Input
                    id="current"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nextpw">New password</Label>
                  <Input
                    id="nextpw"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={nextPassword}
                    onChange={(e) => setNextPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" size="sm" disabled={busy === "password"}>
                  {busy === "password" ? "updating…" : "update password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {providers?.google && !hasGoogle ? (
          <Card className="mb-6 gap-3 py-5">
            <CardContent className="flex items-center justify-between">
              <p className="text-sm">Link your Google account for one-click sign in.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void authClient.linkSocial({ provider: "google", callbackURL: "/account" })}
              >
                link google
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className="gap-3 py-5">
          <CardContent className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">Sign out of this browser.</p>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              sign out
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
