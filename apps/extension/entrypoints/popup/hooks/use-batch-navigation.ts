import { useCallback, useState } from "react";
import {
  channelVideosUrl,
  errorDetailIncludes,
  errorMessage,
} from "@/entrypoints/popup/utils";
import type { PopupDependencies } from "../app";
import type { PlaylistTarget } from "./use-active-capture";

/** Where the navigation actions can jump, taken from the active-capture
 *  hook: the batch source tab and the playlist jump target. */
export interface BatchNavigationSource {
  batchTabId?: number;
  batchTabUrl?: string;
  playlistTarget?: PlaylistTarget;
}

/** Same-tab jumps out of the popup: entering batch selection (#56),
 *  the channel-root Videos tab (#56), and the pure playlist page (#69).
 *  Successful jumps close the popup because its capture state belongs
 *  to the old page. */
export function useBatchNavigation(
  deps: PopupDependencies,
  source: BatchNavigationSource,
) {
  const [enteringSelection, setEnteringSelection] = useState(false);
  const [openingVideos, setOpeningVideos] = useState(false);
  const [batchError, setBatchError] = useState<string | undefined>();
  const [openingPlaylist, setOpeningPlaylist] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | undefined>();

  const resetErrors = useCallback(() => {
    setBatchError(undefined);
    setPlaylistError(undefined);
  }, []);

  const enterSelection = useCallback(async () => {
    if (source.batchTabId === undefined) return;
    setEnteringSelection(true);
    try {
      const result = await deps.enterBatchSelection(source.batchTabId);
      if (result.ok) {
        // Selection mode is on: get out of the way so the checkboxes are
        // visible immediately.
        deps.closePopup();
        return;
      }
      setBatchError(result.message);
    } catch (error) {
      setBatchError(
        errorDetailIncludes(error, "Receiving end does not exist")
          ? "Could not reach the page. Reload the YouTube page and try again."
          : errorMessage(error),
      );
    } finally {
      setEnteringSelection(false);
    }
  }, [source.batchTabId, deps]);

  const openChannelVideos = useCallback(async () => {
    const videosUrl = source.batchTabUrl
      ? channelVideosUrl(source.batchTabUrl)
      : undefined;
    if (source.batchTabId === undefined || !videosUrl) {
      setBatchError("Could not find this channel's Videos tab.");
      return;
    }
    setOpeningVideos(true);
    setBatchError(undefined);
    try {
      await deps.navigateTab(source.batchTabId, videosUrl);
      deps.closePopup();
    } catch (error) {
      setBatchError(`Could not open the Videos tab: ${errorMessage(error)}`);
      setOpeningVideos(false);
    }
  }, [source.batchTabId, source.batchTabUrl, deps]);

  // Same-tab jump as the channel-root Videos hint (#69): the popup closes
  // after navigating because its capture state belongs to the old page.
  const openPlaylist = useCallback(async () => {
    if (!source.playlistTarget) return;
    setOpeningPlaylist(true);
    setPlaylistError(undefined);
    try {
      await deps.navigateTab(
        source.playlistTarget.tabId,
        source.playlistTarget.url,
      );
      deps.closePopup();
    } catch (error) {
      setPlaylistError(`Could not open the playlist: ${errorMessage(error)}`);
      setOpeningPlaylist(false);
    }
  }, [source.playlistTarget, deps]);

  return {
    enteringSelection,
    batchError,
    enterSelection,
    openingVideos,
    openChannelVideos,
    openingPlaylist,
    playlistError,
    openPlaylist,
    resetErrors,
  };
}

export type BatchNavigation = ReturnType<typeof useBatchNavigation>;
