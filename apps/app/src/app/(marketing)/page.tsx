import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Kicker } from "@/components/kicker";
import { ProductPreview } from "@/components/product-preview";

const LOOP = [
  { n: "01", title: "import the chat", body: "WhatsApp export → append-only evidence." },
  { n: "02", title: "remember the people", body: "Phones → cards: do, want, offer, cited." },
  { n: "03", title: "propose the event", body: "Demand → pack: speakers, room, draft." },
  { n: "04", title: "go live", body: "One click → native event page + QR." },
  { n: "05", title: "fill the room", body: "Native RSVP → guests you own." },
];

const FEATURES = [
  { title: "Cited member memory", body: "Every card cites the chat line it came from. Nothing is asserted without evidence." },
  { title: "Demand detection", body: "Repeated asks cluster into demand you can act on — not a feed you'll never read." },
  { title: "Proposal packs", body: "Speakers, venue and outreach drafted from memory. The lead approves, the product doesn't decide." },
  { title: "Native event pages", body: "One click to a public page with QR — no Meetup middleman." },
  { title: "An RSVP list you own", body: "Guests land in your database, linked back to members where they match." },
  { title: "The gatekeeper", body: "Applications scored against your norms before anyone joins the chat." },
];

const TOOLS = ["search_memory", "get_member", "list_demand", "create_proposal", "get_event", "draft_message"];

const FAQ = [
  {
    q: "Does it post into my chat?",
    a: "No. Community OS never writes to your group. It reads an export, builds memory, and drafts — you send in the original chat.",
  },
  {
    q: "Which chats can I import?",
    a: "WhatsApp exports today (.txt or .zip). The parser is append-only and idempotent — re-importing is safe.",
  },
  {
    q: "Who sees my community's data?",
    a: "Whoever can reach your deployment — there are no accounts, so run it on a machine or network you trust. Public pages (/c, /e, /m) show only what's published and opted-in.",
  },
  {
    q: "Can my agents use it?",
    a: "Yes — the product is the HTTP API, plus an MCP adapter. Point any client at /v1 or /mcp; there's nothing to mint or sign.",
  },
  {
    q: "Is it open source?",
    a: "Yes — MIT licensed, head to toe. Self-host the API and the app; a hosted edition is a separate layer.",
  },
  {
    q: "What does it cost?",
    a: "Nothing. It's open source — you pay for your own Postgres (Neon's free tier works).",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="pt-16 pb-12">
        <Kicker>the operating system for a community</Kicker>
        <h1 className="mb-4 max-w-2xl text-5xl font-semibold tracking-tight">
          Your community, <span className="text-primary">remembered.</span>
        </h1>
        <p className="text-muted-foreground mb-8 max-w-xl text-lg">
          The group stays in WhatsApp or Discord. This is the brain behind it and the front door the world sees —
          memory you can act on, ending in an event page and a guest list you own.
        </p>
        <div className="mb-10 flex flex-wrap gap-3">
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
        <div id="product">
          <ProductPreview />
        </div>
      </section>

      <section className="border-border border-t py-12">
        <Kicker>the loop</Kicker>
        <div className="border-border bg-border mt-4 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-5">
          {LOOP.map((step) => (
            <div key={step.n} className="bg-card p-4">
              <p className="text-primary font-mono text-xs">{step.n}</p>
              <p className="mt-2 text-sm font-medium">{step.title}</p>
              <p className="text-muted-foreground mt-1 text-xs">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border border-t py-12">
        <Kicker>what it does</Kicker>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="gap-2 py-5">
              <CardContent>
                <p className="mb-1.5 text-sm font-semibold">{f.title}</p>
                <p className="text-muted-foreground text-sm">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-border border-t py-12">
        <Kicker>built for agents</Kicker>
        <h2 className="mb-2 text-xl font-semibold tracking-tight">Humans and agents, same routes.</h2>
        <p className="text-muted-foreground mb-5 max-w-xl text-sm">
          The product is the HTTP API. This app and the MCP adapter are just clients — no tokens, no sign-up,
          <code className="font-mono text-xs"> /v1</code> is open on your own deployment.
        </p>
        <Card className="gap-2 py-4">
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {TOOLS.map((t) => (
                <code key={t} className="bg-secondary text-primary rounded px-2 py-1 font-mono text-xs">
                  {t}
                </code>
              ))}
            </div>
            <pre className="bg-background text-muted-foreground overflow-x-auto rounded-md border p-3 font-mono text-xs">{`curl http://localhost:5173/v1/search?q=speakers`}</pre>
            <p className="text-muted-foreground text-xs">
              no send_message — agents draft, humans send.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="border-border grid gap-8 border-t py-12 sm:grid-cols-2">
        <div>
          <Kicker>not a chat app</Kicker>
          <h2 className="mb-2 text-xl font-semibold tracking-tight">Chat stays where it is.</h2>
          <p className="text-muted-foreground text-sm">
            Nothing posts into the group. The product drafts — the lead sends, in the original chat. Members keep
            their habits; the community gets a memory and a door.
          </p>
        </div>
        <div>
          <Kicker>public ≠ private</Kicker>
          <h2 className="mb-2 text-xl font-semibold tracking-tight">Opted in, or invisible.</h2>
          <p className="text-muted-foreground text-sm">
            Public pages only show what's published and opted-in. Every card cites its evidence; lead edits are never
            overwritten by a model.
          </p>
        </div>
      </section>

      <section className="border-border border-t py-12">
        <Kicker>open source</Kicker>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <p className="text-muted-foreground max-w-xl text-sm">
            MIT licensed and API-first. Run the API on your own Neon database, plug in the MCP adapter, or fork the
            app — no lock-in by design.
          </p>
          <Button variant="outline" asChild>
            <Link href="/docs" className="text-foreground no-underline">
              self-host guide
            </Link>
          </Button>
        </div>
      </section>

      <section className="border-border border-t py-12">
        <Kicker>faq</Kicker>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {FAQ.map((f) => (
            <div key={f.q}>
              <p className="mb-1 text-sm font-semibold">{f.q}</p>
              <p className="text-muted-foreground text-sm">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border border-t py-14 text-center">
        <h2 className="mb-4 text-2xl font-semibold tracking-tight">Run next week from the desk, not the scroll.</h2>
        <Button size="lg" asChild>
          <Link href="/desk" className="text-primary-foreground no-underline">
            start with your community <ArrowRight className="size-4" />
          </Link>
        </Button>
      </section>
    </>
  );
}
