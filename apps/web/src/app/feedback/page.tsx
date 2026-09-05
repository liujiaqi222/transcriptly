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
      <div className="mx-auto w-[min(560px,calc(100%-48px))] py-8 pb-20 max-sm:w-[calc(100%-32px)]">
        <p className={`${monoLabel} text-[#0872b9]`}>A quick question</p>
        <h1
          className={`${displayFace} mt-3 text-[clamp(28px,4vw,36px)] leading-[1.1]`}
        >
          What could we have done better?
        </h1>
        <p className="mt-3 text-sm leading-[1.7] text-[#64748b]">
          We are sorry to see you go. A minute of honest feedback helps us
          understand what did not work for you.
        </p>
        <div className="mt-6">
          <Suspense
            fallback={
              <div className="h-[400px] rounded-2xl border border-[#e2e8f0] bg-white" />
            }
          >
            <FeedbackForm />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-xs leading-5 text-[#94a3b8]">
          Your feedback is stored privately and is never published.
        </p>
      </div>
    </main>
  );
}
