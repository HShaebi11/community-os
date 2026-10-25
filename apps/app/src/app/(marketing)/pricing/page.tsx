import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Kicker } from "@/components/kicker";

export const metadata: Metadata = { title: "Pricing" };

const FAQ = [
  { q: "Is there billing?", a: "No. The project is MIT-licensed open source — there is nothing to buy." },
  { q: "What does it cost to run?", a: "Your infrastructure only: a Cloudflare Worker (free tier works) and a Postgres database (Neon's free tier works)." },
  { q: "Is there a hosted version?", a: "Not in this repo. The open core ships no accounts — a hosted, multi-user edition is a layer someone builds on top." },
  { q: "Can I take my data elsewhere?", a: "It's just Postgres — export any workspace to JSON from Settings, or query the tables directly." },
];

export default function PricingPage() {
  return (
    <>
      <section className="pt-16 pb-10 text-center">
        <Kicker>pricing</Kicker>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Free, because it&apos;s yours.</h1>
        <p className="text-muted-foreground mx-auto max-w-lg text-sm">
          Community OS is open source under the MIT license. Run it on your own infrastructure, keep your own
          data.
        </p>
      </section>

      <section className="mx-auto max-w-md pb-12">
        <Card className="border-primary/50 gap-4 py-6">
          <CardContent className="flex h-full flex-col text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <h2 className="font-semibold">Open source</h2>
              <Badge variant="outline" className="font-mono">
                MIT
              </Badge>
            </div>
            <p className="mb-4 font-mono text-2xl">Free forever</p>
            <ul className="text-muted-foreground mb-6 flex-1 space-y-1.5 text-sm">
              <li>· Full /v1 API + MCP adapter</li>
              <li>· Unlimited workspaces</li>
              <li>· Your own database — no lock-in</li>
              <li>· No accounts, no telemetry, no keys</li>
            </ul>
            <Button asChild className="w-full">
              <Link href="/docs" className="text-primary-foreground no-underline">
                Read the docs
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="border-border border-t py-10">
        <Kicker>faq</Kicker>
        <div className="mt-4 max-w-2xl space-y-5">
          {FAQ.map((f) => (
            <div key={f.q}>
              <p className="mb-1 text-sm font-semibold">{f.q}</p>
              <p className="text-muted-foreground text-sm">{f.a}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
