import { formatTimestamp } from "@/lib/captures/transcript";
import type { PublicTranscriptSummary } from "@/lib/publications/queries";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * One row of the public transcript lists: thumbnail, title, channel, duration,
 * and publication date (#96). Segment counts are deliberately not shown.
 */
export function TranscriptListItem({
  item,
}: {
  item: Pick<
    PublicTranscriptSummary,
    | "videoId"
    | "title"
    | "channelName"
    | "channelHandle"
    | "channelSlug"
    | "durationSeconds"
    | "publishedAt"
  >;
}) {
  return (
    <li className="border-t border-[#e2e8f0] first:border-t-0">
      <a
        className="grid grid-cols-[168px_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-[10px] py-4 no-underline hover:bg-[#edf7ff] focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40 max-sm:grid-cols-[112px_minmax(0,1fr)] max-sm:gap-x-3"
        href={`/transcripts/${item.videoId}`}
      >
        {/* biome-ignore lint/performance/noImgElement: YouTube thumbnails are remote page imagery, not layout assets. */}
        <img
          alt=""
          className="h-[94px] w-[168px] rounded-lg object-cover max-sm:h-[63px] max-sm:w-[112px]"
          height="94"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={`https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`}
          width="168"
        />
        <div className="min-w-0">
          <strong className="block truncate text-base leading-6 text-[#202124]">
            {item.title}
          </strong>
          {item.channelSlug ? (
            <a
              className="mt-1 inline-block font-mono text-xs font-medium text-[#0872b9] underline-offset-4"
              href={`/channels/${item.channelSlug}`}
            >
              {item.channelName}
            </a>
          ) : (
            <span className="mt-1 block font-mono text-xs text-[#64748b]">
              {item.channelName ?? "Unknown channel"}
            </span>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-[#64748b] tabular-nums">
            <span>
              {item.durationSeconds !== null
                ? formatTimestamp(item.durationSeconds)
                : "duration unknown"}
            </span>
            {item.publishedAt ? (
              <span>{dateFormatter.format(item.publishedAt)}</span>
            ) : null}
          </div>
        </div>
      </a>
    </li>
  );
}
