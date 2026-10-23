import { notFound } from "next/navigation";
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
      <Kicker>Public ID</Kicker>
      <Card className="max-w-md gap-3 py-6">
        <CardContent className="space-y-3">
          <p className="text-muted-foreground">Opted in — not a directory of everyone.</p>
          <h1 className="text-3xl tracking-tight">{member.name}</h1>
          <p>
            <strong>Does</strong>
            <br />
            {member.do ?? "—"}
          </p>
          <p>
            <strong>Offers</strong>
            <br />
            {member.offer ?? "—"}
          </p>
        </CardContent>
      </Card>
    </PublicChrome>
  );
}
