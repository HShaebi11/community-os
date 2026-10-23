import Link from "next/link";

export function PublicChrome({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="mx-auto flex max-w-3xl items-baseline justify-between border-b px-5 py-5">
        <Link href="/" className="text-foreground font-bold no-underline">
          Community OS
        </Link>
        <nav className="flex gap-4 text-[0.95rem]">
          <Link href="/desk">Desk</Link>
          <Link href="/docs">API</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-12">{children}</main>
    </div>
  );
}

export function Qr({ svg }: { svg: string }) {
  return <div className="my-5 size-36 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
