"use client";

import { createContext, useContext } from "react";
import type { LeadRole, Me, Workspace } from "@/lib/types";

export type WorkspaceContextValue = {
  workspace: Workspace & { role: LeadRole };
  role: LeadRole;
  me: Me;
  refresh: () => Promise<void>;
};

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceShell");
  return ctx;
}
