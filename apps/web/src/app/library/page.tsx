import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { signOut } from "./actions";

export default async function LibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in?callbackURL=%2Flibrary");
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <a className="font-bold tracking-[-0.02em]" href="/library">
            Transcriptly
          </a>
          <div className="flex min-w-0 items-center gap-4">
            <span className="hidden max-w-64 truncate text-sm text-zinc-600 sm:block">
              {session.user.email}
            </span>
            <form action={signOut}>
              <button
                className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500 uppercase">
          Private library
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.05em] sm:text-5xl">
          Your transcripts
        </h1>
        <div className="mt-12 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">Your library is empty</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">
            Cloud Save will place captured YouTube transcripts here. Until then,
            keep using Local Save to create ordinary Markdown files.
          </p>
        </div>
      </section>
    </main>
  );
}
