"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * The video's description, clamped to a few lines with a show-more toggle
 * when it overflows. YouTube descriptions routinely carry chapter lists and
 * link walls; clamping keeps the reader one click away from the transcript.
 * Overflow is measured in the collapsed state only, so the toggle stays
 * visible after expanding instead of disappearing on the resize.
 */
export function VideoDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const paragraphRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const paragraph = paragraphRef.current;
    if (paragraph === null || expanded) return;
    const checkOverflow = () => {
      setOverflowing(paragraph.scrollHeight > paragraph.clientHeight + 1);
    };
    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <div className="relative mt-8 mb-0 max-w-[68ch]">
      <p
        className={`m-0 break-words text-lg leading-[1.7] whitespace-pre-line text-[#64748b] ${
          expanded ? "" : "line-clamp-3 pr-8"
        }`}
        ref={paragraphRef}
      >
        {description}
        {expanded && overflowing ? (
          <button
            aria-expanded={true}
            aria-label="Show less description"
            className="ml-2 inline-flex h-5 w-5 translate-y-[-1px] cursor-pointer items-center justify-center rounded-full align-middle text-[#64748b] transition-colors hover:bg-[#edf7ff] hover:text-[#0872b9] focus-visible:outline-[2px] focus-visible:outline-offset-2 focus-visible:outline-[#1b90ed]/40"
            onClick={() => setExpanded(false)}
            title="Show less"
            type="button"
          >
            <ChevronDown aria-hidden="true" className="rotate-180" size={15} />
          </button>
        ) : null}
      </p>
      {!expanded && overflowing ? (
        <div className="absolute right-0 bottom-0 flex h-7 items-center bg-gradient-to-l from-[#fffdf8] via-[#fffdf8] pl-6 to-transparent">
          <button
            aria-expanded={false}
            aria-label="Show more description"
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-[#64748b] transition-colors hover:bg-[#edf7ff] hover:text-[#0872b9] focus-visible:outline-[2px] focus-visible:outline-offset-2 focus-visible:outline-[#1b90ed]/40"
            onClick={() => setExpanded(true)}
            title="Show more"
            type="button"
          >
            <ChevronDown aria-hidden="true" size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
