import { signOut } from "./actions";

/** Shared chrome for the private saved area. */
export function SavedHeader({ email }: { email: string }) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a className="font-bold tracking-[-0.02em]" href="/saved">
          Transcriptly
        </a>
        <div className="flex min-w-0 items-center gap-4">
          <span className="hidden max-w-64 truncate text-sm text-zinc-600 sm:block">
            {email}
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
  );
}
