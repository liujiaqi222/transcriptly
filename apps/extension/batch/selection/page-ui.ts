import { isBatchSourceUrl } from "@/batch/selection/discovery";
import { createCardLayer } from "@/batch/selection/selection-cards";
import { createSelectionModel } from "@/batch/selection/selection-model";
import { createSelectionPanel } from "@/batch/selection/selection-panel";
import {
  isChannelRootUrl,
  isYouTubeWatchUrl,
} from "@/entrypoints/popup/utils/youtube";
import {
  BATCH_PREPARE,
  type BatchEnterSelectionStatus,
  type BatchPrepareStatus,
} from "@/shared/messages";

/**
 * On-demand selection mode for playlist / channel /videos pages (#56, #57).
 *
 * Entered only when the popup asks - never auto-injected. The select view
 * is a compact floating toolbar (#57): a live selected-count / ETA counter,
 * Load more (explicit auto-scroll, capped at 10 s per click), Select
 * all / Clear and Continue. Per-card checkboxes
 * ride a ~40 px hit zone whose capture-phase click handler never lets the
 * click reach the card's navigation. Transient messages surface as a
 * bottom-center toast (3 s, latest only) - persistent info (count, ETA and
 * large-batch guidance) stays in the toolbar.
 *
 * Structure: selection-model.ts holds the pure selection state,
 * selection-panel.ts renders the toolbar and toast, selection-cards.ts
 * projects the model onto the feed's cards. This file orchestrates them:
 * entry guards, Load more, the Start flow, cloud gating and the SPA
 * lifecycle.
 *
 * Destination setup, folder access, progress, results and history live on
 * the manager page (#58, #102): Continue persists a selection draft and
 * opens setup without creating a task. On batch source pages the
 * floating capsule (batch/capsule.ts) links back to the manager while a
 * batch runs.
 *
 * Lifecycle: the whole mode is torn down (panel, toast, styles, every
 * checkbox and badge, card markers, observer, listeners) on ✕ / Esc / SPA
 * navigation to a page that is neither a batch source nor a watch page.
 * Watch-page round trips keep the mode and the selection, so returning
 * re-injects the checkboxes over the re-rendered feed.
 */

const LOAD_MORE_TIMEOUT_MS = 10_000;
const LOAD_MORE_SCROLL_INTERVAL_MS = 400;

export interface BatchPageRuntime {
  sendMessage<T = unknown>(message: unknown): Promise<T>;
}

function defaultRuntime(): BatchPageRuntime {
  return {
    sendMessage: (message) => browser.runtime.sendMessage(message),
  };
}

