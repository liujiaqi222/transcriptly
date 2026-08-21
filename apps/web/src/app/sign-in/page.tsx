import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { SignInButtons } from "./sign-in-buttons";

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/saved");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-20">
      <a
        className="text-sm font-bold tracking-[-0.02em] text-zinc-950"
        href="/"
      >
        Transcriptly
      </a>
      <p className="mt-12 text-xs font-semibold tracking-[0.16em] text-zinc-500 uppercase">
        Saved transcripts
      </p>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.05em] text-zinc-950">
        Sign in to your transcripts.
      </h1>
      <p className="mt-4 text-base leading-7 text-zinc-600">
        Your cloud captures are private to your account. Local Markdown saves
        remain available without signing in.
      </p>
      <SignInButtons />
      <p className="mt-6 text-xs leading-5 text-zinc-500">
        Sign in with a verified Google or GitHub account. Transcriptly never
        sends provider tokens to the browser.
      </p>
    </main>
  );
}
