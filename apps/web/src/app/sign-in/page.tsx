import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { displayFace, monoLabel } from "@/components/landing/shared";
import { SiteHeader } from "@/components/site-header";
import { auth } from "@/lib/auth/auth";
import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { SignInButtons } from "./sign-in-buttons";

export const metadata: Metadata = {
  title: "Sign in - Transcriptly",
  description: "Sign in to contribute transcripts to the public archive.",
  robots: { index: false, follow: true },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string }>;
}) {
  const [{ callbackURL: rawCallbackURL }, session] = await Promise.all([
    searchParams,
    auth.api.getSession({ headers: await headers() }),
  ]);
  const callbackURL = safeCallbackUrl(rawCallbackURL);
  if (session) {
    redirect(callbackURL);
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#fffdf8] font-sans text-[#202124]">
      <SiteHeader />
      <div className="mx-auto flex w-[min(440px,calc(100%-48px))] flex-1 flex-col justify-center py-16 max-sm:w-[calc(100%-32px)]">
        <div className="rounded-2xl border border-[#e2e8f0] bg-white p-8 max-sm:p-6">
          <p className={`${monoLabel} m-0 text-[#0872b9]`}>
            Public contributions
          </p>
          <h1
            className={`${displayFace} mt-3 mb-0 text-[clamp(28px,4vw,36px)] leading-[1.1]`}
          >
            Sign in to contribute.
          </h1>
          <p className="mt-4 mb-0 text-sm leading-[1.7] text-[#64748b]">
            Signing in lets you contribute transcripts to the public archive.
            Your display name and optional avatar are shown with a public
            contribution; your email is never published. Local Markdown saves
            remain available without an account.
          </p>
          <SignInButtons callbackURL={callbackURL} />
          <p className="mt-6 mb-0 border-t border-[#e2e8f0] pt-4 text-xs leading-5 text-[#94a3b8]">
            Sign in with a verified Google or GitHub account. Transcriptly never
            sends provider tokens to the browser.
          </p>
        </div>
      </div>
    </main>
  );
}
