import { discoverLoadedVideos, isBatchSourceUrl } from "@/batch/discovery";
import type { BatchDestination, BatchTask, BatchVideo } from "@/batch/jobs";
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
 * On-demand selection mode for playlist / channel /videos pages (#56).
 *
 * Entered only when the popup asks - never auto-injected. Select view:
 * per-card checkboxes (selection survives YouTube's virtual list),
 * Local / Cloud destination pickers for this task only, and "already
 * saved" badges from known receipts. Task view: overall progress,
 * per-video Local / Cloud results, failure reasons, Pause / Stop /
 * Resume and per-item Retry.
 *
 * Lifecycle: the whole mode is torn down (panel, styles, every checkbox
 * and badge, card markers, observer, listeners) on ✕ / Esc / SPA
 * navigation to a page that is neither a batch source nor a watch page.
 * Watch-page round trips keep the mode and the selection, so returning
 * re-injects the checkboxes over the re-rendered feed.
 */

const CLOUD_PREFERENCE_KEY = "cloud-save-enabled";
const ROOT_ID = "transcriptly-batch-panel";
const CARD_MARKER = "data-transcriptly-batch";
const STATUS_POLL_MS = 1000;
const RECENT_LIMIT = 5;

export interface BatchPageRuntime {
  sendMessage<T = unknown>(message: unknown): Promise<T>;
  getCloudPreference(): Promise<boolean>;
}

function defaultRuntime(): BatchPageRuntime {
  return {
    sendMessage: (message) => browser.runtime.sendMessage(message),
    getCloudPreference: async () => {
      const stored = await browser.storage.local.get(CLOUD_PREFERENCE_KEY);
      return stored[CLOUD_PREFERENCE_KEY] === true;
    },
  };
}

function addStyles() {
  if (document.getElementById(`${ROOT_ID}-styles`)) return;
  const style = document.createElement("style");
  style.id = `${ROOT_ID}-styles`;
  style.textContent = `
    #${ROOT_ID} { position: fixed; z-index: 2147483647; right: 20px; bottom: 20px; width: 300px; max-height: 70vh; overflow-y: auto; padding: 14px; color: #171717; background: #fff; border: 1px solid #aaa; border-radius: 8px; box-shadow: 0 4px 18px #0003; font: 13px/1.4 Arial,sans-serif; }
    #${ROOT_ID} h2 { margin: 0 0 8px; font-size: 15px; }
    #${ROOT_ID} h3 { margin: 12px 0 4px; font-size: 13px; color: #555; }
    #${ROOT_ID} p { margin: 6px 0; }
    #${ROOT_ID} .panel-close { position: absolute; top: 8px; right: 8px; margin: 0; padding: 2px 6px; border: 0; background: transparent; font-size: 14px; line-height: 1; cursor: pointer; }
    #${ROOT_ID} label { display: block; margin: 5px 0; }
    #${ROOT_ID} label.disabled { color: #888; }
    #${ROOT_ID} .hint { color: #888; font-size: 12px; }
    #${ROOT_ID} button { padding: 6px 10px; margin: 4px 6px 0 0; cursor: pointer; }
    #${ROOT_ID} button[data-action="start"] { width: 100%; margin-top: 8px; }
    #${ROOT_ID} .status { min-height: 18px; color: #555; }
    #${ROOT_ID} .summary { font-weight: bold; }
    #${ROOT_ID} .recent-item { display: block; width: 100%; text-align: left; margin: 2px 0; padding: 4px; background: #f5f5f5; border: 0; font: inherit; }
    #${ROOT_ID} .item { padding: 6px 0; border-top: 1px solid #eee; }
    #${ROOT_ID} .item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #${ROOT_ID} .chips { margin: 3px 0; }
    #${ROOT_ID} .chip { display: inline-block; margin-right: 6px; padding: 1px 6px; border-radius: 9px; font-size: 12px; background: #eee; }
    #${ROOT_ID} .chip-saved { background: #e6f4ea; color: #137333; }
    #${ROOT_ID} .chip-failed, #${ROOT_ID} .chip-cancelled { background: #fce8e6; color: #c5221f; }
    #${ROOT_ID} .chip-running { background: #e8f0fe; color: #1a73e8; }
    #${ROOT_ID} .chip-skipped { background: #f1f3f4; color: #5f6368; }
    #${ROOT_ID} .item-error { margin: 2px 0; color: #c5221f; font-size: 12px; }
    [${CARD_MARKER}] { outline: 2px solid #065fd4 !important; outline-offset: -2px; }
    .transcriptly-batch-checkbox { position: absolute; z-index: 3; margin: 8px; width: 18px; height: 18px; }
    .transcriptly-batch-badge { position: absolute; z-index: 3; margin: 8px 8px 8px 34px; padding: 1px 7px; border-radius: 9px; background: #137333; color: #fff; font-size: 11px; }
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
    <h2>Transcriptly batch save</h2>
    <p class="status" aria-live="polite">Scanning loaded videos…</p>
    <div class="select-view">
      <label><input type="checkbox" data-destination="local" checked> Local</label>
      <label data-cloud-label><input type="checkbox" data-destination="cloud"> Cloud <span class="hint"></span></label>
      <button type="button" data-action="start">Save selected</button>
    </div>
    <div class="task-view" hidden></div>
    <div class="recent" hidden>
      <h3>Recent batches</h3>
      <div class="recent-list"></div>
    </div>
  `;
  document.body.append(panel);

  const status = panel.querySelector<HTMLElement>(".status");
  const selectView = panel.querySelector<HTMLElement>(".select-view");
  const taskView = panel.querySelector<HTMLElement>(".task-view");
  const recent = panel.querySelector<HTMLElement>(".recent");
  const recentList = panel.querySelector<HTMLElement>(".recent-list");
  const localInput = panel.querySelector<HTMLInputElement>(
    '[data-destination="local"]',
  );
  const cloudInput = panel.querySelector<HTMLInputElement>(
    '[data-destination="cloud"]',
  );
  const cloudLabel = panel.querySelector<HTMLElement>("[data-cloud-label]");
  const cloudHint = cloudLabel?.querySelector<HTMLElement>(".hint");
  const startButton = panel.querySelector<HTMLButtonElement>(
    '[data-action="start"]',
  );

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

  function updateStatus() {
    if (!status || activeTaskId) return;
    const selected = selectedVideoIds.size;
    const loaded = knownVideos.size;
    const skipped = [...selectedVideoIds].filter(willBeSkipped).length;
    let text =
      selected === 0
        ? `Select videos (${loaded} loaded)`
        : `${selected} selected (${loaded} loaded)`;
    if (skipped > 0) text += ` · ${skipped} already saved (skipped)`;
    if (selected > 20) text += " · only 20 per batch";
    if (status.textContent !== text) status.textContent = text;
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
        let input = card.querySelector<HTMLInputElement>(
          ".transcriptly-batch-checkbox",
        );
        if (!input) {
          input = document.createElement("input");
          input.type = "checkbox";
          input.className = "transcriptly-batch-checkbox";
          input.setAttribute("aria-label", `Select ${video.title}`);
          input.addEventListener("change", () => {
            if (input?.checked) selectedVideoIds.add(video.videoId);
            else selectedVideoIds.delete(video.videoId);
            updateStatus();
          });
          card.prepend(input);
        }
        input.checked = selectedVideoIds.has(video.videoId);
        updateBadges(card, video.videoId);
      }
      void refreshSavedInfo(newVideoIds).then(() => {
        updateAllBadges();
        updateStatus();
      });
      updateStatus();
    } finally {
      refreshing = false;
      if (refreshQueued) {
        refreshQueued = false;
        queueMicrotask(refreshCards);
      }
    }
  }

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
      taskView.innerHTML = `<p class="status">Loading batch…</p>`;
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
      <p class="hint">Each video opens in a foreground tab while its transcript is captured, then closes automatically.</p>
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
    if (selectView) selectView.hidden = true;
    if (recent) recent.hidden = true;
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
      startButton.textContent = "Save selected";
    }
    void refreshRecent();
    updateStatus();
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

  // --- recent batches ----------------------------------------------------
  async function refreshRecent() {
    if (!recent || !recentList || activeTaskId) return;
    try {
      const result = await runtime.sendMessage<BatchStatusResult>({
        type: BATCH_STATUS_REQUEST,
      });
      const tasks = result.tasks.slice(0, RECENT_LIMIT);
      if (tasks.length === 0) {
        recent.hidden = true;
        return;
      }
      recent.hidden = false;
      recentList.innerHTML = "";
      for (const task of tasks) {
        const counts = summarize(task);
        const date = new Date(task.createdAt).toLocaleString();
        const button = document.createElement("button");
        button.type = "button";
        button.className = "recent-item";
        button.textContent = `${date} · ${counts.total} videos · ${task.state}`;
        button.addEventListener("click", () => enterTaskMode(task.id));
        recentList.append(button);
      }
    } catch {
      // Recent batches are best-effort.
    }
  }

  // --- start -------------------------------------------------------------
  startButton?.addEventListener("click", async () => {
    const videos = [...selectedVideoIds]
      .map((videoId) => knownVideos.get(videoId))
      .filter((video): video is BatchVideo => Boolean(video));
    const destinations = checkedDestinations();
    if (videos.length === 0 || destinations.length === 0) {
      if (status)
        status.textContent = "Select videos and at least one destination.";
      return;
    }
    if (startButton) startButton.disabled = true;
    if (status) status.textContent = "Starting batch…";
    try {
      const result = await runtime.sendMessage<BatchStartStatus>({
        type: BATCH_START,
        videos,
        destinations,
      });
      if (result.ok) {
        enterTaskMode(result.taskId);
      } else {
        if (status) status.textContent = result.message;
        if (startButton) startButton.disabled = false;
      }
    } catch (error) {
      if (status)
        status.textContent =
          error instanceof Error ? error.message : String(error);
      if (startButton) startButton.disabled = false;
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
  }

  localInput?.addEventListener("change", updateStatus);
  cloudInput?.addEventListener("change", updateStatus);

  refreshCards();
  void applyCloudDefaults();
  void refreshRecent();

  // Only react to page mutations outside our own panel.
  const observer = new MutationObserver((mutations) => {
    if (activeTaskId) return;
    if (mutations.every((mutation) => panel.contains(mutation.target))) return;
    refreshCards();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Full teardown (#56): panel, styles, every checkbox and badge, card
  // markers, the observer and every listener - zero page residue.
  const teardown = () => {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
    observer.disconnect();
    window.removeEventListener("transcriptly-batch-unmount", teardown);
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("yt-navigate-finish", handleNavigate);
    panel.remove();
    document.getElementById(`${ROOT_ID}-styles`)?.remove();
    for (const element of document.querySelectorAll(
      ".transcriptly-batch-checkbox, .transcriptly-batch-badge",
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
      refreshCards();
      return;
    }
    teardown();
  };
  window.addEventListener("yt-navigate-finish", handleNavigate);

  activeTeardown = teardown;
  return { ok: true };
}
