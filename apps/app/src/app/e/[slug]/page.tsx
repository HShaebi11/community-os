import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Mic } from "lucide-react";
import { Kicker } from "@/components/kicker";
import { PublicChrome, Qr } from "@/components/public-chrome";
import { RsvpForm } from "@/components/rsvp-form";
import { Card, CardContent } from "@/components/ui/card";
import { fetchPublic } from "@/lib/public-api";
import type { PublicEvent } from "@/lib/types";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rsvp?: string }>;
}) {
  const { slug } = await params;
  const { rsvp } = await searchParams;
  const event = await fetchPublic<PublicEvent>(`/v1/public/events/${slug}`);
  if (!event) notFound();

  const when = event.startsAt
    ? new Date(event.startsAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })
    : null;
  const where = event.venue ? `${event.venue.name}${event.venue.area ? ` · ${event.venue.area}` : ""}` : null;

  return (
    <PublicChrome>
      <p className="text-muted-foreground pt-6 font-mono text-xs">
        event by <Link href={`/c/${event.community.slug}`}>{event.community.name}</Link>
      </p>
      <section className="py-8">
        <Kicker>event</Kicker>
        <h1 className="mb-3 max-w-2xl text-4xl font-semibold tracking-tight">{event.title}</h1>
        {event.explanation ? <p className="text-muted-foreground mb-7 max-w-xl">{event.explanation}</p> : null}

        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          <Card className="gap-1 py-4">
            <CardContent>
              <p className="text-muted-foreground mb-1 flex items-center gap-1.5 font-mono text-[0.65rem] tracking-wider uppercase">
                <CalendarDays className="size-3.5" /> when
              </p>
              <p className="text-sm">{when ?? "date to be confirmed"}</p>
            </CardContent>
          </Card>
          <Card className="gap-1 py-4">
            <CardContent>
              <p className="text-muted-foreground mb-1 flex items-center gap-1.5 font-mono text-[0.65rem] tracking-wider uppercase">
                <MapPin className="size-3.5" /> where
              </p>
              <p className="text-sm">{where ?? "venue to be confirmed"}</p>
            </CardContent>
          </Card>
        </div>

        {event.speakers.length > 0 ? (
          <div className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 font-mono text-xs tracking-wider text-muted-foreground uppercase">
              <Mic className="size-4" /> speakers
            </h2>
            <div className="flex flex-wrap gap-2">
              {event.speakers.map((s) =>
                s.slug ? (
                  <Link
                    key={s.name}
                    href={`/m/${s.slug}`}
                    className="border-border hover:border-primary/60 rounded-full border px-3 py-1.5 text-sm no-underline transition-colors"
                  >
                    {s.name}
                  </Link>
                ) : (
                  <span key={s.name} className="border-border rounded-full border px-3 py-1.5 text-sm">
                    {s.name}
                  </span>
                ),
              )}
            </div>
          </div>
        ) : null}

        <div className="mb-8 flex flex-wrap items-center gap-6">
          <Qr svg={event.qrSvg} />
          <div className="text-muted-foreground max-w-xs text-sm">
            <p className="text-foreground mb-1 font-medium">One link, one door.</p>
            <p>
              Scan or share <code className="text-xs">/e/{event.slug}</code> — RSVPs go straight to the lead's desk.
            </p>
          </div>
        </div>

        <RsvpForm slug={event.slug} ok={rsvp === "1"} />
      </section>
    </PublicChrome>
  );
}
