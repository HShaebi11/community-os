import Link from "next/link";
import { Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
  { href: "/about", label: "About" },
];

export function MarketingChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-5">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight no-underline">
            <Terminal className="text-primary size-4" />
            community-os
          </Link>
          <nav className="text-muted-foreground hidden gap-5 text-sm md:flex">
            {NAV.map((item) => (
              <Link key={item.label} href={item.href} className="hover:text-foreground no-underline">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in" className="no-underline">
                Sign in
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up" className="text-primary-foreground no-underline">
                Get started
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5">{children}</main>
      <footer className="border-border mt-16 border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-8 font-mono text-xs">
          <span>community-os · mit license</span>
          <nav className="flex gap-5">
            <Link href="/docs" className="hover:text-foreground">
              docs
            </Link>
            <a href="https://github.com" className="hover:text-foreground" target="_blank" rel="noreferrer">
              github
            </a>
            <Link href="/privacy" className="hover:text-foreground">
              privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
