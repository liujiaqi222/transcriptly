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

export function createSelectionPanel(
  handlers: SelectionPanelHandlers,
): SelectionPanel {
  addStyles();

  const panel = document.createElement("aside");
  panel.id = ROOT_ID;
  panel.innerHTML = `
    <button type="button" class="panel-close" data-action="close" aria-label="Exit selection mode">✕</button>
    <div class="select-view">
      <div class="panel-head">
        <span class="brand">Transcriptly</span>
        <span class="counter" aria-live="polite">0/${BATCH_MAX_RUNNABLE_ITEMS}</span>
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
      if (counter.textContent !== text) counter.textContent = text;
      counter.classList.toggle("counter-full", full);
    },
    setLoadMore(active, discoveredCount) {
      if (!loadMoreButton) return;
      if (active) {
        loadMoreButton.textContent = `Loading… ${discoveredCount} videos`;
        loadMoreButton.classList.add("is-loading");
        loadMoreButton.setAttribute("aria-busy", "true");
      } else {
        loadMoreButton.textContent = "Load more";
        loadMoreButton.classList.remove("is-loading");
        loadMoreButton.removeAttribute("aria-busy");
      }
    },
    setStarting(starting) {
      if (!startButton) return;
      startButton.disabled = starting;
      startButton.textContent = starting ? "Starting…" : "Start ▸";
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
