import { parseVideoId } from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";
import { useCallback, useEffect, useState } from "react";
import type { SaveState } from "@/entrypoints/popup/components";
import {
  errorDetailIncludes,
  errorMessage,
  isBatchSourceUrl,
  isChannelRootUrl,
  isYouTubeWatchUrl,
  watchPlaylistUrl,
} from "@/entrypoints/popup/utils";
import { suggestedMarkdownFilename } from "@/local-save";
import type { PopupDependencies } from "../app";

export type CaptureState =
  | { status: "capturing" }
  | { status: "ready"; capture: Capture }
  | { status: "error"; message: string };

/** Playlist-page jump target on a watch page inside a playlist (#69). */
export interface PlaylistTarget {
  tabId: number;
  url: string;
}

/** Batch-source page state: on-demand selection (#56). */
export type BatchPage = "selection" | "hint";

/** Everything the popup knows about the active tab and its capture:
 *  the result, the filename/edit state, the save outcome, and the
 *  batch/playlist jump targets discovered on the page. */
export function useActiveCapture(deps: PopupDependencies) {
  const [captureState, setCaptureState] = useState<CaptureState>({
    status: "capturing",
  });
  const [activeVideoId, setActiveVideoId] = useState<string | undefined>();
  const [filename, setFilename] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [batchSource, setBatchSource] = useState(false);
  const [batchPage, setBatchPage] = useState<BatchPage | undefined>();
  const [batchTabId, setBatchTabId] = useState<number | undefined>();
  const [batchTabUrl, setBatchTabUrl] = useState<string | undefined>();
  const [playlistTarget, setPlaylistTarget] = useState<
    PlaylistTarget | undefined
  >();

  const runCapture = useCallback(async () => {
    setCaptureState({ status: "capturing" });
    setSaveState({ status: "idle" });
    setBatchSource(false);
    setBatchPage(undefined);
    setBatchTabUrl(undefined);
    setPlaylistTarget(undefined);
    try {
      const tab = await deps.getActiveTab();
      if (!tab) {
        setCaptureState({
          status: "error",
          message: "No active tab found. Open a YouTube video and try again.",
        });
        return;
      }
      if (tab.id === undefined || !isYouTubeWatchUrl(tab.url)) {
        if (tab.id !== undefined && isBatchSourceUrl(tab.url)) {
          // Batch pages keep the folder picker available (#26): it is the
          // only place the user can re-grant folder access for the worker.
          // Selection itself is injected on demand from here (#56); the
          // channel root only hints at its Videos tab.
          setBatchTabId(tab.id);
          setBatchTabUrl(tab.url);
          setBatchPage(isChannelRootUrl(tab.url) ? "hint" : "selection");
          setBatchSource(true);
          setCaptureState({ status: "capturing" });
          return;
        }
        setCaptureState({
          status: "error",
          message:
            "Transcriptly works on YouTube watch pages. Open a YouTube video and try again.",
        });
        return;
      }

      setActiveVideoId(
        tab.url ? (parseVideoId(tab.url) ?? undefined) : undefined,
      );

      // A watch page playing inside a playlist (#69): remember the pure
      // playlist page so the hint strip can offer the batch jump. Capture
      // continues regardless - single-video saving still works here.
      const playlistPage = watchPlaylistUrl(tab.url);
      if (playlistPage) {
        setPlaylistTarget({ tabId: tab.id, url: playlistPage });
      }

      const response = await deps.requestCapture(tab.id);
      if (!response.ok) {
        setCaptureState({ status: "error", message: response.message });
        return;
      }
      if (response.capture.segments.length === 0) {
        setCaptureState({
          status: "error",
          message: "No transcript found on this video.",
        });
        return;
      }

      setFilename(suggestedMarkdownFilename(response.capture));
      setCaptureState({ status: "ready", capture: response.capture });
    } catch (error) {
      setCaptureState({
        status: "error",
        message: errorDetailIncludes(error, "Receiving end does not exist")
          ? "Could not reach the transcript capture script. Reload the YouTube page and try again."
          : `Could not capture this page: ${errorMessage(error)}`,
      });
    }
  }, [deps]);

  useEffect(() => {
    void runCapture();
  }, [runCapture]);

  return {
    captureState,
    activeVideoId,
    filename,
    setFilename,
    saveState,
    setSaveState,
    batchSource,
    batchPage,
    batchTabId,
    batchTabUrl,
    playlistTarget,
    runCapture,
  };
}

export type ActiveCapture = ReturnType<typeof useActiveCapture>;
