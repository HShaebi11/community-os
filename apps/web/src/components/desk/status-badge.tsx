import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PROPOSAL: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "" },
  approved: { label: "Approved", className: "border-transparent bg-[var(--ok)] text-[var(--primary-foreground)]" },
  live: { label: "Live", className: "border-transparent bg-[var(--primary)]" },
};

const DECISION: Record<string, { label: string; className: string }> = {
  accept: { label: "Accept", className: "border-transparent bg-[var(--ok)] text-[var(--primary-foreground)]" },
  ask: { label: "Ask", className: "" },
  decline: { label: "Decline", className: "border-transparent bg-[var(--destructive)] text-[var(--primary-foreground)]" },
  pending: { label: "Pending", className: "" },
};

export function ProposalStatusBadge({ status }: { status: string }) {
  const conf = PROPOSAL[status] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={cn(conf.className)}>
      {conf.label}
    </Badge>
  );
}

export function DecisionBadge({ decision }: { decision: string }) {
  const conf = DECISION[decision] ?? { label: decision, className: "" };
  return (
    <Badge variant="outline" className={cn(conf.className)}>
      {conf.label}
    </Badge>
  );
}
