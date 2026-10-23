import type { Metadata } from "next";
import { Kicker } from "@/components/kicker";

export const metadata: Metadata = { title: "Privacy" };

const POINTS = [
  {
    title: "What we store",
    body: "Your account (name, email, hashed password or OAuth identity), your workspaces, and the chat exports you import — stored in Postgres and used only to build your community's memory.",
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
    title: "Email delivery",
    body: "Sign-in links, invitations and reset links are sent through the configured email provider (Resend). Without one, links appear in a dev outbox instead.",
  },
  {
    title: "Beta status",
    body: "This is a beta. We aim for the behavior described here but make no guarantees about availability or retention yet. Self-host if you need full control.",
  },
  {
    title: "Delete your data",
    body: "Your workspaces live in one database you can export or drop at any time. Contact the maintainer of your hosted instance for account deletion.",
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
