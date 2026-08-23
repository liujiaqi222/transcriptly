import { discoverLoadedVideos, isBatchSourceUrl } from "@/batch/discovery";
import {
  BATCH_MAX_ITEMS,
  type BatchDestination,
  type BatchTask,
  type BatchVideo,
} from "@/batch/jobs";
import {
  isChannelRootUrl,
  isYouTubeWatchUrl,
} from "@/entrypoints/popup/utils/youtube";
import {
  BATCH_LOOKUP_REQUEST,
  BATCH_PAUSE,
  BATCH_RESUME,
  BATCH_RETRY_ITEM,
  BATCH_START,
  BATCH_STATUS_REQUEST,
  BATCH_STOP,
  type BatchEnterSelectionStatus,
  type BatchLookupResult,
  type BatchLookupVideo,
  type BatchMutationStatus,
  type BatchStartStatus,
  type BatchStatusResult,
  CLOUD_SESSION_REQUEST,
  type CloudSessionStatus,
} from "@/shared/messages";

/**
 * On-demand selection mode for playlist / channel /videos pages (#56, #57).
 *
 * Entered only when the popup asks - never auto-injected. The select view
 * is a compact floating toolbar (#57): a live `N/50 · ~X min` counter,
 * Load more (explicit auto-scroll, capped at 100 cards or 10 s), Select
 * all (unsaved first, quota 50) / Clear, per-task destination pickers and
 * Start. Per-card checkboxes ride a ~40 px hit zone whose capture-phase
 * click handler never lets the click reach the card's navigation; when the
 * 50-video quota is full, unchecked unsaved checkboxes grey out and any
 * click on them toasts instead of selecting. Transient messages surface as
 * a bottom-center toast (3 s, latest only) - persistent info (count, ETA)
 * stays in the toolbar.
 *
 * Lifecycle: the whole mode is torn down (panel, toast, styles, every
 * checkbox and badge, card markers, observer, listeners) on ✕ / Esc / SPA
 * navigation to a page that is neither a batch source nor a watch page.
 * Watch-page round trips keep the mode and the selection, so returning
 * re-injects the checkboxes over the re-rendered feed.
 */

const CLOUD_PREFERENCE_KEY = "cloud-save-enabled";
const ROOT_ID = "transcriptly-batch-panel";
const TOAST_ID = "transcriptly-batch-toast";
const CARD_MARKER = "data-transcriptly-batch";
const STATUS_POLL_MS = 1000;
/** Load more: hard stops after this many discovered cards or seconds (#57). */
const LOAD_MORE_MAX_CARDS = 100;
const LOAD_MORE_TIMEOUT_MS = 10_000;
const LOAD_MORE_SCROLL_INTERVAL_MS = 400;
/** Planning estimate for one video's capture + save (the spec's 15-20 s). */
const SECONDS_PER_VIDEO = 18;
const TOAST_AUTO_DISMISS_MS = 3000;

export interface BatchPageRuntime {
  sendMessage<T = unknown>(message: unknown): Promise<T>;
  getCloudPreference(): Promise<boolean>;
  /** Open the batch manager page on this task (#58 interface, #57 wire-up). */
  openManagerTab(taskId: string): void;
}

function defaultRuntime(): BatchPageRuntime {
  return {
    sendMessage: (message) => browser.runtime.sendMessage(message),
    getCloudPreference: async () => {
      const stored = await browser.storage.local.get(CLOUD_PREFERENCE_KEY);
      return stored[CLOUD_PREFERENCE_KEY] === true;
    },
    openManagerTab: (taskId) => {
      window.open(
        `${browser.runtime.getURL("/manager.html")}?task=${encodeURIComponent(taskId)}`,
        "_blank",
      );
    },
  };
}

