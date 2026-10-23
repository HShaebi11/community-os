"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronsUpDown, LogOut, Terminal, User } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Me } from "@/lib/types";

export function AppHeader({ me, children }: { me: Me; children?: React.ReactNode }) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="border-border bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5">
        <Link href="/desk" className="flex items-center gap-2 font-semibold tracking-tight no-underline">
          <Terminal className="text-primary size-4" />
          community-os
        </Link>
        {children}
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="border-border bg-card hover:border-input flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors">
              <span className="max-w-40 truncate">{me.name || me.email}</span>
              <ChevronsUpDown className="text-muted-foreground size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{me.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/account")}>
                <User className="size-3.5" /> Account
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push("/docs")}>
                <BookOpen className="size-3.5" /> Docs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut className="size-3.5" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
