import { Check, ChevronRight, FileText, FolderOpen } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  CtaPair,
  displayFace,
  focusRing,
  pageWidth,
  SectionKicker,
} from "@/components/landing/shared";
import { SiteHeader } from "@/components/site-header";

const featurePages = {
  "youtube-playlist-transcript-downloader": {
    label: "Playlist transcripts",
    title: "YouTube Playlist Transcript Downloader",
    description:
      "Download a whole YouTube playlist as timestamped Markdown files. Select the videos you need, choose a folder, and let Transcriptly capture the rest.",
    lead: "Turn a playlist into a local, searchable Markdown library without opening and saving every video by hand.",
    demo: "playlist",
    demoCaption:
      "Real demo: select videos directly on a YouTube playlist, then let the batch manager capture each transcript.",
    steps: [
      [
        "Open a playlist",
        "Visit any YouTube playlist that contains videos with transcripts.",
      ],
      [
        "Select the videos",
        "Start Transcriptly and tick the videos you want. You can load more and select as many as you need.",
      ],
      [
        "Choose your folder",
        "Pick where the Markdown files belong — a project folder, notes folder, or your Obsidian vault.",
      ],
      [
        "Run the batch",
        "Transcriptly opens each selected video, captures its transcript, and saves one Markdown file per video.",
      ],
    ],
    faqs: [
      [
        "Is there a playlist size limit?",
        "Transcriptly does not impose a hard video limit. For a large batch, keep the browser window in the foreground while it processes the queue.",
      ],
      [
        "What happens when a video has no transcript?",
        "Transcriptly can only capture transcripts available on YouTube. The batch manager shows the result for each video, and failed work can be retried without restarting the queue.",
      ],
      [
        "Can I pause a batch?",
        "Yes. Pause the queue at any time, then resume it when you are ready. You can also retry failed items individually.",
      ],
      [
        "How are playlist files named?",
        "Each selected video is saved as its own Markdown file in the folder you choose, using a filename based on the video title.",
      ],
    ],
  },
  "youtube-channel-transcript-downloader": {
    label: "Channel transcripts",
    title: "YouTube Channel Transcript Downloader",
    description:
      "Download transcripts from a YouTube channel as timestamped Markdown. Choose videos from a channel's Videos tab and batch-capture them into your local knowledge base.",
    lead: "Research a creator's back catalog, build a reading queue, or keep a channel's best videos in one local Markdown collection.",
    demo: "channel",
    demoCaption:
      "Real demo: Transcriptly adds selection controls to a YouTube channel's Videos tab only when you start a batch.",
    steps: [
      [
        "Open the channel's Videos tab",
        "Go to the YouTube channel you want to research and choose Videos.",
      ],
      [
        "Start selecting",
        "Use Transcriptly to select individual videos, load more results, or build a larger collection.",
      ],
      [
        "Start batch capture",
        "Confirm your local destination and start the queue. Progress remains visible in the batch manager.",
      ],
      [
        "Keep the files",
        "Every capture lands as portable Markdown that works with your existing notes and tools.",
      ],
    ],
    faqs: [
      [
        "Can I choose only some channel videos?",
        "Yes. Selection is explicit: tick the videos you want, load more results if needed, then start the batch.",
      ],
      [
        "Does Transcriptly download videos or audio?",
        "No. It captures the transcript text already available on YouTube and writes Markdown files. It does not download video or audio.",
      ],
      [
        "Can I load more channel videos before choosing?",
        "Yes. Load more videos on the channel's Videos tab, then continue selecting. Transcriptly keeps the selection ready for the batch.",
      ],
      [
        "Can a batch run in the background?",
        "The batch manager tracks the queue, but keep the browser window in the foreground while captures run so YouTube can load each video reliably.",
      ],
    ],
  },
  "youtube-transcript-to-markdown": {
    label: "Markdown export",
    title: "YouTube Transcript to Markdown",
    description:
      "Save any available YouTube transcript as a clean, timestamped Markdown file. Keep timeline links, video metadata, chapters, and a local copy you control.",
    lead: "Capture the transcript from the video you are watching, then save it as Markdown that opens in any editor, works offline, and stays yours.",
    demo: "capture",
    demoCaption:
      "Real demo: the Transcriptly popup previews a transcript on a YouTube watch page before saving it locally.",
    steps: [
      ["Open a YouTube video", "Visit a video with an available transcript."],
      [
        "Open Transcriptly",
        "The extension reads the transcript from the YouTube page and shows a preview before anything is saved.",
      ],
      [
        "Choose a format",
        "Keep every segment in Timeline format, or choose Article format to reflow the same transcript into readable paragraphs.",
      ],
      [
        "Save the Markdown",
        "Name the file and save it in your chosen local folder. No account or export service is required.",
      ],
    ],
    faqs: [
      [
        "What is the difference between Timeline and Article?",
        "Timeline keeps every caption segment as a timestamped list item. Article reflows the same transcript into paragraphs, while preserving timestamp links and chapter boundaries.",
      ],
      [
        "What does the saved file contain?",
        "The Markdown file includes YAML metadata, the title and source link, optional description and chapters, and timestamp links back to YouTube.",
      ],
      [
        "Can I save a video without an available transcript?",
        "No. Transcriptly captures transcript text that YouTube makes available for the video; it does not create a transcript from audio.",
      ],
      [
        "Do I need an account?",
        "No. Saving Markdown locally works without an account. Signing in is only needed if you choose to publish a copy to the public archive.",
      ],
    ],
  },
  "youtube-transcript-for-obsidian": {
    label: "Obsidian workflow",
    title: "YouTube Transcript for Obsidian",
    description:
      "Save YouTube transcripts directly into your Obsidian vault as timestamped Markdown. Transcriptly creates plain files with metadata and links that stay useful outside Obsidian too.",
    lead: "Choose your vault folder once, then turn videos, playlists, and channels into notes you can search, link, tag, and keep offline.",
    demo: "obsidian",
    demoCaption:
      "Real capture interface: Transcriptly saves a standard Markdown file, ready to place in an Obsidian vault or any local folder.",
    steps: [
      [
        "Choose your vault folder",
        "When you first save, select an Obsidian vault or a folder inside it as Transcriptly's local destination.",
      ],
      [
        "Capture a video or batch",
        "Save one video from its watch page, or select videos from a playlist or channel for a batch capture.",
      ],
      [
        "Open the note in Obsidian",
        "The transcript is already a .md file, so Obsidian indexes it with the rest of your vault.",
      ],
      [
        "Follow timestamps when needed",
        "Each timestamp is a Markdown link back to the matching moment in the original YouTube video.",
      ],
    ],
    faqs: [
      [
        "Do I need an Obsidian plugin?",
        "No. Transcriptly writes standard .md files to a folder you choose. Obsidian simply indexes them as part of the vault.",
      ],
      [
        "Will it change my existing notes?",
        "No. Transcriptly only creates the files you explicitly save. It does not alter existing notes, settings, or vault structure.",
      ],
      [
        "Are timestamps clickable in Obsidian?",
        "Yes. Each timestamp is a standard Markdown link to that moment in the original YouTube video.",
      ],
      [
        "Can I use the files outside Obsidian?",
        "Yes. The files are ordinary Markdown, so they also work in VS Code, a Git repository, or any text editor.",
      ],
    ],
  },
} as const;