function addStyles() {
  if (document.getElementById(`${ROOT_ID}-styles`)) return;
  const style = document.createElement("style");
  style.id = `${ROOT_ID}-styles`;
  style.textContent = `
    #${ROOT_ID} { position: fixed; z-index: 2147483647; right: 16px; bottom: 16px; width: 296px; color: #232323; background: #fff; border: 1px solid #d9d9d9; border-radius: 14px; box-shadow: 0 12px 40px rgba(15,22,36,.22); font: 13px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; overflow: hidden; }
    #${ROOT_ID} .panel-head { display: flex; align-items: center; gap: 8px; padding: 12px 32px 10px 14px; }
    #${ROOT_ID} .brand { font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #6e6e6e; }
    #${ROOT_ID} .counter { margin-left: auto; padding: 3px 10px; border-radius: 999px; background: #f0f0f0; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    #${ROOT_ID} .counter-full { background: #fce8e6; color: #b3261e; font-weight: 700; }
    #${ROOT_ID} .panel-close { position: absolute; top: 6px; right: 6px; margin: 0; padding: 4px 8px; border: 0; border-radius: 8px; background: transparent; color: #6e6e6e; font-size: 13px; line-height: 1; cursor: pointer; }
    #${ROOT_ID} .panel-close:hover { background: #f0f0f0; color: #232323; }
    #${ROOT_ID} .actions { display: flex; gap: 6px; padding: 0 14px 10px; }
    #${ROOT_ID} .action-btn { flex: 1; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 8px; background: #fff; color: #232323; font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
    #${ROOT_ID} .action-btn:hover { background: #f5f5f5; }
    #${ROOT_ID} .action-btn.is-loading { border-color: #1a7f37; background: #e6f4ea; color: #1a7f37; }
    #${ROOT_ID} .action-btn.is-loading::before { content: ""; display: inline-block; width: 10px; height: 10px; margin-right: 6px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; vertical-align: -1px; animation: transcriptly-spin .8s linear infinite; }
    @keyframes transcriptly-spin { to { transform: rotate(1turn); } }
    #${ROOT_ID} .destinations { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 2px 14px 10px; }
    #${ROOT_ID} .dest { display: inline-flex; align-items: center; gap: 5px; margin: 0; cursor: pointer; }
    #${ROOT_ID} .dest input { width: 15px; height: 15px; margin: 0; accent-color: #1a7f37; }
    #${ROOT_ID} .dest.disabled { color: #9a9a9a; cursor: default; }
    #${ROOT_ID} .hint { color: #9a9a9a; font-size: 11px; }
    #${ROOT_ID} .start-button { display: block; width: calc(100% - 28px); margin: 0 14px 14px; padding: 8px 0; border: 0; border-radius: 10px; background: #232323; color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    #${ROOT_ID} .start-button:hover { background: #000; }
    #${ROOT_ID} .start-button:disabled { background: #d9d9d9; color: #6e6e6e; cursor: default; }
    #${ROOT_ID} .task-view { border-top: 1px solid #ececec; max-height: 52vh; overflow-y: auto; }
    #${ROOT_ID} .summary { margin: 0; padding: 12px 14px 4px; font-weight: 600; }
    #${ROOT_ID} .task-hint { margin: 0; padding: 0 14px 8px; color: #6e6e6e; font-size: 12px; }
    #${ROOT_ID} .controls { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 10px; }
    #${ROOT_ID} .controls button, #${ROOT_ID} .item button { padding: 5px 10px; border: 1px solid #d9d9d9; border-radius: 8px; background: #fff; color: #232323; font: inherit; font-size: 12px; cursor: pointer; }
    #${ROOT_ID} .controls button:hover, #${ROOT_ID} .item button:hover { background: #f5f5f5; }
    #${ROOT_ID} .item { padding: 8px 14px; border-top: 1px solid #f0f0f0; }
    #${ROOT_ID} .item-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #${ROOT_ID} .chips { margin: 3px 0; }
    #${ROOT_ID} .chip { display: inline-block; margin-right: 6px; padding: 1px 8px; border-radius: 999px; font-size: 11px; background: #f1f3f4; color: #5f6368; }
    #${ROOT_ID} .chip-saved { background: #e6f4ea; color: #137333; }
    #${ROOT_ID} .chip-failed, #${ROOT_ID} .chip-cancelled { background: #fce8e6; color: #b3261e; }
    #${ROOT_ID} .chip-running { background: #e8f0fe; color: #1a73e8; }
    #${ROOT_ID} .chip-skipped { background: #f1f3f4; color: #5f6368; }
    #${ROOT_ID} .item-error { margin: 2px 0; color: #b3261e; font-size: 12px; }
    #${TOAST_ID} { position: fixed; left: 50%; bottom: 36px; z-index: 2147483647; transform: translateX(-50%) translateY(8px); max-width: min(480px, 80vw); padding: 10px 18px; border-radius: 999px; background: #232323; color: #fff; font: 13px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; box-shadow: 0 8px 28px rgba(15,22,36,.35); opacity: 0; pointer-events: none; transition: opacity .18s ease, transform .18s ease; }
    #${TOAST_ID}.toast-show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .transcriptly-batch-check { position: absolute; top: 0; left: 0; z-index: 3; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; cursor: pointer; -webkit-user-select: none; user-select: none; }
    .transcriptly-batch-check::before { content: ""; display: block; width: 20px; height: 20px; border: 2px solid #fff; border-radius: 5px; background: rgba(0,0,0,.35); box-shadow: 0 0 0 2px rgba(255,255,255,.85); box-sizing: border-box; }
    .transcriptly-batch-check:focus-visible { outline: 2px solid #1a7f37; outline-offset: 2px; border-radius: 8px; }
    .transcriptly-batch-check.is-checked::before { background: #1a7f37; border-color: #fff; }
    .transcriptly-batch-check.is-checked::after { content: ""; position: absolute; width: 5px; height: 10px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg) translate(-1px,-1px); }
    .transcriptly-batch-check.is-disabled { cursor: not-allowed; }
    .transcriptly-batch-check.is-disabled::before { opacity: .45; }
    .transcriptly-batch-badge { position: absolute; top: 10px; left: 38px; z-index: 3; padding: 2px 8px; border-radius: 999px; background: #1a7f37; color: #fff; font-size: 11px; font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
  `;
  document.documentElement.append(style);
}

