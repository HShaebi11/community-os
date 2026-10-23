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
  const where = event.venue
    ? `${event.venue.name}${event.venue.area ? ` · ${event.venue.area}` : ""}`
    : null;

  return (
    <PublicChrome>
      <p className="text-muted-foreground pt-6 text-sm">
        An event by <Link href={`/c/${event.community.slug}`}>{event.community.name}</Link>
      </p>
      <section className="py-8">
        <Kicker>Event</Kicker>
        <h1 className="mb-4 text-4xl tracking-tight">{event.title}</h1>
        {event.explanation ? <p className="mb-6 max-w-xl text-lg">{event.explanation}</p> : null}

        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          <Card className="gap-1 py-4">
            <CardContent>
              <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs tracking-wide uppercase">
                <CalendarDays className="size-3.5" /> When
              </p>
              <p>{when ?? "Date to be confirmed"}</p>
            </CardContent>
          </Card>
          <Card className="gap-1 py-4">
            <CardContent>
              <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs tracking-wide uppercase">
                <MapPin className="size-3.5" /> Where
              </p>
              <p>{where ?? "Venue to be confirmed"}</p>
            </CardContent>
          </Card>
        </div>

        {event.speakers.length > 0 ? (
          <div className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Mic className="size-5" /> Speakers
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {event.speakers.map((s) => (
                <Card key={s.name} className="gap-1 py-4">
                  <CardContent>
                    {s.slug ? (
                      <Link href={`/m/${s.slug}`} className="font-semibold">
                        {s.name}
                      </Link>
                    ) : (
                      <p className="font-semibold">{s.name}</p>
                    )}
                    <p className="text-muted-foreground text-sm">
                      {s.slug ? "Public ID — opted in" : "From the community"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mb-8 flex flex-wrap items-center gap-6">
          <Qr svg={event.qrSvg} />
          <div className="text-muted-foreground max-w-xs text-sm">
            <p className="mb-1 font-semibold text-foreground">One link, one door.</p>
            <p>
              Scan or share <code>/e/{event.slug}</code>. RSVPs land straight on the lead's desk — no rented RSVP
              platform in between.
            </p>
          </div>
        </div>

        <RsvpForm slug={event.slug} ok={rsvp === "1"} />
      </section>
    </PublicChrome>
  );
}
