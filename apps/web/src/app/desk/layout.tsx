import { DeskShell } from "@/components/desk/desk-shell";

export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return <DeskShell>{children}</DeskShell>;
}
