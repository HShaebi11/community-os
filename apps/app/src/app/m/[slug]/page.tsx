import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { Kicker } from "@/components/kicker";
import { PublicChrome } from "@/components/public-chrome";
import { Card, CardContent } from "@/components/ui/card";
import { fetchPublic } from "@/lib/public-api";
import type { PublicMember } from "@/lib/types";

export default async function MemberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await fetchPublic<PublicMember>(`/v1/public/members/${slug}`);
  if (!member) notFound();

  return (
    <PublicChrome>
      <section className="py-12">
        <Kicker>public id — opted in</Kicker>
        <Card className="max-w-md gap-4 py-6">
          <CardContent className="space-y-4">
            <div>
              <p className="mb-1 flex items-center gap-1.5 font-mono text-[0.65rem] tracking-wider text-[var(--ok)] uppercase">
                <BadgeCheck className="size-3.5" /> member
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">{member.name}</h1>
            </div>
            <div>
              <p className="text-muted-foreground font-mono text-[0.65rem] tracking-wider uppercase">does</p>
              <p className="text-sm">{member.do ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-mono text-[0.65rem] tracking-wider uppercase">offers</p>
              <p className="text-sm">{member.offer ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <p className="text-muted-foreground mt-4 font-mono text-xs">not a directory — only what this member opted in to.</p>
      </section>
    </PublicChrome>
  );
}
