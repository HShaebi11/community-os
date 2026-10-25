"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { use } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "", label: "General" },
  { path: "/agents", label: "Agents" },
];

export default function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const pathname = usePathname();
  const base = `/w/${slug}/settings`;
  return (
    <section>
      <nav className="bg-secondary/50 mb-6 inline-flex items-center gap-0.5 rounded-md p-1">
        {TABS.map((tab) => {
          const href = base + tab.path;
          const active = tab.path === "" ? pathname === base : pathname.startsWith(href);
          return (
            <Link
              key={tab.path}
              href={href}
              className={cn(
                "text-muted-foreground rounded-sm px-3 py-1.5 text-sm no-underline transition-colors",
                active && "bg-background text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </section>
  );
}