/** Stable identity across a channel root <-> Videos-tab round trip. */
function batchSourceIdentity(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.pathname === "/playlist") {
    return `playlist:${url.searchParams.get("list") ?? ""}`;
  }
  const channelPath = url.pathname
    .replace(/\/videos\/?$/, "")
    .replace(/\/$/, "")
    .toLowerCase();
  return `channel:${channelPath}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Tears down the active selection mode, if one is mounted. */
let activeTeardown: (() => void) | undefined;

export async function enterBatchSelectionMode(
  runtime: BatchPageRuntime = defaultRuntime(),
): Promise<BatchEnterSelectionStatus> {
  // Idempotent: entering an already-active mode changes nothing.
  if (activeTeardown) return { ok: true };
  if (!isBatchSourceUrl(location.href)) {
    return {
      ok: false,
      message:
        "Video selection is only available on playlist and channel Videos pages.",
    };
  }
  // The channel root page renders no video cards; the popup guides the
  // user to its Videos tab instead of injecting anything here.
  if (isChannelRootUrl(location.href)) {
    return {
      ok: false,
      message: "Open this channel's Videos tab to select videos.",
    };
  }

  const model = createSelectionModel();
  let activeBatchSource = batchSourceIdentity(location.href);

  // --- select view state -------------------------------------------------
  let refreshing = false;
  let refreshQueued = false;
  let loadMoreTimer: number | undefined;
  let loadMoreStartedAt = 0;

  const panel = createSelectionPanel({
    onClose: () => teardown(),
    // The second click stops an in-flight load (#57).
    onToggleLoadMore: () => {
      if (loadMoreActive()) stopLoadMore();
      else startLoadMore();
    },
    onSelectAll: () => {
      model.selectAll();
      updateToolbar();
    },
    onClear: () => {
      model.clearSelection();
      updateToolbar();
    },
    onStart: () => void continueToSetup(),
  });

  const cards = createCardLayer({
    model,
    onSelectionChange: updateToolbar,
  });

  function updateToolbar() {
    panel.setCounter(model.counterText());
    panel.setSelectedCount(model.selectedCount());
    cards.sync();
    updateLoadMoreButton();
  }

  function refreshCards() {
    // Defense in depth (#56): never inject outside a batch source page,
    // even if the observer fires after SPA navigation (e.g. the watch
    // page's recommendation feed).
    if (!isBatchSourceUrl(location.href)) return;
    if (refreshing) {
      refreshQueued = true;
      return;
    }
    refreshing = true;
    try {
      cards.refresh();
      updateToolbar();
    } finally {
      refreshing = false;
      if (refreshQueued) {
        refreshQueued = false;
        queueMicrotask(refreshCards);
      }
    }
  }

  function resetForBatchSource(nextSource: string) {
    stopLoadMore();
    model.clear();
    cards.strip();
    activeBatchSource = nextSource;
    updateToolbar();
  }

  // --- Load more: explicit auto-scroll, 10 s hard cap per click -----------
  function loadMoreActive(): boolean {
    return loadMoreTimer !== undefined;
  }

  function stopLoadMore() {
    if (loadMoreTimer === undefined) return;
    clearInterval(loadMoreTimer);
    loadMoreTimer = undefined;
    updateLoadMoreButton();
  }

  function startLoadMore() {
    loadMoreStartedAt = Date.now();
    loadMoreTimer = window.setInterval(() => {
      if (Date.now() - loadMoreStartedAt >= LOAD_MORE_TIMEOUT_MS) {
        stopLoadMore();
        return;
      }
      window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
    }, LOAD_MORE_SCROLL_INTERVAL_MS);
    updateLoadMoreButton();
  }

  function updateLoadMoreButton() {
    panel.setLoadMore(loadMoreActive(), model.videoIds().length);
  }

  // --- continue to Manager setup ----------------------------------------
  async function continueToSetup() {
    const videos = model.checkedVideos();
    if (videos.length === 0) {
      panel.showToast("Select at least one video.");
      return;
    }
    panel.setStarting(true);
    try {
      const result = await runtime.sendMessage<BatchPrepareStatus>({
        type: BATCH_PREPARE,
        videos,
      });
      if (!result.ok) {
        panel.showToast(result.message);
        return;
      }
      model.clearSelection();
      updateToolbar();
    } catch (error) {
      panel.showToast(errorText(error));
    } finally {
      panel.setStarting(false);
    }
  }

  refreshCards();

  // Only react to page mutations outside our own panel.
  const observer = new MutationObserver((mutations) => {
    if (mutations.every((mutation) => panel.contains(mutation.target))) return;
    refreshCards();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Full teardown (#56): panel, toast, styles, every checkbox and badge,
  // card markers, the observer and every listener - zero page residue.
  const teardown = () => {
    stopLoadMore();
    observer.disconnect();
    window.removeEventListener("transcriptly-batch-unmount", teardown);
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("yt-navigate-finish", handleNavigate);
    panel.remove();
    cards.strip();
    if (activeTeardown === teardown) activeTeardown = undefined;
  };
  window.addEventListener("transcriptly-batch-unmount", teardown);

  // ✕ and Esc exit selection mode; a running task keeps running in the
  // background worker.
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") teardown();
  };
  window.addEventListener("keydown", handleKeydown);

  // YouTube is a SPA: watch in-page navigation. Leaving for anything but
  // another batch source or a watch page tears the mode down; arriving
  // back on a batch source re-injects over the re-rendered feed.
  const handleNavigate = () => {
    const url = location.href;
    if (isYouTubeWatchUrl(url)) return;
    if (isBatchSourceUrl(url)) {
      const nextSource = batchSourceIdentity(url);
      if (nextSource !== activeBatchSource) resetForBatchSource(nextSource);
      else stopLoadMore();
      refreshCards();
      return;
    }
    teardown();
  };
  window.addEventListener("yt-navigate-finish", handleNavigate);

  activeTeardown = teardown;
  return { ok: true };
}
