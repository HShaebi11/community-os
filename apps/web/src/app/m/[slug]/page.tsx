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
      <section className="py-10">
        <Kicker>Public ID — opted in, not a directory</Kicker>
        <Card className="max-w-md gap-4 py-7">
          <CardContent className="space-y-4">
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs tracking-wide text-[var(--ok)] uppercase">
                <BadgeCheck className="size-3.5" /> Verified member
              </p>
              <h1 className="text-3xl tracking-tight">{member.name}</h1>
            </div>
            <div>
              <p className="text-muted-foreground text-xs tracking-wide uppercase">Does</p>
              <p>{member.do ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs tracking-wide uppercase">Offers</p>
              <p>{member.offer ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </PublicChrome>
  );
}
