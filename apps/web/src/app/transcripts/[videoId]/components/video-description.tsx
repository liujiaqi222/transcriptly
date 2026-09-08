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
    <div className="mt-8 mb-0 max-w-[68ch]">
      <p
        className={`m-0 break-words text-lg leading-[1.7] whitespace-pre-line text-[#64748b] ${expanded ? "" : "line-clamp-3"}`}
        ref={paragraphRef}
      >
        {description}
      </p>
      {overflowing ? (
        <button
          aria-expanded={expanded}
          className="mt-2 inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-sm font-bold text-[#0872b9] transition-colors hover:text-[#202124] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#1b90ed]/40"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDown
            aria-hidden="true"
            className={
              expanded
                ? "rotate-180 transition-transform"
                : "transition-transform"
            }
            size={14}
          />
        </button>
      ) : null}
    </div>
  );
}
