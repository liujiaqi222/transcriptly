"use client";

import { ArrowUp, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranscriptPlayer } from "./transcript-player-context";

interface YouTubePlayerProps {
  videoId: string;
  title: string;
  initialStart?: number;
}

export function YouTubePlayer({
  videoId,
  title,
  initialStart,
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { registerController } = useTranscriptPlayer();

  const [origin, setOrigin] = useState<string>("");
  const [isIntersecting, setIsIntersecting] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isIframeLoaded, setIsIframeLoaded] = useState(false);

  // Set client-side origin after hydration to avoid SSR mismatch
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const embedUrl = useMemo(() => {
    const params = new URLSearchParams({
      enablejsapi: "1",
      rel: "0",
    });
    if (origin) {
      params.set("origin", origin);
    }
    if (initialStart !== undefined && initialStart > 0) {
      params.set("start", String(Math.floor(initialStart)));
    }
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
  }, [videoId, origin, initialStart]);

  const postCommand = useCallback((func: string, args: unknown[] = []) => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    target.postMessage(
      JSON.stringify({
        event: "command",
        func,
        args,
      }),
      "*",
    );
  }, []);

  const seekTo = useCallback(
    (seconds: number, autoPlay = true) => {
      setHasInteracted(true);
      postCommand("seekTo", [seconds, true]);
      if (autoPlay) {
        postCommand("playVideo", []);
      }
    },
    [postCommand],
  );

  // Register seekTo implementation with the transcript player context
  useEffect(() => {
    const unregister = registerController({ seekTo });
    return unregister;
  }, [registerController, seekTo]);

  // Track player state messages from YouTube iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      try {
        const payload = JSON.parse(event.data);
        // YouTube API infoDelivery event carries playerState
        // 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
        if (payload?.event === "infoDelivery" && payload?.info) {
          const state = payload.info.playerState;
          if (state === 1) {
            setIsPlaying(true);
            setHasInteracted(true);
          } else if (state === 2 || state === 0) {
            setIsPlaying(false);
          }
        }
      } catch {
        // Not a JSON message or unrelated message; safe to ignore
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Observe when the container is scrolled out of viewport
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      {
        threshold: 0.1,
      },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Mini-player floats when scrolled away, provided the video was played or interacted with,
  // and the user hasn't explicitly dismissed the floating mini-player.
  const isFloating =
    !isIntersecting && (isPlaying || hasInteracted) && !isDismissed;

  const scrollToPlayer = () => {
    containerRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
  };

  return (
    <div
      className="relative aspect-video w-full rounded-2xl bg-[#000]/5"
      ref={containerRef}
    >
      <div
        className={
          isFloating
            ? "fixed right-6 bottom-6 z-40 aspect-video w-72 overflow-hidden rounded-xl border border-[#cbd5e1] bg-black shadow-2xl transition-all duration-300 sm:w-80 md:w-96"
            : "relative h-full w-full overflow-hidden rounded-2xl border border-[#e2e8f0] bg-black shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
        }
      >
        {/* Loading skeleton placeholder */}
        {!isIframeLoaded ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center bg-[#18181b] text-[#71717a]"
          >
            <div className="h-10 w-10 animate-pulse rounded-full bg-[#27272a]" />
          </div>
        ) : null}

        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full border-0"
          loading="lazy"
          onLoad={() => setIsIframeLoaded(true)}
          ref={iframeRef}
          src={embedUrl}
          title={title}
        />

        {/* Floating Mini-player Controls */}
        {isFloating ? (
          <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-lg bg-[#202124]/80 p-1 backdrop-blur-sm">
            <button
              aria-label="Scroll to main video player"
              className="flex h-7 w-7 items-center justify-center rounded-md text-white transition-colors hover:bg-white/20 focus-visible:outline-[2px] focus-visible:outline-[#1b90ed]"
              onClick={scrollToPlayer}
              title="Return to video"
              type="button"
            >
              <ArrowUp size={15} />
            </button>
            <button
              aria-label="Close floating mini player"
              className="flex h-7 w-7 items-center justify-center rounded-md text-white transition-colors hover:bg-white/20 focus-visible:outline-[2px] focus-visible:outline-[#1b90ed]"
              onClick={() => setIsDismissed(true)}
              title="Close mini player"
              type="button"
            >
              <X size={15} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
