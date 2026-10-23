import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Kicker } from "@/components/kicker";

export const metadata: Metadata = { title: "Pricing" };

const TIERS = [
  {
    name: "Self-host",
    price: "Free forever",
    tag: "open source",
    cta: { label: "Read the docs", href: "/docs" },
    features: ["MIT license", "Your own Neon database", "Full /v1 API + MCP", "Unlimited workspaces"],
  },
  {
    name: "Hosted",
    price: "Free",
    tag: "beta",
    cta: { label: "Get started", href: "/sign-up" },
    features: ["Everything in self-host", "Managed database", "Google sign-in", "Email delivery"],
    highlight: true,
  },
  {
    name: "Pro",
    price: "Coming soon",
    tag: "planned",
    cta: null,
    features: ["More workspaces per account", "LLM-assisted extraction", "Luma sync", "Priority support"],
  },
];

const FAQ = [
  { q: "Is there billing today?", a: "No. The hosted beta is free and the Pro tier is planned, not sold." },
  { q: "What changes when Pro ships?", a: "Self-host stays free forever. The hosted beta keeps a free tier; Pro adds capacity and integrations." },
  { q: "Can I migrate between hosted and self-host?", a: "Yes — your data is just Postgres. The API and MCP adapter are identical either way." },
];

export default function PricingPage() {
  return (
    <>
      <section className="pt-16 pb-10 text-center">
        <Kicker>pricing</Kicker>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Simple, and mostly free.</h1>
        <p className="text-muted-foreground mx-auto max-w-lg text-sm">
          No billing today — everything is either open source or a free beta. Planned tiers are marked.
        </p>
      </section>

      <section className="grid gap-4 pb-12 md:grid-cols-3">
        {TIERS.map((t) => (
          <Card key={t.name} className={`gap-4 py-6 ${t.highlight ? "border-primary/50" : ""}`}>
            <CardContent className="flex h-full flex-col">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">{t.name}</h2>
                <Badge variant="outline" className="font-mono">
                  {t.tag}
                </Badge>
              </div>
              <p className="mb-4 font-mono text-2xl">{t.price}</p>
              <ul className="text-muted-foreground mb-6 flex-1 space-y-1.5 text-sm">
                {t.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              {t.cta ? (
                <Button asChild variant={t.highlight ? "default" : "outline"} className="w-full">
                  <Link href={t.cta.href} className="no-underline">
                    {t.cta.label}
                  </Link>
                </Button>
              ) : (
                <Button disabled variant="outline" className="w-full">
                  planned
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
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
