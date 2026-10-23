import Link from "next/link";
import { PublicChrome } from "@/components/public-chrome";
import { Button } from "@/components/ui/button";
import { Kicker } from "@/components/kicker";

export default function NotFound() {
  return (
    <PublicChrome>
      <section className="py-20 text-center">
        <Kicker>404</Kicker>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight">Not in memory.</h1>
        <p className="text-muted-foreground mb-6">This page doesn't exist — or isn't public.</p>
        <Button variant="outline" asChild>
          <Link href="/" className="text-foreground no-underline">
            back home
          </Link>
        </Button>
      </section>
    </PublicChrome>
  );
}
