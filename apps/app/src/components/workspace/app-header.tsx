"use client";

import Link from "next/link";
import { BookOpen, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-border bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5">
        <Link href="/desk" className="flex items-center gap-2 font-semibold tracking-tight no-underline">
          <Terminal className="text-primary size-4" />
          community-os
        </Link>
        {children}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/docs" className="flex items-center gap-1.5 no-underline">
              <BookOpen className="size-3.5" /> Docs
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
