import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, Kicker } from "@/components/kicker";
import { PublicChrome, Qr } from "@/components/public-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchPublic } from "@/lib/public-api";
import type { PublicCommunity } from "@/lib/types";

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const community = await fetchPublic<PublicCommunity>(`/v1/public/communities/${slug}`);
  if (!community) notFound();

  return (
    <PublicChrome>
      <Kicker>Community</Kicker>
      <h1 className="mb-2 text-3xl tracking-tight">{community.name}</h1>
      <p className="text-muted-foreground mb-4">The official front door. Chat still lives where it already lives.</p>
      {community.joinUrl ? (
        <Button asChild>
          <a href={community.joinUrl} className="text-primary-foreground no-underline">
            Join the chat
          </a>
        </Button>
      ) : null}
      <Qr svg={community.qrSvg} />
      <h2 className="mb-3 text-lg font-semibold">Next events</h2>
      <div className="space-y-3">
        {community.events.length === 0 ? (
          <Empty>Nothing published yet. The lead will go live from the desk.</Empty>
        ) : (
          community.events.map((e) => (
            <Card key={e.slug} className="gap-2 py-4">
              <CardContent>
                <Kicker>Event</Kicker>
                <h2 className="text-xl">
                  <Link href={`/e/${e.slug}`}>{e.title}</Link>
                </h2>
                <p className="text-muted-foreground">RSVP on our page.</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <p className="text-muted-foreground mt-5">
        Share <code>/c/{community.slug}</code>
      </p>
    </PublicChrome>
  );
}
