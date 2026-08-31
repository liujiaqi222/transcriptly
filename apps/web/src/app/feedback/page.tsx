import type { Metadata } from "next";
import { Suspense } from "react";
import { displayFace, monoLabel } from "@/components/landing/shared";
import { SiteHeader } from "@/components/site-header";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = {
  title: "Feedback - Transcriptly",
  description: "Tell us what you think about Transcriptly.",
  alternates: { canonical: "/feedback" },
};

export default function FeedbackPage() {
  return (
    <main className="min-h-screen bg-[#fffdf8] font-sans text-[#202124]">
      <SiteHeader />
      <div className="mx-auto w-[min(680px,calc(100%-48px))] py-12 pb-24 max-sm:w-[calc(100%-32px)] max-sm:py-8">
        <p className={`${monoLabel} text-[#0872b9]`}>A quick question</p>
        <h1
          className={`${displayFace} mt-4 text-[clamp(32px,4vw,44px)] leading-[1.05]`}
        >
          What could we have done better?
        </h1>
        <p className="mt-5 max-w-[52ch] text-[15px] leading-[1.75] text-[#64748b]">
          We are sorry to see you go. A minute of honest feedback helps us
          understand what did not work for you.
        </p>
        <div className="mt-8">
          <Suspense
            fallback={
              <div className="h-[560px] border border-[#e2e8f0] bg-white" />
            }
          >
            <FeedbackForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs leading-5 text-[#94a3b8]">
          Your feedback is stored privately and is never published.
        </p>
      </div>
    </main>
  );
}
