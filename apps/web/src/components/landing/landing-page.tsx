import type { PublicTranscriptSummary } from "@/lib/publications/queries";
import type { SearchResult } from "@/lib/search/search";
import { ArchiveSection } from "./archive-section";
import {
  BatchSection,
  FinalCtaSection,
  HeroSection,
  LandingFooter,
  LandingHeader,
  LocalFirstSection,
  OpenSourceStrip,
} from "./sections";

export function LandingPage({
  signedIn,
  query,
  publicItems,
  search,
}: {
  signedIn: boolean;
  query: string;
  publicItems: PublicTranscriptSummary[];
  search: SearchResult | null;
}) {
  return (
    <main className="min-w-0 overflow-clip bg-[#fffdf8] text-[#202124] selection:bg-[#f5c451] selection:text-[#202124]">
      <LandingHeader signedIn={signedIn} />
      <HeroSection />
      <BatchSection />
      <LocalFirstSection />
      <ArchiveSection query={query} publicItems={publicItems} search={search} />
      <OpenSourceStrip />
      <FinalCtaSection />
      <LandingFooter />
    </main>
  );
}
