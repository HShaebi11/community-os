import Link from "next/link";

export function PublicChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-baseline justify-between px-5 py-6">
        <Link href="/" className="text-foreground font-bold tracking-tight no-underline">
          Community OS
        </Link>
        <nav className="flex gap-5 text-[0.95rem]">
          <Link href="/desk">Desk</Link>
          <Link href="/docs">API</Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5">{children}</main>
      <footer className="border-border mt-10 border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-sm">
          <span>Community OS — the brain and the front door. MIT.</span>
          <span>Humans and agents, same API.</span>
        </div>
      </footer>
    </div>
  );
}

export function Qr({ svg }: { svg: string }) {
  return <div className="size-36 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
