import {
  ArrowRight,
  Cloud,
  createElement,
  type IconNode,
  NotebookText,
  RefreshCw,
  X,
} from "lucide";
import { BATCH_MAX_RUNNABLE_ITEMS, type BatchDestination } from "@/batch/jobs";

/**
 * DOM for the selection-mode toolbar (#57): the floating panel, its
 * bottom-center toast, and the mode's stylesheet (which also skins the
 * card checkboxes and badges injected by selection-cards.ts).
 *
 * Purely presentational: behaviour is wired in through handlers, and
 * state arrives via imperative setters, so the panel never owns
 * selection or quota logic.
 */

const ROOT_ID = "transcriptly-batch-panel";
const TOAST_ID = "transcriptly-batch-toast";
const TOAST_AUTO_DISMISS_MS = 3000;

function icon(iconNode: IconNode): string {
  return createElement(iconNode, { "aria-hidden": "true" }).outerHTML;
}

export interface SelectionPanelHandlers {
  onClose(): void;
  /** The second click while loading stops an in-flight load (#57). */
  onToggleLoadMore(): void;
  onSelectAll(): void;
  onClear(): void;
  onStart(): void;
  /** A destination checkbox changed; re-derive skip/quota state. */
  onDestinationsChange(): void;
}

export interface SelectionPanel {
  checkedDestinations(): BatchDestination[];
  /** Whether a mutation happened inside the panel (observer filter). */
  contains(node: Node): boolean;
  setCounter(text: string, full: boolean): void;
  setLoadMore(active: boolean, discoveredCount: number): void;
  setStarting(starting: boolean): void;
  setCloudSession(signedIn: boolean, checked: boolean): void;
  showToast(message: string): void;
  dismissToast(): void;
  /** Removes the panel, toast and styles (#56 zero-residue teardown). */
  remove(): void;
}

