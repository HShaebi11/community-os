import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays } from "lucide-react";
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
      <section className="border-border border-b py-10">
        <Kicker>The official front door</Kicker>
        <h1 className="mb-3 text-4xl tracking-tight">{community.name}</h1>
        <p className="text-muted-foreground mb-6 max-w-xl">
          This is the community's own page — the chat still lives where it already lives. Join there; RSVP here.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {community.joinUrl ? (
            <Button size="lg" asChild>
              <a
                href={community.joinUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary-foreground no-underline"
              >
                Join the chat <ArrowRight className="size-4" />
              </a>
            </Button>
          ) : null}
          <Qr svg={community.qrSvg} />
        </div>
      </section>

      <section className="py-8">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <CalendarDays className="size-5" /> Next events
        </h2>
        {community.events.length === 0 ? (
          <Empty>Nothing published yet — the lead will go live from the desk.</Empty>
        ) : (
          <div className="space-y-3">
            {community.events.map((e) => (
              <Card key={e.slug} className="gap-2 py-4 transition-colors hover:bg-secondary/40">
                <CardContent className="flex items-center justify-between gap-3">
                  <div>
                    <Link href={`/e/${e.slug}`} className="font-semibold">
                      {e.title}
                    </Link>
                    <p className="text-muted-foreground text-sm">RSVP on this page — no third party.</p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/e/${e.slug}`} className="text-foreground no-underline">
                      RSVP
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </PublicChrome>
  );
}
