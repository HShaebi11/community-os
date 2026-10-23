import { Card, CardContent } from "@/components/ui/card";

const MEMBERS = [
  { name: "Priya", do: "runs a robotics studio", offer: "venue + soldering gear" },
  { name: "Marco", do: "ml engineer", offer: "wants to host a fine-tuning night" },
  { name: "June", do: "community designer", offer: "poster + wayfinding help" },
];

const DEMANDS = [
  { topic: "hardware show-and-tell", count: 9 },
  { topic: "co-working saturday", count: 6 },
];

export function ProductPreview() {
  return (
    <div
      aria-hidden
      className="border-border bg-card/60 pointer-events-none overflow-hidden rounded-xl border p-4 shadow-2xl select-none"
    >
      <div className="text-muted-foreground mb-3 flex items-center gap-2 font-mono text-[0.65rem] tracking-wider uppercase">
        <span className="bg-primary size-1.5 rounded-full" />
        briefing · hackers-in-residence
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {MEMBERS.map((m) => (
          <Card key={m.name} className="bg-background gap-1 py-3">
            <CardContent>
              <p className="text-sm font-medium">{m.name}</p>
              <p className="text-muted-foreground text-xs">{m.do}</p>
              <p className="text-primary/80 mt-1 font-mono text-[0.65rem]">{m.offer}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {DEMANDS.map((d) => (
          <div
            key={d.topic}
            className="bg-background flex items-center justify-between rounded-md border px-3 py-2"
          >
            <span className="truncate text-sm">{d.topic}</span>
            <span className="text-muted-foreground ml-2 shrink-0 font-mono text-xs">{d.count} asked</span>
          </div>
        ))}
        <div className="border-primary/30 bg-primary/5 flex items-center justify-between rounded-md border border-dashed px-3 py-2 sm:col-span-2">
          <span className="text-sm">proposal pack · speakers + venue drafted</span>
          <span className="text-primary font-mono text-xs">awaiting approval</span>
        </div>
      </div>
    </div>
  );
}
