"use client";

import { use } from "react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <WorkspaceShell slug={slug}>{children}</WorkspaceShell>;
}
