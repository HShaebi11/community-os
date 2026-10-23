import type { Metadata } from "next";
import { Kicker } from "@/components/kicker";

export const metadata: Metadata = { title: "Terms" };

const POINTS = [
  {
    title: "Beta software",
    body: "The hosted instance is a beta provided as-is, without warranties or SLAs. The software itself is MIT licensed — your best guarantee is the source.",
  },
  {
    title: "Your content",
    body: "You retain ownership of everything you import and create. You are responsible for having the right to import chat exports — only do so for chats and communities you administer.",
  },
  {
    title: "Acceptable use",
    body: "Don't use the product to spam, scrape, or build profiles of people without a legitimate community purpose. API tokens act as you — keep them secret and revoke them if exposed.",
  },
  {
    title: "No liability for generated drafts",
    body: "Extraction, proposals and drafts are suggestions. Review before you send or publish — you are the human in the loop.",
  },
  {
    title: "Changes",
    body: "The product and these terms may change while in beta. Continued use after changes means acceptance.",
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
