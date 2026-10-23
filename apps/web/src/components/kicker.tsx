export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-xs tracking-[0.08em] text-muted-foreground uppercase">{children}</p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border text-muted-foreground rounded-md border border-dashed p-4">{children}</div>
  );
}
