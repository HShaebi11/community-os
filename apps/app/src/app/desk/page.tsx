"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";
import type { Workspace } from "@/lib/types";

export default function DeskResolver() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const workspaces = await api<Workspace[]>("/v1/workspaces");
        if (workspaces.length === 0) {
          router.replace("/onboarding");
        } else {
          const last = localStorage.getItem("cos_last_ws");
          const target = workspaces.find((w) => w.slug === last) ?? workspaces[0];
          router.replace(`/w/${target.slug}`);
        }
      } catch {
        router.replace("/sign-in?next=/desk");
      }
    })();
  }, [router]);

  return <p className="text-muted-foreground px-4 py-10 text-sm">Resolving your workspace…</p>;
}
