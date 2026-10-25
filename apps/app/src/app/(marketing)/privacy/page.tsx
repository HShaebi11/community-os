import type { Metadata } from "next";
import { Kicker } from "@/components/kicker";

export const metadata: Metadata = { title: "Privacy" };

const POINTS = [
  {
    title: "What it stores",
    body: "Workspaces and the chat exports you import — stored in your Postgres and used only to build your community's memory. There are no accounts, passwords, or user records; self-hosted data never leaves your deployment.",
  },
  {
    title: "Chat stays private",
    body: "Imported messages are evidence for extraction. They are never shown on public pages and never posted back to your chat.",
  },
  {
    title: "Public means opted-in",
    body: "Public pages (/c, /e, /m) only display content a lead published and members opted into. Nothing is public by default.",
  },
  {
    title: "No tracking",
    body: "The software ships with no analytics, telemetry, or email delivery. What you self-host is what it does — the source is the spec.",
  },
  {
    title: "Delete your data",
    body: "Your workspaces live in one database you can export (GET /v1/workspaces/:id/export) or drop at any time. You hold the database; you hold the data.",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <section className="pt-16 pb-8">
        <Kicker>privacy</Kicker>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Privacy, in plain language.</h1>
        <p className="text-muted-foreground max-w-lg text-sm">Short version: your chat is evidence, not content.</p>
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
