import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CalendarDays } from "lucide-react";
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
      <section className="border-border border-b py-12">
        <Kicker>the official front door</Kicker>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">{community.name}</h1>
        <p className="text-muted-foreground mb-7 max-w-lg">
          The community's own page. Chat still lives where it already lives — join there, RSVP here.
        </p>
        <div className="flex flex-wrap items-center gap-5">
          {community.joinUrl ? (
            <Button asChild>
              <a href={community.joinUrl} target="_blank" rel="noreferrer" className="text-primary-foreground no-underline">
                join the chat <ArrowUpRight className="size-4" />
              </a>
            </Button>
          ) : null}
          <Qr svg={community.qrSvg} />
        </div>
      </section>

      <section className="py-8">
        <h2 className="mb-4 flex items-center gap-2 font-mono text-xs tracking-wider text-muted-foreground uppercase">
          <CalendarDays className="size-4" /> next events
        </h2>
        {community.events.length === 0 ? (
          <Empty>Nothing published yet — the lead goes live from the desk.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {community.events.map((e) => (
              <Link key={e.slug} href={`/e/${e.slug}`} className="no-underline">
                <Card className="hover:border-primary/50 gap-2 py-4 transition-colors">
                  <CardContent>
                    <p className="font-medium text-foreground">{e.title}</p>
                    <p className="text-muted-foreground font-mono text-xs">rsvp → /e/{e.slug}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </PublicChrome>
  );
}
