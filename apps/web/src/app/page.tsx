import Link from "next/link";
import { ArrowRight, Terminal } from "lucide-react";
import { PublicChrome } from "@/components/public-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Kicker } from "@/components/kicker";

const LOOP = [
  {
    n: "1",
    title: "Import the chat",
    body: "Drop a WhatsApp export. Every message becomes evidence — append-only, never sent back.",
  },
  {
    n: "2",
    title: "Remember the people",
    body: "Phone numbers become cards: what they do, want, and offer — cited to the exact message.",
  },
  {
    n: "3",
    title: "Propose the event",
    body: "“We should do a workshop” becomes a pack: matched speakers, a room, and a draft you send.",
  },
  {
    n: "4",
    title: "Go live",
    body: "One click publishes a native event page with a QR code — your community's front door.",
  },
  {
    n: "5",
    title: "Fill the room",
    body: "Guests RSVP on your page, not a rented platform. The list stays in the same system.",
  },
];

const MCP_TOOLS = ["search_memory", "get_member", "list_demand", "create_proposal", "get_event", "draft_message"];

export default function HomePage() {
  return (
    <PublicChrome>
      <section className="pt-6 pb-12">
        <Kicker>The operating system for a community</Kicker>
        <h1 className="mb-4 max-w-2xl text-5xl tracking-tight">Your community, remembered.</h1>
        <p className="text-muted-foreground mb-6 max-w-xl text-lg">
          The group keeps living in WhatsApp or Discord. Community OS is the <strong>brain</strong> behind it and the{" "}
          <strong>front door</strong> the world sees — memory you can act on, ending in an event page and a guest list
          you own.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link href="/desk" className="text-primary-foreground no-underline">
              Open the desk <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/docs" className="text-foreground no-underline">
              Read the API
            </Link>
          </Button>
        </div>
      </section>

      <section className="border-border border-t py-10">
        <Kicker>The loop</Kicker>
        <h2 className="mb-6 text-2xl tracking-tight">Chat to guest list, natively.</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {LOOP.map((step) => (
            <li key={step.n} className="border-foreground border-t-2 pt-3">
              <span className="text-muted-foreground mb-1 block text-sm">{step.n}</span>
              <strong className="block">{step.title}</strong>
              <p className="text-muted-foreground mt-1 text-sm">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-border grid gap-4 border-t py-10 sm:grid-cols-2">
        <div>
          <Kicker>Not a chat app</Kicker>
          <h2 className="mb-3 text-2xl tracking-tight">Chat stays where it is.</h2>
          <p className="text-muted-foreground">
            We don't replace WhatsApp, Discord, or Slack — and we never post into the group. The lead reads drafts
            and sends them in the original chat. Members keep their habits; the community gets a memory and a door.
          </p>
        </div>
        <div>
          <Kicker>Public ≠ private</Kicker>
          <h2 className="mb-3 text-2xl tracking-tight">Opted in, or invisible.</h2>
          <p className="text-muted-foreground">
            The website only shows what the lead publishes and what members opt into. Citations trace every card back
            to evidence, and lead edits are never overwritten by a model.
          </p>
        </div>
      </section>

      <section className="border-border border-t py-10">
        <Kicker>API first</Kicker>
        <h2 className="mb-3 text-2xl tracking-tight">Humans and agents, same routes.</h2>
        <p className="text-muted-foreground mb-5 max-w-xl">
          The product is the HTTP API. This desk, the public pages, and the MCP server are all clients — so a Cursor
          agent can do everything a lead can do, through the same permissions.
        </p>
        <Card className="gap-2 py-4">
          <CardContent className="space-y-3">
            <p className="text-muted-foreground flex items-center gap-2 text-xs tracking-wide uppercase">
              <Terminal className="size-3.5" /> MCP tools for agents
            </p>
            <div className="flex flex-wrap gap-2">
              {MCP_TOOLS.map((t) => (
                <code key={t} className="bg-secondary rounded-sm px-2 py-1 text-sm">
                  {t}
                </code>
              ))}
            </div>
            <p className="text-muted-foreground text-sm">
              No <code>send_message</code> — agents draft, humans send.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="border-border border-t py-10 text-center">
        <h2 className="mb-3 text-2xl tracking-tight">Run this week from the desk, not the scroll.</h2>
        <Button size="lg" asChild>
          <Link href="/desk" className="text-primary-foreground no-underline">
            Start with your community <ArrowRight className="size-4" />
          </Link>
        </Button>
      </section>
    </PublicChrome>
  );
}
