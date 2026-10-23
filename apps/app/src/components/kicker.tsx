export function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-primary mb-2 font-mono text-xs tracking-[0.14em] uppercase">{children}</p>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border text-muted-foreground rounded-lg border border-dashed p-5 text-sm">{children}</div>
  );
}
