import type { Metadata } from "next";
import { Kicker } from "@/components/kicker";

export const metadata: Metadata = { title: "About" };

const PRINCIPLES = [
  { title: "The API is the product", body: "Every feature exists in /v1 first. The app and the MCP adapter are clients — anything the UI can do, your agents can do." },
  { title: "No send-to-chat", body: "The product drafts; humans send. Nothing ever writes into your group chat, by design, not by policy." },
  { title: "Evidence over vibes", body: "Every extracted card cites the chat line behind it. Lead edits are never overwritten by a model." },
  { title: "Owned by the community", body: "Your data is plain Postgres. Export it, self-host it, or fork the whole thing — MIT." },
];

export default function AboutPage() {
  return (
    <>
      <section className="pt-16 pb-10">
        <Kicker>about</Kicker>
        <h1 className="mb-4 max-w-2xl text-4xl font-semibold tracking-tight">
          Communities run on memory nobody wrote down.
        </h1>
        <div className="text-muted-foreground max-w-2xl space-y-4 text-sm">
          <p>
            Every community lead keeps a map in their head: who does what, who asked for what, who should meet whom.
            It lives in the scroll of a group chat and evaporates the moment the lead burns out or leaves.
          </p>
          <p>
            Community OS turns that tacit memory into explicit, cited data — and gives it a front door. Import the
            chat, get member cards and demand clusters, approve a proposal pack, publish a native event page, own the
            guest list. The chat stays the chat; the community gains a brain.
          </p>
          <p>
            It started as a hackathon build and grew into a product thesis: the API is the product, and the app —
            like your agents — is just a client.
          </p>
        </div>
      </section>
      <section className="border-border border-t py-12">
        <Kicker>principles</Kicker>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p.title}>
              <p className="mb-1 text-sm font-semibold">{p.title}</p>
              <p className="text-muted-foreground text-sm">{p.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
