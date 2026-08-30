import type { BatchVideo } from "@/batch/jobs";
import {
  discoverLoadedVideos,
  findLoadedVideoAnchor,
  findLoadedVideoCard,
} from "@/batch/selection/discovery";
import type { SelectionModel } from "@/batch/selection/selection-model";

/**
 * Projection of the selection model onto the feed's video cards (#57):
 * a ~40 px checkbox hit zone prepended to each card.
 *
 * The hit zone's capture-phase click handler never lets the click reach
 * the card's navigation. State is never held here - every render reads the
 * model.
 */

const CARD_MARKER = "data-transcriptly-batch";

export interface CardLayer {
  /**
   * Discovers the feed's videos and injects/updates their checkboxes.
   */
  refresh(): void;
  /** Syncs every checkbox's visual state from the model. */
  sync(): void;
  /** Removes every injected element and card marker. */
  strip(): void;
}

export function createCardLayer(options: {
  model: SelectionModel;
  onSelectionChange(): void;
}): CardLayer {
  const { model, onSelectionChange } = options;

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
      model.ingest(videos);
      for (const video of videos) {
        const anchor = findLoadedVideoAnchor(document, video.videoId);
        if (!anchor) continue;
        const card = findLoadedVideoCard(anchor);
        card.setAttribute(CARD_MARKER, "");
        if (!card.querySelector(".transcriptly-batch-check")) {
          card.prepend(createHit(video));
        }
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
        hit.classList.remove("is-disabled");
        hit.removeAttribute("aria-disabled");
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