function addStyles() {
  if (document.getElementById(`${ROOT_ID}-styles`)) return;
  const style = document.createElement("style");
  style.id = `${ROOT_ID}-styles`;
  style.textContent = `
    #${ROOT_ID} { position: fixed; z-index: 2147483647; right: 16px; bottom: 16px; width: 292px; color: #202124; background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; font: 12px/1.4 Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; overflow: hidden; }
    #${ROOT_ID} * { box-sizing: border-box; }
    #${ROOT_ID} button:focus-visible, #${ROOT_ID} input:focus-visible { outline: 3px solid rgba(27,144,237,.35); outline-offset: 2px; }
    #${ROOT_ID} .panel-head { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 40px 4px 12px; }
    #${ROOT_ID} .brand-mark { display: grid; place-items: center; width: 24px; height: 24px; color: #202124; }
    #${ROOT_ID} .brand-mark svg { width: 24px; height: 24px; }
    #${ROOT_ID} .brand { font-size: 12px; font-weight: 750; letter-spacing: -.01em; color: #202124; }
    #${ROOT_ID} .summary-row { display: flex; align-items: baseline; min-height: 28px; padding: 4px 12px 0; }
    #${ROOT_ID} .counter { display: flex; align-items: baseline; min-width: 0; width: 100%; font-variant-numeric: tabular-nums; }
    #${ROOT_ID} .counter-value { color: #202124; font-size: 12px; font-weight: 750; line-height: 1.2; white-space: nowrap; }
    #${ROOT_ID} .counter-meta { min-width: 0; overflow: hidden; color: #64748b; font-size: 10px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
    #${ROOT_ID} .counter-full .counter-value { color: #c2410c; }
    #${ROOT_ID} .panel-close { position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 28px; height: 28px; margin: 0; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #64748b; cursor: pointer; }
    #${ROOT_ID} .panel-close:hover { background: #f1f5f9; color: #202124; }
    #${ROOT_ID} .panel-close svg { width: 17px; height: 17px; }
    #${ROOT_ID} .tool-row { display: flex; align-items: center; gap: 8px; padding: 4px 12px; }
    #${ROOT_ID} .load-more { display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 104px; min-height: 32px; padding: 4px 12px; border: 0; border-radius: 8px; background: #edf7ff; color: #0872b9; font: inherit; font-weight: 650; cursor: pointer; }
    #${ROOT_ID} .load-more:hover { background: #dcefff; }
    #${ROOT_ID} .load-more svg { width: 16px; height: 16px; color: #1b90ed; }
    #${ROOT_ID} .load-more.is-loading svg { animation: transcriptly-spin .8s linear infinite; }
    #${ROOT_ID} .load-status { min-width: 0; margin-left: auto; overflow: hidden; color: #64748b; font-size: 10px; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
    @keyframes transcriptly-spin { to { transform: rotate(1turn); } }
    #${ROOT_ID} .selection-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }
    #${ROOT_ID} .text-action { min-height: 28px; padding: 4px 8px; border: 0; border-radius: 8px; background: transparent; color: #0872b9; font: inherit; font-size: 10px; font-weight: 650; cursor: pointer; }
    #${ROOT_ID} .text-action:hover { background: #edf7ff; }
    #${ROOT_ID} .text-action.clear { color: #64748b; }
    #${ROOT_ID} .text-action.clear:hover { color: #b91c1c; background: #fef2f2; }
    #${ROOT_ID} .destinations { display: flex; flex-wrap: wrap; align-items: center; gap: 0 12px; min-height: 32px; padding: 0 12px 4px; }
    #${ROOT_ID} .dest { display: inline-flex; align-items: center; gap: 4px; min-height: 32px; margin: 0; color: #202124; cursor: pointer; }
    #${ROOT_ID} .dest input { width: 16px; height: 16px; margin: 0; accent-color: #1b90ed; }
    #${ROOT_ID} .dest svg { width: 16px; height: 16px; color: #1b90ed; }
    #${ROOT_ID} .dest.disabled { color: #94a3b8; cursor: default; }
    #${ROOT_ID} .hint { flex: 0 0 100%; color: #94a3b8; font-size: 9px; }
    #${ROOT_ID} .start-button { display: flex; align-items: center; justify-content: center; gap: 8px; width: calc(100% - 24px); min-height: 36px; margin: 4px 12px 12px; padding: 8px 12px; border: 0; border-radius: 8px; background: #202124; color: #fff; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
    #${ROOT_ID} .start-button:hover { background: #111827; }
    #${ROOT_ID} .start-button:disabled { background: #e2e8f0; color: #64748b; cursor: default; }
    #${ROOT_ID} .start-button svg { width: 16px; height: 16px; }
    #${TOAST_ID} { position: fixed; left: 50%; bottom: 36px; z-index: 2147483647; transform: translateX(-50%) translateY(8px); max-width: min(480px,80vw); padding: 12px 20px; border-radius: 999px; background: #202124; color: #fff; font: 13px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; opacity: 0; pointer-events: none; transition: opacity .18s ease,transform .18s ease; }
    #${TOAST_ID}.toast-show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .transcriptly-batch-check { position: absolute; top: 0; left: 0; z-index: 3; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; cursor: pointer; -webkit-user-select: none; user-select: none; }
    .transcriptly-batch-check::before { content: ""; display: block; width: 20px; height: 20px; border: 2px solid #fff; border-radius: 6px; background: rgba(15,23,42,.55); box-sizing: border-box; }
    .transcriptly-batch-check:focus-visible { outline: 3px solid rgba(27,144,237,.55); outline-offset: 1px; border-radius: 9px; }
    .transcriptly-batch-check.is-checked::before { background: #1b90ed; border-color: #fff; }
    .transcriptly-batch-check.is-checked::after { content: ""; position: absolute; width: 5px; height: 10px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg) translate(-1px,-1px); }
    .transcriptly-batch-check.is-disabled { cursor: not-allowed; }
    .transcriptly-batch-check.is-disabled::before { opacity: .45; }
    .transcriptly-batch-badge { position: absolute; top: 8px; left: 36px; z-index: 3; padding: 4px 8px; border-radius: 999px; background: #1b90ed; color: #202124; font-size: 11px; font-weight: 650; }
  `;
  document.documentElement.append(style);
}

