"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo-mark";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const focusRing =
  "focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40";

type NavItem = {
  href: string;
  label: string;
  activePrefixes?: string[];
};

const archiveNav: NavItem[] = [
  {
    href: "/transcripts",
    label: "Transcripts",
    activePrefixes: ["/transcripts"],
  },
  {
    href: "/channels",
    label: "Channels",
    activePrefixes: ["/channels"],
  },
];

function isActive(pathname: string, item: NavItem) {
  return item.activePrefixes?.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function MobileSiteMenu({
  accountLink,
  extraLinks = [],
}: {
  accountLink?: { href: string; label: string };
  extraLinks?: NavItem[];
}) {
  const pathname = usePathname();
  const links: NavItem[] = [
    { href: "/", label: "Home", activePrefixes: ["/"] },
    ...archiveNav,
    ...extraLinks,
    { href: "/privacy", label: "Privacy", activePrefixes: ["/privacy"] },
  ];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          aria-label="Open menu"
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl border border-[#e2e8f0] bg-white text-[#202124] transition-colors hover:border-[#cbd5e1] hover:bg-[#edf7ff]",
            focusRing,
          )}
          type="button"
        >
          <MenuIcon aria-hidden="true" className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle>Explore Transcriptly</SheetTitle>
        <SheetDescription className="mt-2 max-w-[28ch]">
          Capture locally, or browse transcripts people chose to share.
        </SheetDescription>
        <nav aria-label="Mobile" className="mt-10 grid">
          {links.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : isActive(pathname, item);
            return (
              <SheetClose asChild key={item.href}>
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center justify-between border-t border-[#e2e8f0] px-1 text-base font-bold no-underline last:border-b",
                    active
                      ? "text-[#0872b9]"
                      : "text-[#202124] hover:text-[#0872b9]",
                    focusRing,
                  )}
                  href={item.href}
                >
                  {item.label}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full bg-[#1b90ed]"
                    />
                  ) : null}
                </Link>
              </SheetClose>
            );
          })}
        </nav>
        {accountLink ? (
          <SheetClose asChild>
            <Link
              className={cn(
                "mt-auto inline-flex min-h-12 items-center justify-center rounded-xl border border-[#202124] px-4 text-sm font-bold no-underline transition-colors hover:bg-[#202124] hover:text-white",
                focusRing,
              )}
              href={accountLink.href}
            >
              {accountLink.label}
            </Link>
          </SheetClose>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function SiteHeader({ trailing }: { trailing?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#e2e8f0] bg-[#fffdf8]/95 backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 w-[min(1200px,calc(100%-48px))] items-center gap-6 max-sm:w-[calc(100%-32px)]">
        <Link
          aria-label="Transcriptly home"
          className={cn(
            "inline-flex items-center gap-2 text-lg font-extrabold tracking-[-0.03em] no-underline",
            focusRing,
          )}
          href="/"
        >
          <LogoMark size={28} />
          <span>Transcriptly</span>
        </Link>
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          <Link
            className={cn(
              "inline-flex min-h-10 items-center px-2 text-sm font-bold text-[#0872b9] no-underline transition-colors hover:text-[#202124]",
              focusRing,
            )}
            href="/transcripts"
          >
            Transcripts
          </Link>
          {trailing}
        </div>
        <div className="ml-auto flex items-center gap-2 sm:hidden">
          {trailing}
          <MobileSiteMenu />
        </div>
      </div>
    </header>
  );
}
