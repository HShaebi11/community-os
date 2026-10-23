import type { Citation } from "@/lib/types";

export function Citations({ citations, label = "Evidence from the chat" }: { citations?: Citation[]; label?: string }) {
  const quotes = (citations ?? []).map((c) => c.quote).filter((q): q is string => Boolean(q));
  if (quotes.length === 0) return null;
  return (
    <div className="border-border border-l-2 pl-3">
      <p className="text-muted-foreground mb-1 text-xs tracking-wide uppercase">{label}</p>
      <ul className="space-y-1">
        {quotes.slice(0, 4).map((quote, i) => (
          <li key={i} className="text-muted-foreground text-sm italic">
            “{quote}”
          </li>
        ))}
      </ul>
    </div>
  );
}
