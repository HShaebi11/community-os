"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/desk/page-header";
import { CopyButton } from "@/components/copy-button";
import { Empty } from "@/components/kicker";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { authClient } from "@/lib/auth-client";
import type { OrgInvitation, OrgMember } from "@/lib/types";

const ROLES = ["admin", "member"] as const;
const ALL_ROLES = ["owner", "admin", "member"] as const;

export default function TeamPage() {
  const { workspace, role, me } = useWorkspace();
  const canManage = role === "owner" || role === "admin";
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("admin");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [{ data: m }, { data: inv }] = await Promise.all([
        authClient.organization.listMembers({ query: { organizationId: workspace.id } }),
        authClient.organization.listInvitations({ query: { organizationId: workspace.id } }),
      ]);
      setMembers((m?.members ?? []) as unknown as OrgMember[]);
      setInvitations(((inv ?? []) as unknown as OrgInvitation[]).filter((i) => i.status === "pending"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await authClient.organization.inviteMember({
        email: email.trim(),
        role: inviteRole as "admin" | "member",
        organizationId: workspace.id,
      });
      if (error) throw new Error(error.message ?? "invite failed");
      setEmail("");
      toast.success("Invite sent.");
      const id = (data as { id?: string } | null)?.id;
      if (id) await navigator.clipboard.writeText(`${window.location.origin}/invite/${id}`).catch(() => {});
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(m: OrgMember, next: string) {
    const { error } = await authClient.organization.updateMemberRole({
      memberId: m.id,
      role: next,
      organizationId: workspace.id,
    });
    if (error) toast.error(error.message ?? "failed");
    else {
      toast.success("Role updated.");
      await load();
    }
  }

  async function remove(m: OrgMember) {
    const { error } = await authClient.organization.removeMember({
      memberIdOrEmail: m.id,
      organizationId: workspace.id,
    });
    if (error) toast.error(error.message ?? "failed");
    else {
      toast.success("Removed.");
      await load();
    }
  }

  async function cancel(inv: OrgInvitation) {
    const { error } = await authClient.organization.cancelInvitation({ invitationId: inv.id });
    if (error) toast.error(error.message ?? "failed");
    else await load();
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        kicker="team"
        title="Members"
        lede="A workspace is an organization — owners and admins can invite co-leads and change roles."
      />

      {canManage ? (
        <Card className="mb-8 gap-3 py-5">
          <CardContent>
            <form onSubmit={(e) => void invite(e)} className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1 space-y-1.5">
                <Label htmlFor="invite-email">Invite by email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  placeholder="colead@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="w-32 space-y-1.5">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "sending…" : "send invite"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {invitations.length > 0 ? (
        <div className="mb-8">
          <h2 className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">pending invites</h2>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <Card key={inv.id} className="gap-2 py-3">
                <CardContent className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{inv.email}</p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {inv.role ?? "member"} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <CopyButton text={`${window.location.origin}/invite/${inv.id}`} label="copy link" />
                    {canManage ? (
                      <Button variant="ghost" size="sm" onClick={() => void cancel(inv)}>
                        revoke
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {members === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : members.length === 0 ? (
        <Empty>No members found.</Empty>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <Card key={m.id} className="gap-2 py-3">
              <CardContent className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.user?.name || m.user?.email || m.userId}</p>
                  <p className="text-muted-foreground truncate font-mono text-xs">
                    {m.user?.email}
                    {m.userId === me.userId ? " · you" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canManage && m.userId !== me.userId && m.role !== "owner" ? (
                    <>
                      <Select value={m.role} onValueChange={(v) => void updateRole(m, v)}>
                        <SelectTrigger className="h-7 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" onClick={() => void remove(m)}>
                        remove
                      </Button>
                    </>
                  ) : (
                    <Badge variant="outline" className="font-mono">
                      {m.role}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
