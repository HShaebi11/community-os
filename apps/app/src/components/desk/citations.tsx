import { Quote } from "lucide-react";
import type { Citation } from "@/lib/types";

export function Citations({ citations, label = "Evidence" }: { citations?: Citation[]; label?: string }) {
  const quotes = (citations ?? []).map((c) => c.quote).filter((q): q is string => Boolean(q));
  if (quotes.length === 0) return null;
  return (
    <div className="bg-background/60 border-border rounded-lg border p-3">
      <p className="text-muted-foreground mb-2 flex items-center gap-1.5 font-mono text-[0.65rem] tracking-wider uppercase">
        <Quote className="size-3" /> {label}
      </p>
      <ul className="space-y-1.5">
        {quotes.slice(0, 4).map((quote, i) => (
          <li key={i} className="text-muted-foreground border-border border-l-2 pl-2 text-sm">
            “{quote}”
          </li>
        ))}
      </ul>
    </div>
  );
}
