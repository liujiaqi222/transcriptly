"use client";

import Link from "next/link";
import {
  Brand,
  CtaPair,
  focusRing,
  pageWidth,
} from "@/components/landing/shared";
import { MobileSiteMenu } from "@/components/site-header";

export function LandingHeader({
  user,
}: {
  user: { name: string; image: string | null } | null;
}) {
  const accountLink = user
    ? { href: "/contributions", label: "My contributions" }
    : {
        href: "/sign-in?callbackURL=%2Fcontributions",
        label: "Sign in",
      };

  return (
    <header className="sticky top-0 z-40 border-b border-[#e2e8f0] bg-[#fffdf8]/90 backdrop-blur-sm">
      <div
        className={`${pageWidth} flex min-h-16 items-center gap-8 max-sm:gap-3`}
      >
        <Brand />
        <nav
          aria-label="Primary"
          className="ml-4 hidden items-center gap-6 lg:flex"
        >
          <a
            className={`text-sm font-medium text-[#64748b] hover:text-[#202124] ${focusRing}`}
            href="#capture"
          >
            Capture
          </a>
          <a
            className={`text-sm font-medium text-[#64748b] hover:text-[#202124] ${focusRing}`}
            href="#batch"
          >
            Batch
          </a>
          <a
            className={`text-sm font-medium text-[#64748b] hover:text-[#202124] ${focusRing}`}
            href="#local"
          >
            Local Markdown
          </a>
          <a
            className={`text-sm font-medium text-[#64748b] hover:text-[#202124] ${focusRing}`}
            href="#archive"
          >
            Archive
          </a>
          <Link
            className={`text-sm font-bold text-[#0872b9] hover:text-[#202124] ${focusRing}`}
            href="/transcripts"
          >
            Transcripts
          </Link>
        </nav>
        <nav
          className="ml-auto hidden items-center gap-5 sm:flex max-lg:gap-3"
          aria-label="Account"
        >
          {user ? (
            <Link
              aria-label="My contributions"
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border border-[#e2e8f0] bg-white py-1 pr-3 pl-1 text-sm font-bold text-[#202124] transition-colors hover:border-[#cbd5e1] ${focusRing}`}
              href="/contributions"
            >
              {user.image ? (
                // biome-ignore lint/performance/noImgElement: remote account avatar, not page imagery.
                <img
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                  height="32"
                  referrerPolicy="no-referrer"
                  src={user.image}
                  width="32"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 place-items-center rounded-full bg-[#edf7ff] text-sm font-bold text-[#0872b9]"
                >
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="max-w-[20ch] truncate max-lg:hidden">
                {user.name}
              </span>
            </Link>
          ) : (
            <Link
              className={`text-sm font-bold text-[#0872b9] underline-offset-4 hover:underline ${focusRing}`}
              href="/sign-in?callbackURL=%2Fcontributions"
            >
              Sign in
            </Link>
          )}
          <CtaPair compact />
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:hidden">
          <CtaPair compact mobile />
          <MobileSiteMenu accountLink={accountLink} />
        </div>
      </div>
    </header>
  );
}
