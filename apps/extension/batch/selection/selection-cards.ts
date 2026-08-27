import type { BatchVideo } from "@/batch/jobs";
import {
  discoverLoadedVideos,
  findLoadedVideoAnchor,
  findLoadedVideoCard,
  isBatchSourceUrl,
} from "@/batch/selection/discovery";
import {
  batchFullToast,
  type SelectionModel,
} from "@/batch/selection/selection-model";

/**
 * Projection of the selection model onto the feed's video cards (#57):
 * a ~40 px checkbox hit zone prepended to each card, plus Saved badges.
 *
 * The hit zone's capture-phase click handler never lets the click reach
 * the card's navigation; when the quota is full, unchecked unsaved
 * checkboxes grey out and any click on them toasts instead of
 * selecting. State is never held here - every render reads the model.
 */

const CARD_MARKER = "data-transcriptly-batch";

export interface CardLayer {
  /**
   * Discovers the feed's videos and injects/updates their checkboxes and
   * badges. Returns the ids of videos never seen before (for the
   * saved-receipt lookup).
   */
  refresh(): string[];
  /** Re-renders Saved badges for every known video. */
  refreshBadges(): void;
  /** Syncs every checkbox's visual state from the model. */
  sync(): void;
  /** Removes every injected element and card marker. */
  strip(): void;
}

export function createCardLayer(options: {
  model: SelectionModel;
  showToast(message: string): void;
  onSelectionChange(): void;
}): CardLayer {
  const { model, showToast, onSelectionChange } = options;

  function badgeLabel(videoId: string): string {
    const info = model.savedInfo(videoId);
    if (!info) return "";
    if (info.localSaved && info.cloudSaved) return "Saved · Public";
    if (info.localSaved) return "Saved locally";
    return "Contributed publicly";
  }

  function updateBadges(card: Element, videoId: string) {
    const label = badgeLabel(videoId);
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

  function createHit(video: BatchVideo): HTMLElement {
    // A native <input type=checkbox> is deliberately NOT used:
    // Chromium flips its checkedness during pre-click activation
    // (mouseup) before the click event dispatch, so a handler that
    // reads/writes input.checked inverts the user's intent (click
    // to check re-unchecks, click to uncheck re-checks). The hit
    // area is therefore a model-driven div[role=checkbox] whose
    // visual state is rendered only from the selection model.
    const hit = document.createElement("div");
    hit.className = "transcriptly-batch-check";
    hit.dataset.videoId = video.videoId;
    hit.setAttribute("role", "checkbox");
    hit.setAttribute("aria-label", `Select ${video.title}`);
    hit.setAttribute("aria-checked", "false");
    hit.tabIndex = 0;
    const toggle = () => {
      if (hit.classList.contains("is-disabled")) {
        showToast(batchFullToast());
        return;
      }
      model.setChecked(video.videoId, !model.isChecked(video.videoId));
      onSelectionChange();
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
    return hit;
  }

  return {
    refresh() {
      const videos = discoverLoadedVideos(document);
      const newVideoIds = model.ingest(videos);
      for (const video of videos) {
        const anchor = findLoadedVideoAnchor(document, video.videoId);
        if (!anchor) continue;
        const card = findLoadedVideoCard(anchor);
        card.setAttribute(CARD_MARKER, "");
        if (!card.querySelector(".transcriptly-batch-check")) {
          card.prepend(createHit(video));
        }
        updateBadges(card, video.videoId);
      }
      return newVideoIds;
    },
    refreshBadges() {
      // Defense in depth (#56): never touch the page outside a batch
      // source page, even if called after SPA navigation.
      if (!isBatchSourceUrl(location.href)) return;
      for (const videoId of model.videoIds()) {
        const anchor = findLoadedVideoAnchor(document, videoId);
        if (anchor) updateBadges(findLoadedVideoCard(anchor), videoId);
      }
    },
    sync() {
      for (const hit of document.querySelectorAll<HTMLElement>(
        ".transcriptly-batch-check",
      )) {
        const videoId = hit.dataset.videoId;
        if (!videoId) continue;
        const checked = model.isChecked(videoId);
        hit.classList.toggle("is-checked", checked);
        hit.setAttribute("aria-checked", checked ? "true" : "false");
        const disabled = model.isCheckDisabled(videoId);
        hit.classList.toggle("is-disabled", disabled);
        hit.setAttribute("aria-disabled", disabled ? "true" : "false");
      }
    },
    strip() {
      for (const element of document.querySelectorAll(
        ".transcriptly-batch-check, .transcriptly-batch-badge",
      )) {
        element.remove();
      }
      for (const card of document.querySelectorAll(`[${CARD_MARKER}]`)) {
        card.removeAttribute(CARD_MARKER);
      }
    },
  };
}