export type FeatureSlug = keyof typeof featurePages;

export function isFeatureSlug(slug: string): slug is FeatureSlug {
  return slug in featurePages;
}

export function featureMetadata(slug: FeatureSlug): Metadata {
  const page = featurePages[slug];
  return {
    title: `${page.title} — Transcriptly`,
    description: page.description,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      title: page.title,
      description: page.description,
      type: "website",
      url: `/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
    },
  };
}

function FeatureDemo({
  demo,
  caption,
}: {
  demo: (typeof featurePages)[FeatureSlug]["demo"];
  caption: string;
}) {
  const media =
    demo === "playlist" ? (
      <video
        autoPlay
        className="block h-auto w-full"
        loop
        muted
        playsInline
        preload="metadata"
      >
        <source src="/images/batch-select.mp4" type="video/mp4" />
        Your browser does not support the video demonstration.
      </video>
    ) : demo === "channel" ? (
      <Image
        alt="Transcriptly selection controls on a YouTube channel Videos page"
        className="h-auto w-full"
        height={540}
        priority
        sizes="(max-width: 768px) 100vw, 58vw"
        src="/images/batch-select.gif"
        unoptimized
        width={960}
      />
    ) : demo === "capture" ? (
      <Image
        alt="Transcriptly popup previewing a YouTube transcript with timestamps and a Save button"
        className="h-auto w-full"
        height={1080}
        priority
        sizes="(max-width: 768px) 100vw, 58vw"
        src="/images/capture-popup-iphone.png"
        width={1920}
      />
    ) : (
      <Image
        alt="Transcriptly's real Markdown capture interface"
        className="h-auto w-full"
        height={800}
        priority
        sizes="(max-width: 768px) 100vw, 58vw"
        src="/images/store-capture.png"
        width={1280}
      />
    );

  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white">
      <div className="border-b border-[#e2e8f0] bg-[#f7f4ec] p-2">{media}</div>
      <figcaption className="px-5 py-4 text-sm leading-relaxed text-[#64748b]">
        {caption}
      </figcaption>
    </figure>
  );
}

export function FeaturePage({ slug }: { slug: FeatureSlug }) {
  const page = featurePages[slug];
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <main className="min-w-0 overflow-clip bg-[#fffdf8] text-[#202124] selection:bg-[#f5c451]">
      <SiteHeader trailing={<CtaPair compact />} />
      <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>

      <section
        className={`${pageWidth} grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center gap-14 py-18 max-lg:grid-cols-1 max-lg:py-14 max-sm:gap-10 max-sm:py-10`}
      >
        <div className="max-w-160">
          <SectionKicker index="Guide" label={page.label} />
          <h1
            className={`${displayFace} m-0 text-[clamp(44px,5.4vw,72px)] leading-[0.98]`}
          >
            {page.title}
          </h1>
          <p className="my-7 max-w-[52ch] text-lg leading-[1.65] text-[#64748b] max-sm:text-base">
            {page.lead}
          </p>
          <CtaPair />
          <p className="mt-5 flex items-center gap-2 font-mono text-xs text-[#64748b]">
            <Check aria-hidden="true" className="size-4 text-[#15803d]" />
            Free local Markdown · no account required
          </p>
        </div>
        <FeatureDemo caption={page.demoCaption} demo={page.demo} />
      </section>

      <section className="border-y border-[#e2e8f0] bg-white py-20 max-sm:py-14">
        <div
          className={`${pageWidth} grid grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] gap-14 max-lg:grid-cols-1 max-sm:gap-10`}
        >
          <div>
            <SectionKicker index="How it works" label="Quick guide" />
            <h2
              className={`${displayFace} m-0 text-[clamp(34px,4.6vw,56px)] leading-[1.02]`}
            >
              From YouTube page to{" "}
              <em className="italic text-[#0872b9]">your folder.</em>
            </h2>
          </div>
          <ol className="m-0 grid list-none gap-0 p-0">
            {page.steps.map(([title, copy], index) => (
              <li
                className="grid grid-cols-[40px_1fr] gap-4 border-t border-[#e2e8f0] py-5 first:border-t-0 first:pt-0"
                key={title}
              >
                <span className="grid size-10 place-items-center rounded-xl bg-[#edf7ff] font-mono text-sm font-bold text-[#0872b9]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="m-0 text-base font-bold">{title}</h3>
                  <p className="mt-1.5 mb-0 text-sm leading-relaxed text-[#64748b]">
                    {copy}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-white py-20 max-sm:py-14">
        <div
          className={`${pageWidth} grid grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] gap-14 max-lg:grid-cols-1 max-sm:gap-10`}
        >
          <div>
            <SectionKicker index="FAQ" label="Before you install" />
            <h2
              className={`${displayFace} m-0 text-[clamp(34px,4.6vw,56px)] leading-[1.02]`}
            >
              Common questions, answered.
            </h2>
          </div>
          <div className="grid content-start gap-3">
            {page.faqs.map(([question, answer]) => (
              <details
                className="group rounded-xl bg-[#f7f4ec] px-5 py-4 transition-colors hover:bg-[#edf7ff]"
                key={question}
              >
                <summary
                  className={`flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold ${focusRing}`}
                >
                  {question}
                  <ChevronRight
                    aria-hidden="true"
                    className="size-5 shrink-0 text-[#0872b9] transition-transform group-open:rotate-90"
                  />
                </summary>
                <p className="mb-0 mt-3 max-w-[62ch] text-sm leading-relaxed text-[#64748b]">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="grid justify-items-center px-6 py-28 text-center max-sm:py-20">
        <div className="grid max-w-180 justify-items-center">
          <FileText aria-hidden="true" className="mb-5 size-8 text-[#0872b9]" />
          <h2
            className={`${displayFace} m-0 text-[clamp(40px,5.5vw,72px)] leading-[0.98]`}
          >
            Make your next YouTube session{" "}
            <em className="italic text-[#0872b9]">searchable.</em>
          </h2>
          <p className="mt-6 mb-9 max-w-[48ch] text-lg leading-[1.6] text-[#64748b]">
            Install Transcriptly and save the transcripts you want as Markdown
            files you control.
          </p>
          <CtaPair />
        </div>
      </section>

      <footer
        className={`${pageWidth} flex flex-wrap items-center justify-between gap-5 border-t border-[#e2e8f0] py-8 text-sm text-[#64748b]`}
      >
        <span className="flex items-center gap-2">
          <FolderOpen aria-hidden="true" className="size-4" />
          Local Markdown first.
        </span>
        <nav
          aria-label="Related guides"
          className="flex flex-wrap gap-x-5 gap-y-2"
        >
          {Object.entries(featurePages)
            .filter(([otherSlug]) => otherSlug !== slug)
            .map(([otherSlug, other]) => (
              <Link
                className={`font-bold text-[#0872b9] no-underline hover:underline ${focusRing}`}
                href={`/${otherSlug}`}
                key={otherSlug}
              >
                {other.label}
                <span aria-hidden="true"> →</span>
              </Link>
            ))}
        </nav>
      </footer>
    </main>
  );
}
