import { MAX_SEARCH_QUERY_LENGTH } from "@/lib/search/search";
import { signOut } from "./actions";

/** Shared chrome for the private saved area, including exact search (#39). */
export function SavedHeader({
  email,
  query,
}: {
  email: string;
  /** Current search term, pre-filled into the search box when present. */
  query?: string;
}) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
        <a
          className="font-bold tracking-[-0.02em] whitespace-nowrap"
          href="/saved"
        >
          Transcriptly
        </a>

        <form
          action="/saved/search"
          className="flex min-w-0 flex-1 justify-center"
          method="GET"
        >
          <div className="flex w-full max-w-md items-center gap-2">
            <label className="sr-only" htmlFor="search-query">
              Search your transcripts
            </label>
            <input
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-2 focus:outline-offset-2 focus:outline-zinc-950"
              defaultValue={query ?? ""}
              id="search-query"
              maxLength={MAX_SEARCH_QUERY_LENGTH}
              name="q"
              placeholder="Search exact words or names"
              type="search"
            />
            <button
              className="shrink-0 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
              type="submit"
            >
              Search
            </button>
          </div>
        </form>

        <div className="flex min-w-0 items-center gap-4">
          <span className="hidden max-w-48 truncate text-sm text-zinc-600 lg:block">
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
