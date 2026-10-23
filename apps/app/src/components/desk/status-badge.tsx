import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PROPOSAL: Record<string, { label: string; className: string }> = {
  draft: { label: "draft", className: "border-muted-foreground/40 text-muted-foreground" },
  approved: { label: "approved", className: "border-transparent bg-[var(--ok)] text-[#0a0c12]" },
  live: { label: "live", className: "border-transparent bg-[var(--primary)] text-[#0a0c12]" },
};

const DECISION: Record<string, { label: string; className: string }> = {
  accept: { label: "accept", className: "border-transparent bg-[var(--ok)] text-[#0a0c12]" },
  ask: { label: "ask", className: "border-muted-foreground/40 text-muted-foreground" },
  decline: { label: "decline", className: "border-transparent bg-[var(--destructive)] text-[#0a0c12]" },
  pending: { label: "pending", className: "border-muted-foreground/40 text-muted-foreground" },
};

export function ProposalStatusBadge({ status }: { status: string }) {
  const conf = PROPOSAL[status] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={cn("font-mono", conf.className)}>
      {conf.label}
    </Badge>
  );
}

export function DecisionBadge({ decision }: { decision: string }) {
  const conf = DECISION[decision] ?? { label: decision, className: "" };
  return (
    <Badge variant="outline" className={cn("font-mono", conf.className)}>
      {conf.label}
    </Badge>
  );
}
