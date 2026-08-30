import type { Metadata } from "next";
import { focusRing } from "@/components/landing/shared";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Privacy Policy - Transcriptly",
  description:
    "What Transcriptly processes locally, what is stored when you sign in, and what is uploaded only when you choose to contribute publicly.",
  alternates: { canonical: "/privacy" },
};

const CONTACT_EMAIL = "z473487465@gmail.com";

/** Section heading in the serif display face, mirroring landing typography. */
function PolicySection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2
        className="font-serif font-semibold tracking-[-0.02em] text-3xl text-[#202124]"
        id={id}
      >
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-[15px] leading-[1.75] text-[#64748b]">
        {children}
      </div>
    </section>
  );
}

function DataList({ items }: { items: string[] }) {
  return (
    <ul className="m-0 ml-5 list-disc space-y-1.5 pl-0">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-5 m-0 rounded-xl border border-[#e2e8f0] bg-[#edf7ff] p-4 text-[15px] leading-[1.7] text-[#202124]">
      {children}
    </p>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#fffdf8] font-sans text-[#202124]">
      <SiteHeader />

      <div className="mx-auto  px-5 w-[min(820px,calc(100%-48px))] py-18 pb-28 max-sm:w-[calc(100%-32px)] max-sm:py-12 max-sm:pb-20">
        <p className="m-0 font-mono text-xs font-medium tracking-[0.16em] text-[#0872b9] uppercase">
          Privacy Policy
        </p>
        <h1 className="mt-4 mb-3 font-serif font-semibold text-[clamp(34px,5vw,48px)] leading-[1.05] tracking-[-0.03em] text-balance">
          Local Markdown first. Public archive only when you choose.
        </h1>
        <p className="m-0 mb-5 text-sm font-medium text-[#94a3b8]">
          Effective date: August 2026
        </p>
        <p className="m-0 max-w-[56ch] text-lg leading-[1.65] text-[#64748b]">
          Transcriptly is a browser extension that captures YouTube transcripts
          and saves them as Markdown files on your device. This policy explains
          what is processed locally, what is stored when you sign in, and what
          is uploaded only when you explicitly choose to contribute publicly.
        </p>

        <PolicySection
          id="local-processing"
          title="1. Data processed locally (no sign-in)"
        >
          <p className="m-0">
            Even without signing in, the extension processes the following data
            on your device to capture and save transcripts:
          </p>
          <DataList
            items={[
              "The URL of the current YouTube page",
              "Video ID, title, channel, description, publication date, and duration",
              "Transcript segments and chapters",
              "Capture time",
              "Markdown formatting preferences",
              "Authorized folder handles (for saving files)",
              "Local save receipts",
              "Batch jobs and their status",
              "Public contribution preferences and the pending queue",
            ]}
          />
          <Note>
            Transcripts saved locally are <strong>never</strong> uploaded to
            Transcriptly servers. Local saves stay on your device.
          </Note>
        </PolicySection>

        <PolicySection
          id="signed-in"
          title="2. Data processed when you sign in"
        >
          <p className="m-0">
            When you sign in, we store the following account data:
          </p>
          <DataList
            items={[
              "OAuth provider (Google or GitHub)",
              "Email address",
              "Display name",
              "Optional avatar",
              "Session cookie",
              "Account and contribution relationships",
            ]}
          />
        </PolicySection>

        <PolicySection
          id="public-contribution"
          title="3. Data uploaded when you contribute publicly"
        >
          <p className="m-0">
            Uploading happens <strong>only</strong> when you explicitly choose
            "Public contribution" for a capture. In that case, the following is
            uploaded:
          </p>
          <DataList
            items={[
              "YouTube canonical URL and video ID",
              "Video title, channel, description, publication date, and duration",
              "Transcript, chapters, and capture time",
              "Display name and optional avatar",
              "Contribution record",
            ]}
          />
          <DataList
            items={[
              "Your email address is never published or shown publicly.",
              "Uploads only happen when you explicitly choose Public contribution.",
              "Local Save and Public contribution are independent destinations - one never implies the other.",
              "You can withdraw contributions at any time at /contributions.",
              "If the last contributor of a transcript withdraws, the transcript is unpublished and deleted in the current implementation.",
            ]}
          />
        </PolicySection>

        <PolicySection
          id="third-parties"
          title="4. Third parties and use of data"
        >
          <DataList
            items={[
              "Google and GitHub are used for identity authentication.",
              "YouTube is the content source - the extension reads transcripts from YouTube pages you visit.",
              "We do not sell your data.",
              "We do not use your data for advertising profiling.",
              "We do not use transcripts or user data to train models, and we never will.",
              "We do not use your data for analytics, credit scoring, or any purpose unrelated to the extension's single purpose of capturing YouTube transcripts.",
            ]}
          />
        </PolicySection>

        <PolicySection
          id="retention-deletion"
          title="5. Retention and deletion"
        >
          <DataList
            items={[
              "Local jobs, queues, and receipts are kept on your device until you manually clear them.",
              "Signed-in account data (email, display name, avatar, contribution relationships) is retained until you request account deletion.",
              "Public contributions can be withdrawn at any time at /contributions. After withdrawal, your contribution record and association with the video are removed.",
              "If the last contributor of a transcript withdraws, the transcript is unpublished and deleted.",
            ]}
          />
          <Note>
            To request deletion of your entire account (including account data
            and contribution relationships), email us at{" "}
            <a
              className={`font-bold text-[#0872b9] underline-offset-4 hover:underline ${focusRing}`}
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>{" "}
            and we will process your request.
          </Note>
        </PolicySection>

        <PolicySection id="children" title="Children">
          <p className="m-0">
            Transcriptly is not directed at children under 13, and we do not
            knowingly collect personal information from children under 13.
          </p>
        </PolicySection>

        <PolicySection id="changes" title="Policy changes">
          <p className="m-0">
            If we change this policy materially, we will update this page and
            update the effective date above. Continued use of the extension
            after changes means you accept the updated policy.
          </p>
        </PolicySection>

        <PolicySection id="contact" title="Contact">
          <p className="m-0">
            For any privacy question, data request, or account deletion request,
            contact us at{" "}
            <a
              className={`font-bold text-[#0872b9] underline-offset-4 hover:underline ${focusRing}`}
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </PolicySection>
      </div>
    </main>
  );
}
