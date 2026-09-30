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
          aria-label={
            expanded ? "Show less description" : "Show more description"
          }
          className="mt-1.5 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-[#64748b] transition-colors hover:bg-[#edf7ff] hover:text-[#0872b9] focus-visible:outline-[2px] focus-visible:outline-offset-2 focus-visible:outline-[#1b90ed]/40"
          onClick={() => setExpanded((value) => !value)}
          title={expanded ? "Show less" : "Show more"}
          type="button"
        >
          <ChevronDown
            aria-hidden="true"
            className={
              expanded
                ? "rotate-180 transition-transform duration-200"
                : "transition-transform duration-200"
            }
            size={16}
          />
        </button>
      ) : null}
    </div>
  );
}
