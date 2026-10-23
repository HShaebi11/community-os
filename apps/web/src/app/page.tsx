import Link from "next/link";
import { PublicChrome } from "@/components/public-chrome";
import { Button } from "@/components/ui/button";
import { Kicker } from "@/components/kicker";

export default function HomePage() {
  return (
    <PublicChrome>
      <section>
        <Kicker>The brain of the group</Kicker>
        <h1 className="mb-2 text-4xl tracking-tight">Your community, remembered.</h1>
        <p className="mb-4 max-w-xl text-lg">
          Import the chat. See the people. Make the event. Own the door. Chat stays in WhatsApp or Discord — this is
          the official front door.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/desk" className="text-primary-foreground no-underline">
              Open the desk
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/docs" className="text-foreground no-underline">
              HTTP API
            </Link>
          </Button>
        </div>
      </section>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Step n="1" title="Import" body="Bring a WhatsApp export into memory." />
        <Step n="2" title="People" body="Names, what they do, want, and offer — with citations." />
        <Step n="3" title="Event" body="Demand becomes a proposal, then a native page." />
        <Step n="4" title="Door" body="QR, RSVP, and guests you own." />
      </div>
    </PublicChrome>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="border-foreground border-t pt-3">
      <span className="text-muted-foreground mb-1 block text-sm">{n}</span>
      <strong>{title}</strong>
      <p className="text-muted-foreground mt-1">{body}</p>
    </div>
  );
}
