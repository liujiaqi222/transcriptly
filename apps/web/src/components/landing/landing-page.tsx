import type { PublicTranscriptSummary } from "@/lib/publications/queries";
import { ArchiveSection } from "./archive-section";
import { LandingHeader } from "./landing-header";
import {
  BatchSection,
  FinalCtaSection,
  HeroSection,
  LandingFooter,
  LocalMarkdownSection,
  Marquee,
  OpenSourceStrip,
} from "./sections";

export function LandingPage({
  user,
  publicItems,
}: {
  user: { name: string; image: string | null } | null;
  publicItems: PublicTranscriptSummary[];
}) {
  return (
    <main className="min-w-0 overflow-clip bg-[#fffdf8] text-[#202124] selection:bg-[#f5c451] selection:text-[#202124]">
      <LandingHeader user={user} />
      <HeroSection />
      <Marquee />
      <BatchSection />
      <LocalMarkdownSection />
      <ArchiveSection publicItems={publicItems} />
      <OpenSourceStrip />
      <FinalCtaSection />
      <LandingFooter />
    </main>
  );
}
