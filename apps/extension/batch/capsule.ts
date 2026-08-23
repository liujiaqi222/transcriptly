import { isBatchSourceUrl } from "@/batch/discovery";
import { doneItemCount } from "@/batch/eta";
import type { BatchTask } from "@/batch/jobs";
import {
  BATCH_STATUS_REQUEST,
  type BatchStatusResult,
} from "@/shared/messages";

/**
 * Floating batch-progress capsule (#58).
 *
 * While a batch is running (or queued), every YouTube batch source page
 * shows a small pill in the bottom-left corner - "Batch 7/20 ->" - that
 * opens the manager page on the running task. It is independent of the
 * selection-mode toolbar: it appears even when selection mode was never
 * entered, and disappears when the batch finishes or the user navigates
 * to a page that is not a batch source. The full task view used to live
 * in the selection panel; it has moved to the manager page.
 */

const CAPSULE_ID = "transcriptly-batch-capsule";
const CAPSULE_STYLES_ID = "transcriptly-batch-capsule-styles";
/** Poll cadence for the newest running task. */
const CAPSULE_POLL_MS = 2000;

export interface BatchCapsuleRuntime {
  sendMessage<T = unknown>(message: unknown): Promise<T>;
  openManagerTab(taskId: string): void;
}

function defaultRuntime(): BatchCapsuleRuntime {
  return {
    sendMessage: (message) => browser.runtime.sendMessage(message),
    openManagerTab: (taskId) => {
      window.open(
        `${browser.runtime.getURL("/manager.html")}?task=${encodeURIComponent(taskId)}`,
        "_blank",
      );
    },
  };
}

function addStyles() {
  if (document.getElementById(CAPSULE_STYLES_ID)) return;
  const style = document.createElement("style");
  style.id = CAPSULE_STYLES_ID;
  style.textContent = `
    #${CAPSULE_ID} { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border: 0; border-radius: 999px; background: #232323; color: #fff; font: 13px/1 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; font-weight: 600; box-shadow: 0 8px 28px rgba(15,22,36,.35); cursor: pointer; }
    #${CAPSULE_ID}::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #1a7f37; animation: transcriptly-capsule-pulse 1.4s ease-in-out infinite; }
    #${CAPSULE_ID}:hover { background: #000; }
    @keyframes transcriptly-capsule-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  `;
  document.documentElement.append(style);
}

function removeCapsule() {
  document.getElementById(CAPSULE_ID)?.remove();
}

/**
 * Mounts the capsule on the current page. Returns a teardown handle
 * (used by tests; the content script keeps it for the page lifetime).
 */
export function mountBatchProgressCapsule(
  runtime: BatchCapsuleRuntime = defaultRuntime(),
): { teardown(): void } {
  let timer: number | undefined;
  let capsuleTaskId: string | undefined;

  function render(task: BatchTask) {
    capsuleTaskId = task.id;
    addStyles();
    let capsule = document.getElementById(
      CAPSULE_ID,
    ) as HTMLButtonElement | null;
    if (!capsule) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = CAPSULE_ID;
      button.addEventListener("click", () => {
        if (capsuleTaskId) runtime.openManagerTab(capsuleTaskId);
      });
      document.body.append(button);
      capsule = button;
    }
    const label = `Batch ${doneItemCount(task)}/${task.items.length} ->`;
    if (capsule.textContent !== label) {
      capsule.textContent = label;
      capsule.setAttribute("aria-label", `Open batch manager: ${label}`);
    }
  }

  async function sync() {
    if (!isBatchSourceUrl(location.href)) return;
    let tasks: BatchTask[];
    try {
      const result = await runtime.sendMessage<BatchStatusResult>({
        type: BATCH_STATUS_REQUEST,
      });
      tasks = result.tasks;
    } catch {
      // The worker is unreachable; the next poll retries.
      return;
    }
    const running = tasks
      .filter((task) => task.state === "running" || task.state === "queued")
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (running) render(running);
    else {
      capsuleTaskId = undefined;
      removeCapsule();
    }
  }

  function startPolling() {
    if (timer !== undefined) return;
    void sync();
    timer = window.setInterval(() => void sync(), CAPSULE_POLL_MS);
  }

  function stopPolling() {
    if (timer === undefined) return;
    clearInterval(timer);
    timer = undefined;
    capsuleTaskId = undefined;
    removeCapsule();
  }

  // YouTube is a SPA: the capsule follows the user between batch source
  // pages and disappears everywhere else (#58).
  const handleNavigate = () => {
    if (isBatchSourceUrl(location.href)) startPolling();
    else stopPolling();
  };
  window.addEventListener("yt-navigate-finish", handleNavigate);

  if (isBatchSourceUrl(location.href)) startPolling();

  return {
    teardown() {
      stopPolling();
      window.removeEventListener("yt-navigate-finish", handleNavigate);
      document.getElementById(CAPSULE_STYLES_ID)?.remove();
    },
  };
}