export function createSelectionPanel(
  handlers: SelectionPanelHandlers,
): SelectionPanel {
  addStyles();

  const panel = document.createElement("aside");
  panel.id = ROOT_ID;
  panel.innerHTML = `
    <button type="button" class="panel-close" data-action="close" aria-label="Exit selection mode">${icon(X)}</button>
    <div class="select-view">
      <div class="panel-head">
        <span class="brand-mark">${icon(NotebookText)}</span>
        <span class="brand">Transcriptly</span>
      </div>
      <div class="summary-row">
        <span class="counter" aria-live="polite">0/${BATCH_MAX_RUNNABLE_ITEMS}</span>
      </div>
      <div class="tool-row">
        <button type="button" class="load-more" data-action="load-more">${icon(RefreshCw)}<span>Load more</span></button>
        <span class="load-status" aria-live="polite">0 videos found</span>
      </div>
      <div class="destinations">
        <label class="dest"><input type="checkbox" data-destination="local" checked>Local</label>
        <label class="dest" data-cloud-label><input type="checkbox" data-destination="cloud">${icon(Cloud)}Cloud</label>
        <div class="selection-actions">
          <button type="button" class="text-action" data-action="select-all">Select all</button>
          <button type="button" class="text-action clear" data-action="clear">Clear</button>
        </div>
        <span class="hint" data-cloud-hint></span>
      </div>
      <button type="button" class="start-button" data-action="start"><span>Start batch</span>${icon(ArrowRight)}</button>
    </div>
  `;
  document.body.append(panel);

  const counter = panel.querySelector<HTMLElement>(".counter");
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
  const loadMoreLabel = loadMoreButton?.querySelector("span");
  const loadStatus = panel.querySelector<HTMLElement>(".load-status");
  const startLabel = startButton?.querySelector("span");

  panel
    .querySelector('[data-action="close"]')
    ?.addEventListener("click", handlers.onClose);
  loadMoreButton?.addEventListener("click", handlers.onToggleLoadMore);
  panel
    .querySelector('[data-action="select-all"]')
    ?.addEventListener("click", handlers.onSelectAll);
  panel
    .querySelector('[data-action="clear"]')
    ?.addEventListener("click", handlers.onClear);
  startButton?.addEventListener("click", handlers.onStart);
  localInput?.addEventListener("change", handlers.onDestinationsChange);
  cloudInput?.addEventListener("change", handlers.onDestinationsChange);

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

  return {
    contains(node) {
      return panel.contains(node);
    },
    checkedDestinations() {
      return [
        ...(localInput?.checked ? (["local"] as const) : []),
        ...(cloudInput?.checked && !cloudInput.disabled
          ? (["cloud"] as const)
          : []),
      ];
    },
    setCounter(text, full) {
      if (!counter) return;
      if (counter.getAttribute("aria-label") !== text) {
        const [value, ...details] = text.split(" · ");
        const valueElement = document.createElement("span");
        valueElement.className = "counter-value";
        valueElement.textContent = value ?? text;
        const children: HTMLElement[] = [valueElement];
        if (details.length > 0) {
          const metaElement = document.createElement("span");
          metaElement.className = "counter-meta";
          metaElement.textContent = ` · ${details.join(" · ")}`;
          children.push(metaElement);
        }
        counter.replaceChildren(...children);
        counter.setAttribute("aria-label", text);
      }
      counter.classList.toggle("counter-full", full);
    },
    setLoadMore(active, discoveredCount) {
      if (!loadMoreButton || !loadMoreLabel || !loadStatus) return;
      const videos = `${discoveredCount} ${discoveredCount === 1 ? "video" : "videos"} found`;
      loadStatus.textContent = active ? `Loading · ${videos}` : videos;
      if (active) {
        loadMoreLabel.textContent = "Stop";
        loadMoreButton.classList.add("is-loading");
        loadMoreButton.setAttribute("aria-busy", "true");
      } else {
        loadMoreLabel.textContent = "Load more";
        loadMoreButton.classList.remove("is-loading");
        loadMoreButton.removeAttribute("aria-busy");
      }
    },
    setStarting(starting) {
      if (!startButton || !startLabel) return;
      startButton.disabled = starting;
      startLabel.textContent = starting ? "Starting…" : "Start batch";
    },
    setCloudSession(signedIn, checked) {
      if (cloudInput) {
        cloudInput.disabled = !signedIn;
        cloudInput.checked = signedIn && checked;
      }
      cloudLabel?.classList.toggle("disabled", !signedIn);
      if (cloudHint) {
        cloudHint.textContent = signedIn
          ? ""
          : "Sign in from the popup to enable";
      }
    },
    showToast,
    dismissToast,
    remove() {
      dismissToast();
      panel.remove();
      document.getElementById(`${ROOT_ID}-styles`)?.remove();
    },
  };
}
