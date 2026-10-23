import { PublicChrome } from "@/components/public-chrome";

export default function NotFound() {
  return (
    <PublicChrome>
      <h1 className="text-3xl tracking-tight">Not found</h1>
      <p className="text-muted-foreground mt-2">This page is not public, or it does not exist.</p>
    </PublicChrome>
  );
}
