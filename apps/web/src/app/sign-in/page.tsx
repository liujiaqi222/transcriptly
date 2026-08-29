import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/logo-mark";
import { auth } from "@/lib/auth/auth";
import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { SignInButtons } from "./sign-in-buttons";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-20">
      <a
        className="flex items-center gap-2 text-sm font-bold tracking-[-0.02em] text-zinc-950"
        href="/"
      >
        <LogoMark />
        Transcriptly
      </a>
      <p className="mt-12 text-xs font-semibold tracking-[0.16em] text-zinc-500 uppercase">
        Public contributions
      </p>
      <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.03em] text-zinc-950">
        Sign in to contribute.
      </h1>
      <p className="mt-4 text-base leading-7 text-zinc-600">
        Signing in lets you contribute transcripts to the public archive. Your
        display name and optional avatar are shown with a public contribution;
        your email is never published. Local Markdown saves remain available
        without an account.
      </p>
      <SignInButtons callbackURL={callbackURL} />
      <p className="mt-6 text-xs leading-5 text-zinc-500">
        Sign in with a verified Google or GitHub account. Transcriptly never
        sends provider tokens to the browser.
      </p>
    </main>
  );
}
