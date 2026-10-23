import type { Metadata } from "next";
import { MarketingChrome } from "@/components/marketing/marketing-chrome";

export const metadata: Metadata = {
  title: {
    default: "Community OS — your community, remembered",
    template: "%s · community-os",
  },
  description:
    "The operating system for a community: import the chat, remember the people, propose events, own the guest list. API-first, open source.",
  openGraph: {
    title: "community-os",
    description: "The operating system for a community. API-first, open source.",
    type: "website",
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingChrome>{children}</MarketingChrome>;
}