function cardFor(anchor: HTMLAnchorElement): Element {
  return (
    anchor.closest(
      "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer, ytd-video-renderer",
    ) ?? anchor
  );
}

function textFor(state: string, destination: string): string {
  return `${destination}: ${state}`;
}

function chip(
  item: BatchTask["items"][number],
  destination: BatchDestination,
): string {
  const state = destination === "local" ? item.local : item.cloud;
  return `<span class="chip chip-${state}">${textFor(state, destination)}</span>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function summarize(task: BatchTask) {
  let saved = 0;
  let failed = 0;
  let skipped = 0;
  let pending = 0;
  for (const item of task.items) {
    const states = task.destinations.map((destination) =>
      destination === "local" ? item.local : item.cloud,
    );
    if (states.every((state) => state === "saved")) saved += 1;
    else if (states.some((state) => state === "failed")) failed += 1;
    else if (
      states.every((state) => state === "skipped" || state === "cancelled")
    )
      skipped += 1;
    else pending += 1;
  }
  return { saved, failed, skipped, pending, total: task.items.length };
}

function batchFullToast(): string {
  return `Batch full (${BATCH_MAX_ITEMS}/${BATCH_MAX_ITEMS}). Start this batch, then start another - batches run one after another.`;
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
  addStyles();

  // --- select view state -------------------------------------------------
  const knownVideos = new Map<string, BatchVideo>();
  const selectedVideoIds = new Set<string>();
  const savedInfo = new Map<string, BatchLookupVideo>();
  let activeBatchSource = batchSourceIdentity(location.href);
  let refreshing = false;
  let refreshQueued = false;

  // --- task view state ---------------------------------------------------
  let activeTaskId: string | undefined;
  let lastTask: BatchTask | undefined;
  let pollTimer: number | undefined;

  const panel = document.createElement("aside");
  panel.id = ROOT_ID;
  panel.innerHTML = `
    <button type="button" class="panel-close" data-action="close" aria-label="Exit selection mode">✕</button>
    <div class="select-view">
      <div class="panel-head">
        <span class="brand">Transcriptly</span>
        <span class="counter" aria-live="polite">0/${BATCH_MAX_ITEMS}</span>
      </div>
      <div class="actions">
        <button type="button" class="action-btn" data-action="load-more">Load more</button>
        <button type="button" class="action-btn" data-action="select-all">Select all</button>
        <button type="button" class="action-btn" data-action="clear">Clear</button>
      </div>
      <div class="destinations">
        <label class="dest"><input type="checkbox" data-destination="local" checked> Local</label>
        <label class="dest" data-cloud-label><input type="checkbox" data-destination="cloud"> Cloud</label>
        <span class="hint" data-cloud-hint></span>
      </div>
      <button type="button" class="start-button" data-action="start">Start ▸</button>
    </div>
    <div class="task-view" hidden></div>
  `;
  document.body.append(panel);

  const counter = panel.querySelector<HTMLElement>(".counter");
  const selectView = panel.querySelector<HTMLElement>(".select-view");
  const taskView = panel.querySelector<HTMLElement>(".task-view");
  const localInput = panel.querySelector<HTMLInputElement>(
    '[data-destination="local"]',
  );
  const cloudInput = panel.querySelector<HTMLInputElement>(
    '[data-destination="cloud"]',
  );
  const cloudLabel = panel.querySelector<HTMLElement>("[data-cloud-label]");
  const cloudHint = panel.querySelector<HTMLElement>("[data-cloud-hint]");
  const startButton = panel.querySelector<HTMLButtonElement>(
    '[data-action="start"]',
  );
  const loadMoreButton = panel.querySelector<HTMLButtonElement>(
    '[data-action="load-more"]',
  );

  // --- toast: bottom-center, latest only, 3 s auto-dismiss ----------------
  let toastElement: HTMLElement | undefined;
  let toastTimer: number | undefined;

  function showToast(message: string) {
    if (!toastElement) {
      toastElement = document.createElement("div");
      toastElement.id = TOAST_ID;
      toastElement.setAttribute("role", "status");
      document.body.append(toastElement);
    }
    toastElement.textContent = message;
    // Restart the slide-in animation for a repeated toast.
    toastElement.classList.remove("toast-show");
    void toastElement.offsetWidth;
    toastElement.classList.add("toast-show");
    if (toastTimer !== undefined) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => dismissToast(), TOAST_AUTO_DISMISS_MS);
  }

  function dismissToast() {
    if (toastTimer !== undefined) {
      clearTimeout(toastTimer);
      toastTimer = undefined;
    }
    toastElement?.remove();
    toastElement = undefined;
  }

  function checkedDestinations(): BatchDestination[] {
    return [
      ...(localInput?.checked ? (["local"] as const) : []),
      ...(cloudInput?.checked && !cloudInput.disabled
        ? (["cloud"] as const)
        : []),
    ];
  }

  function willBeSkipped(videoId: string): boolean {
    const destinations = checkedDestinations();
    if (destinations.length === 0) return false;
    const info = savedInfo.get(videoId);
    if (!info) return false;
    return destinations.every((destination) =>
      destination === "local" ? info.localSaved : info.cloudSaved,
    );
  }

  /** Selected videos that will actually run - already-saved ones (#57)
   *  are skipped at execution and never occupy quota. */
  function runnableSelectedCount(): number {
    let count = 0;
    for (const videoId of selectedVideoIds) {
      if (!willBeSkipped(videoId)) count += 1;
    }
    return count;
  }

  function quotaFull(): boolean {
    return runnableSelectedCount() >= BATCH_MAX_ITEMS;
  }

  function isCheckDisabled(videoId: string): boolean {
    if (selectedVideoIds.has(videoId)) return false;
    if (willBeSkipped(videoId)) return false;
    return quotaFull();
  }

  function estimatedMinutes(videos: number): number {
    return Math.max(1, Math.ceil((videos * SECONDS_PER_VIDEO) / 60));
  }

  function updateCounter() {
    if (!counter) return;
    const runnable = runnableSelectedCount();
    const skipped = selectedVideoIds.size - runnable;
    let text = `${runnable}/${BATCH_MAX_ITEMS}`;
    if (runnable > 0) text += ` · ~${estimatedMinutes(runnable)} min`;
    if (skipped > 0) text += ` · ${skipped} saved`;
    if (counter.textContent !== text) counter.textContent = text;
    counter.classList.toggle("counter-full", runnable >= BATCH_MAX_ITEMS);
  }

  function syncChecks() {
    for (const hit of document.querySelectorAll<HTMLElement>(
      ".transcriptly-batch-check",
    )) {
      const videoId = hit.dataset.videoId;
      if (!videoId) continue;
      const checked = selectedVideoIds.has(videoId);
      hit.classList.toggle("is-checked", checked);
      hit.setAttribute("aria-checked", checked ? "true" : "false");
      const disabled = isCheckDisabled(videoId);
      hit.classList.toggle("is-disabled", disabled);
      hit.setAttribute("aria-disabled", disabled ? "true" : "false");
    }
  }

  function updateToolbar() {
    updateCounter();
    syncChecks();
    updateLoadMoreButton();
  }

  function setChecked(videoId: string, checked: boolean) {
    if (checked) selectedVideoIds.add(videoId);
    else selectedVideoIds.delete(videoId);
    updateToolbar();
  }

  function updateBadges(card: Element, videoId: string) {
    const info = savedInfo.get(videoId);
    const label = !info
      ? ""
      : info.localSaved && info.cloudSaved
        ? "Saved"
        : info.localSaved
          ? "Saved locally"
          : "Saved to cloud";
    let badge = card.querySelector<HTMLElement>(".transcriptly-batch-badge");
    if (!label) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "transcriptly-batch-badge";
      card.prepend(badge);
    }
    if (badge.textContent !== label) badge.textContent = label;
  }

  function updateAllBadges() {
    if (!isBatchSourceUrl(location.href)) return;
    for (const videoId of knownVideos.keys()) {
      const anchor = document.querySelector<HTMLAnchorElement>(
        `a[href*="watch?v=${videoId}"]`,
      );
      if (anchor) updateBadges(cardFor(anchor), videoId);
    }
  }

  async function refreshSavedInfo(videoIds: string[]) {
    if (videoIds.length === 0) return;
    try {
      const result = await runtime.sendMessage<BatchLookupResult>({
        type: BATCH_LOOKUP_REQUEST,
        videoIds,
      });
      for (const video of result.videos) savedInfo.set(video.videoId, video);
    } catch {
      // Badges are best-effort; the start request re-checks receipts.
    }
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
      const newVideoIds: string[] = [];
      for (const video of discoverLoadedVideos(document)) {
        if (!knownVideos.has(video.videoId)) newVideoIds.push(video.videoId);
        knownVideos.set(video.videoId, video);
        const anchor = document.querySelector<HTMLAnchorElement>(
          `a[href*="watch?v=${video.videoId}"]`,
        );
        if (!anchor) continue;
        const card = cardFor(anchor);
        card.setAttribute(CARD_MARKER, "");
        let hit = card.querySelector<HTMLElement>(".transcriptly-batch-check");
        if (!hit) {
          // A native <input type=checkbox> is deliberately NOT used:
          // Chromium flips its checkedness during pre-click activation
          // (mouseup) before the click event dispatch, so a handler that
          // reads/writes input.checked inverts the user's intent (click
          // to check re-unchecks, click to uncheck re-checks). The hit
          // area is therefore a model-driven div[role=checkbox] whose
          // visual state is rendered only from selectedVideoIds.
          hit = document.createElement("div");
          hit.className = "transcriptly-batch-check";
          hit.dataset.videoId = video.videoId;
          hit.setAttribute("role", "checkbox");
          hit.setAttribute("aria-label", `Select ${video.title}`);
          hit.setAttribute("aria-checked", "false");
          hit.tabIndex = 0;
          // ~40 px hot zone, capture phase: a click here must never
          // reach the card's navigation, and a full quota greys out
          // with a toast instead of selecting (#57).
          const toggle = () => {
            if (hit?.classList.contains("is-disabled")) {
              showToast(batchFullToast());
              return;
            }
            setChecked(video.videoId, !selectedVideoIds.has(video.videoId));
          };
          hit.addEventListener(
            "click",
            (event) => {
              event.preventDefault();
              event.stopPropagation();
              toggle();
            },
            { capture: true },
          );
          hit.addEventListener("keydown", (event) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            toggle();
          });
          card.prepend(hit);
        }
        updateBadges(card, video.videoId);
      }
      void refreshSavedInfo(newVideoIds).then(() => {
        updateAllBadges();
        updateToolbar();
      });
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
    knownVideos.clear();
    selectedVideoIds.clear();
    savedInfo.clear();
    for (const element of document.querySelectorAll(
      ".transcriptly-batch-check, .transcriptly-batch-badge",
    )) {
      element.remove();
    }
    for (const card of document.querySelectorAll(`[${CARD_MARKER}]`)) {
      card.removeAttribute(CARD_MARKER);
    }
    activeBatchSource = nextSource;
    updateToolbar();
  }

  // --- Load more: explicit auto-scroll, 100 cards / 10 s hard cap --------
  let loadMoreTimer: number | undefined;
  let loadMoreStartedAt = 0;

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
      if (
        knownVideos.size >= LOAD_MORE_MAX_CARDS ||
        Date.now() - loadMoreStartedAt >= LOAD_MORE_TIMEOUT_MS
      ) {
        stopLoadMore();
        return;
      }
      window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
    }, LOAD_MORE_SCROLL_INTERVAL_MS);
    updateLoadMoreButton();
  }

  function updateLoadMoreButton() {
    if (!loadMoreButton) return;
    if (loadMoreActive()) {
      loadMoreButton.textContent = `Loading… ${knownVideos.size} videos`;
      loadMoreButton.classList.add("is-loading");
      loadMoreButton.setAttribute("aria-busy", "true");
    } else {
      loadMoreButton.textContent = "Load more";
      loadMoreButton.classList.remove("is-loading");
      loadMoreButton.removeAttribute("aria-busy");
    }
  }

  loadMoreButton?.addEventListener("click", () => {
    // The second click stops an in-flight load (#57).
    if (loadMoreActive()) stopLoadMore();
    else startLoadMore();
  });

  // --- Select all / Clear -------------------------------------------------
  panel
    .querySelector('[data-action="select-all"]')
    ?.addEventListener("click", () => {
      let runnable = runnableSelectedCount();
      let hitCap = false;
      // Already-saved videos are checked freely (skipped at execution,
      // no quota); unsaved ones fill the remaining quota, in page order.
      for (const video of knownVideos.values()) {
        if (selectedVideoIds.has(video.videoId)) continue;
        if (willBeSkipped(video.videoId)) {
          selectedVideoIds.add(video.videoId);
        } else if (runnable < BATCH_MAX_ITEMS) {
          selectedVideoIds.add(video.videoId);
          runnable += 1;
        } else {
          hitCap = true;
        }
      }
      if (hitCap) showToast(batchFullToast());
      updateToolbar();
    });

  panel
    .querySelector('[data-action="clear"]')
    ?.addEventListener("click", () => {
      selectedVideoIds.clear();
      updateToolbar();
    });

  // --- task view ---------------------------------------------------------
  async function refreshTask() {
    if (!activeTaskId) return;
    try {
      const result = await runtime.sendMessage<BatchStatusResult>({
        type: BATCH_STATUS_REQUEST,
        taskId: activeTaskId,
      });
      lastTask = result.tasks[0];
    } catch {
      // The worker is unreachable; the next poll retries.
      return;
    }
    renderTask();
  }

  function renderTask() {
    if (!taskView) return;
    if (!lastTask) {
      taskView.innerHTML = `<p class="summary">Loading batch…</p>`;
      return;
    }
    const task = lastTask;
    const counts = summarize(task);
    const parts = [
      `${counts.saved + counts.skipped}/${counts.total} done`,
      ...(counts.failed > 0 ? [`${counts.failed} failed`] : []),
      ...(counts.skipped > 0 ? [`${counts.skipped} skipped`] : []),
    ];
    const stateLabel =
      task.state === "running" || task.state === "queued"
        ? "Running"
        : task.state === "paused"
          ? "Paused"
          : task.state === "stopped"
            ? "Stopped"
            : "Completed";

    const controls: string[] = [];
    if (task.state === "running" || task.state === "queued") {
      controls.push('<button type="button" data-action="pause">Pause</button>');
    }
    if (task.state === "paused") {
      controls.push(
        '<button type="button" data-action="resume">Resume</button>',
      );
    }
    if (
      task.state === "running" ||
      task.state === "queued" ||
      task.state === "paused"
    ) {
      controls.push(
        '<button type="button" data-action="stop">Stop pending items</button>',
      );
    }
    controls.push(
      '<button type="button" data-action="back">Back to selection</button>',
    );

    const items = task.items
      .map((item) => {
        const chips = task.destinations
          .map((destination) => chip(item, destination))
          .join("");
        const errors = task.destinations
          .map((destination) => {
            const error =
              destination === "local" ? item.localError : item.cloudError;
            return error
              ? `<div class="item-error">${escapeHtml(`${destination}: ${error}`)}</div>`
              : "";
          })
          .join("");
        const retryable = task.destinations.some((destination) =>
          ["failed", "skipped", "cancelled"].includes(
            destination === "local" ? item.local : item.cloud,
          ),
        );
        const retry = retryable
          ? `<button type="button" data-action="retry" data-video-id="${item.video.videoId}">Retry</button>`
          : "";
        return `<div class="item" data-video-id="${item.video.videoId}">
          <div class="item-title" title="${escapeHtml(item.video.title)}">${escapeHtml(item.video.title)}</div>
          <div class="chips">${chips}</div>
          ${errors}
          ${retry}
        </div>`;
      })
      .join("");

    taskView.innerHTML = `
      <p class="summary">${stateLabel} · ${parts.join(" · ")}</p>
      <p class="task-hint">Each video opens in a foreground tab while its transcript is captured, then closes automatically.</p>
      <div class="controls">${controls.join("")}</div>
      ${items}
    `;
  }

  async function sendMutation(message: unknown): Promise<BatchMutationStatus> {
    try {
      return await runtime.sendMessage<BatchMutationStatus>(message);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function enterTaskMode(taskId: string) {
    activeTaskId = taskId;
    lastTask = undefined;
    stopLoadMore();
    if (selectView) selectView.hidden = true;
    if (taskView) taskView.hidden = false;
    renderTask();
    void refreshTask();
    if (pollTimer === undefined) {
      pollTimer = window.setInterval(() => void refreshTask(), STATUS_POLL_MS);
    }
  }

  function exitTaskMode() {
    activeTaskId = undefined;
    lastTask = undefined;
    if (pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
    if (taskView) {
      taskView.hidden = true;
      taskView.innerHTML = "";
    }
    if (selectView) selectView.hidden = false;
    if (startButton) {
      startButton.disabled = false;
      startButton.textContent = "Start ▸";
    }
    updateToolbar();
  }

  taskView?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button || !activeTaskId) return;
    const action = button.dataset.action;
    const taskId = activeTaskId;
    if (action === "pause") {
      void sendMutation({ type: BATCH_PAUSE, taskId }).then(() =>
        refreshTask(),
      );
    } else if (action === "resume") {
      void sendMutation({ type: BATCH_RESUME, taskId }).then(() =>
        refreshTask(),
      );
    } else if (action === "stop") {
      void sendMutation({ type: BATCH_STOP, taskId }).then(() => refreshTask());
    } else if (action === "retry") {
      const videoId = button.dataset.videoId;
      if (videoId) {
        void sendMutation({
          type: BATCH_RETRY_ITEM,
          taskId,
          videoId,
        }).then(() => refreshTask());
      }
    } else if (action === "back") {
      exitTaskMode();
    }
  });

  // --- start -------------------------------------------------------------
  startButton?.addEventListener("click", async () => {
    const videos = [...selectedVideoIds]
      .map((videoId) => knownVideos.get(videoId))
      .filter((video): video is BatchVideo => Boolean(video));
    const destinations = checkedDestinations();
    if (videos.length === 0 || destinations.length === 0) {
      showToast("Select videos and at least one destination.");
      return;
    }
    if (runnableSelectedCount() > BATCH_MAX_ITEMS) {
      showToast(batchFullToast());
      return;
    }
    if (startButton) startButton.disabled = true;
    if (startButton) startButton.textContent = "Starting…";
    try {
      const result = await runtime.sendMessage<BatchStartStatus>({
        type: BATCH_START,
        videos,
        destinations,
      });
      if (result.ok) {
        // #57: Start jumps straight to the batch manager page; the
        // in-panel task view remains as the transitional monitor.
        runtime.openManagerTab(result.taskId);
        enterTaskMode(result.taskId);
      } else {
        showToast(result.message);
        if (startButton) startButton.disabled = false;
        if (startButton) startButton.textContent = "Start ▸";
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
      if (startButton) startButton.disabled = false;
      if (startButton) startButton.textContent = "Start ▸";
    }
  });

  // --- cloud gating ------------------------------------------------------
  async function applyCloudDefaults() {
    let session: CloudSessionStatus = { status: "signed-out" };
    try {
      session = await runtime.sendMessage<CloudSessionStatus>({
        type: CLOUD_SESSION_REQUEST,
      });
    } catch {
      // Treat an unreachable worker as signed out.
    }
    const signedIn = session.status === "signed-in";
    if (cloudInput) {
      cloudInput.disabled = !signedIn;
      cloudInput.checked = false;
    }
    if (cloudLabel) cloudLabel.classList.toggle("disabled", !signedIn);
    if (cloudHint) {
      cloudHint.textContent = signedIn
        ? ""
        : "Sign in from the popup to enable";
    }
    if (signedIn) {
      try {
        if (cloudInput) cloudInput.checked = await runtime.getCloudPreference();
      } catch {
        // Preference stays off when it cannot be read.
      }
    }
    updateToolbar();
  }

  localInput?.addEventListener("change", updateToolbar);
  cloudInput?.addEventListener("change", updateToolbar);

  refreshCards();
  void applyCloudDefaults();

  // Only react to page mutations outside our own panel.
  const observer = new MutationObserver((mutations) => {
    if (activeTaskId) return;
    if (mutations.every((mutation) => panel.contains(mutation.target))) return;
    refreshCards();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Full teardown (#56): panel, toast, styles, every checkbox and badge,
  // card markers, the observer and every listener - zero page residue.
  const teardown = () => {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
    stopLoadMore();
    dismissToast();
    observer.disconnect();
    window.removeEventListener("transcriptly-batch-unmount", teardown);
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("yt-navigate-finish", handleNavigate);
    panel.remove();
    document.getElementById(`${ROOT_ID}-styles`)?.remove();
    for (const element of document.querySelectorAll(
      ".transcriptly-batch-check, .transcriptly-batch-badge",
    )) {
      element.remove();
    }
    for (const card of document.querySelectorAll(`[${CARD_MARKER}]`)) {
      card.removeAttribute(CARD_MARKER);
    }
    if (activeTeardown === teardown) activeTeardown = undefined;
  };
  window.addEventListener("transcriptly-batch-unmount", teardown);

  // ✕ and Esc exit selection mode; a running task keeps running in the
  // background worker.
  panel
    .querySelector('[data-action="close"]')
    ?.addEventListener("click", teardown);
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
