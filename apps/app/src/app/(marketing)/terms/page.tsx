import type { Metadata } from "next";
import { Kicker } from "@/components/kicker";

export const metadata: Metadata = { title: "Terms" };

const POINTS = [
  {
    title: "Open source, as-is",
    body: "Community OS is MIT licensed software provided as-is, without warranties or SLAs. Your best guarantee is the source — read it, run it, fork it.",
  },
  {
    title: "Your content",
    body: "You retain ownership of everything you import and create. You are responsible for having the right to import chat exports — only do so for chats and communities you administer.",
  },
  {
    title: "Acceptable use",
    body: "Don't use the product to spam, scrape, or build profiles of people without a legitimate community purpose. The API has no access control — run it where you trust the network.",
  },
  {
    title: "No liability for generated drafts",
    body: "Extraction, proposals and drafts are suggestions. Review before you send or publish — you are the human in the loop.",
  },
  {
    title: "Changes",
    body: "The product may change between releases. Pin a version or follow the changelog if you need stability.",
  },
];

export default function TermsPage() {
  return (
    <>
      <section className="pt-16 pb-8">
        <Kicker>terms</Kicker>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Terms, in plain language.</h1>
        <p className="text-muted-foreground max-w-lg text-sm">Short version: beta, as-is, be decent.</p>
      </section>
      <section className="max-w-2xl space-y-6 pb-12">
        {POINTS.map((p) => (
          <div key={p.title}>
            <p className="mb-1 text-sm font-semibold">{p.title}</p>
            <p className="text-muted-foreground text-sm">{p.body}</p>
          </div>
        ))}
      </section>
    </>
  );
}
