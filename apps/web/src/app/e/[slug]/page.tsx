import Link from "next/link";
import { notFound } from "next/navigation";
import { Kicker } from "@/components/kicker";
import { PublicChrome, Qr } from "@/components/public-chrome";
import { RsvpForm } from "@/components/rsvp-form";
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
  const where = event.venue
    ? `${event.venue.name}${event.venue.area ? ` · ${event.venue.area}` : ""}`
    : null;

  return (
    <PublicChrome>
      <p className="text-muted-foreground">
        <Link href={`/c/${event.community.slug}`}>{event.community.name}</Link>
      </p>
      <Kicker>Event</Kicker>
      <h1 className="mb-2 text-3xl tracking-tight">{event.title}</h1>
      {event.explanation ? <p className="mb-3">{event.explanation}</p> : null}
      {where ? (
        <p className="mb-3">
          <strong>Where</strong> {where}
        </p>
      ) : (
        <p className="text-muted-foreground mb-3">Venue to be confirmed.</p>
      )}
      <h2 className="mb-2 text-lg font-semibold">Speakers</h2>
      {event.speakers.length === 0 ? (
        <p className="text-muted-foreground mb-3">Speakers will appear here when the pack is public.</p>
      ) : (
        <ul className="mb-3 list-disc pl-5">
          {event.speakers.map((s) => (
            <li key={s.name}>{s.slug ? <Link href={`/m/${s.slug}`}>{s.name}</Link> : s.name}</li>
          ))}
        </ul>
      )}
      <Qr svg={event.qrSvg} />
      <RsvpForm slug={event.slug} ok={rsvp === "1"} />
    </PublicChrome>
  );
}
