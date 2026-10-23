import { Kicker } from "@/components/kicker";

export function PageHeader({
  kicker,
  title,
  lede,
  actions,
}: {
  kicker: string;
  title: string;
  lede?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
      <div>
        <Kicker>{kicker}</Kicker>
        <h1 className="mb-1.5 text-2xl font-semibold tracking-tight">{title}</h1>
        {lede ? <p className="text-muted-foreground max-w-xl text-sm">{lede}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 pt-1">{actions}</div> : null}
    </div>
  );
}
