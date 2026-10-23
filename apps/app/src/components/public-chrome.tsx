import Link from "next/link";
import { Terminal } from "lucide-react";

export function PublicChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight no-underline">
          <Terminal className="text-primary size-4" />
          community-os
        </Link>
        <nav className="text-muted-foreground flex gap-5 font-mono text-xs tracking-wider">
          <Link href="/desk" className="hover:text-foreground">
            desk
          </Link>
          <Link href="/docs" className="hover:text-foreground">
            api
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-5">{children}</main>
      <footer className="border-border mt-12 border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-5 py-5 font-mono text-xs">
          <span>community-os · mit</span>
          <span>humans and agents, same /v1</span>
        </div>
      </footer>
    </div>
  );
}

export function Qr({ svg }: { svg: string }) {
  return (
    <div
      className="border-border size-32 rounded-lg border bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
