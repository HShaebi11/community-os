"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import type { Workspace } from "@/lib/types";

type Invitation = {
  id: string;
  email: string;
  role?: string | null;
  status: string;
  organizationName: string;
  inviterEmail?: string;
};

export default function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [inv, setInv] = useState<Invitation | null>(null);
  const [meEmail, setMeEmail] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "signed-out" | "error">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const session = await authClient.getSession();
      if (!session.data) {
        setState("signed-out");
        return;
      }
      setMeEmail(session.data.user.email);
      const { data, error } = await authClient.organization.getInvitation({ query: { id } });
      if (error || !data) {
        setState("error");
        return;
      }
      setInv(data as unknown as Invitation);
    })();
  }, [id]);

  async function signOutToOther() {
    await authClient.signOut();
    router.push(`/sign-in?next=${encodeURIComponent(`/invite/${id}`)}`);
    router.refresh();
  }

  async function respond(accept: boolean) {
    setBusy(true);
    try {
      const { data, error } = accept
        ? await authClient.organization.acceptInvitation({ invitationId: id })
        : await authClient.organization.rejectInvitation({ invitationId: id });
      if (error) throw new Error(error.message ?? "failed");
      if (accept) {
        const orgId =
          (data as { invitation?: { organizationId?: string }; member?: { organizationId?: string } } | null)
            ?.member?.organizationId ??
          (data as { invitation?: { organizationId?: string } } | null)?.invitation?.organizationId;
        let slug: string | undefined;
        if (orgId) {
          try {
            const workspaces = await api<Workspace[]>("/v1/workspaces");
            slug = workspaces.find((w) => w.id === orgId)?.slug;
          } catch {
            // fall through to /desk
          }
        }
        if (slug) {
          localStorage.setItem("cos_last_ws", slug);
          router.push(`/w/${slug}`);
        } else {
          router.push("/desk");
        }
      } else {
        toast.success("Invitation declined.");
        router.push("/desk");
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
      setBusy(false);
    }
  }

  let body: React.ReactNode;
  if (state === "signed-out") {
    const next = encodeURIComponent(`/invite/${id}`);
    body = (
      <>
        <h1 className="font-semibold">You're invited</h1>
        <p className="text-muted-foreground text-sm">Sign in or create an account to respond.</p>
        <div className="flex gap-2">
          <Button asChild className="flex-1">
            <Link href={`/sign-in?next=${next}`}>Sign in</Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/sign-up?next=${next}`}>Sign up</Link>
          </Button>
        </div>
      </>
    );
  } else if (state === "error") {
    body = (
      <>
        <h1 className="font-semibold">Can't open this invite</h1>
        {meEmail ? (
          <p className="text-muted-foreground font-mono text-xs">signed in as {meEmail}</p>
        ) : null}
        <p className="text-muted-foreground text-sm">
          This invite is for a different email, has expired, or was already used.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="outline" onClick={() => void signOutToOther()} disabled={busy}>
            Sign out and use another account
          </Button>
          <Button variant="ghost" onClick={() => router.push("/desk")}>
            Go to my workspaces
          </Button>
        </div>
      </>
    );
  } else if (!inv) {
    body = <p className="text-muted-foreground text-sm">Loading…</p>;
  } else {
    body = (
      <>
        <h1 className="font-semibold">Join {inv.organizationName}</h1>
        <p className="text-muted-foreground text-sm">
          {inv.inviterEmail ? `${inv.inviterEmail} invited you` : "You've been invited"} as{" "}
          <span className="font-mono">{inv.role ?? "member"}</span>.
        </p>
        {meEmail ? (
          <p className="text-muted-foreground font-mono text-xs">signed in as {meEmail}</p>
        ) : null}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => void respond(true)}>
            {busy ? "…" : "accept"}
          </Button>
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => void respond(false)}>
            decline
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm gap-4 py-6">
        <CardContent className="space-y-4">{body}</CardContent>
      </Card>
    </div>
  );
}
