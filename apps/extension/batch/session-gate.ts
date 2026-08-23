import type { BatchJobStore } from "./jobs";

/**
 * Browser-session gate for batch capture (#59).
 *
 * `chrome.storage.session` survives service-worker restarts but is wiped
 * when the browser quits, which is exactly the distinction the executor
 * needs: a worker that comes back inside the same browser session may
 * resume an interrupted batch, while a worker that comes back after a
 * browser restart must not - the user confirms first.
 *
 * Every batch wake entry point (worker init, onStartup, onInstalled, the
 * per-minute alarm) must await `ensureSession()` before waking the
 * executor. The gate itself performs the restart pause, so the pause
 * always happens before any wake can observe the tasks.
 */

/** Session-storage marker: present = same browser session. */
export const BATCH_SESSION_KEY = "transcriptly:batch-session-active";

export interface BatchSessionStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export interface BatchSessionGateDependencies {
  store: BatchJobStore;
  storage: BatchSessionStorage;
  now?: () => number;
}

export type BatchSessionKind = "same-session" | "browser-restart";

export interface BatchSessionGate {
  /**
   * Classifies the current browser session (once per worker instance).
   * On a new browser session every queued/running batch task is paused
   * with reason `browser-restart` and interrupted item destinations are
   * re-queued; the caller must NOT wake the batch executor afterwards.
   */
  ensureSession(): Promise<BatchSessionKind>;
}

export function createBatchSessionGate(
  deps: BatchSessionGateDependencies,
): BatchSessionGate {
  const now = deps.now ?? (() => Date.now());
  let pending: Promise<BatchSessionKind> | undefined;

  async function run(): Promise<BatchSessionKind> {
    const marker = await deps.storage.get(BATCH_SESSION_KEY);
    if (marker === true) return "same-session";

    // New browser session: pause unfinished batches for explicit
    // confirmation. A destination stuck in `running` belongs to the
    // previous browser session's worker and goes back to `queued`.
    for (const task of await deps.store.list()) {
      if (task.state !== "queued" && task.state !== "running") continue;
      for (const item of task.items) {
        if (item.local === "running") item.local = "queued";
        if (item.cloud === "running") item.cloud = "queued";
      }
      task.state = "paused";
      task.pauseReason = "browser-restart";
      task.updatedAt = now();
      await deps.store.put(task);
    }

    await deps.storage.set(BATCH_SESSION_KEY, true);
    return "browser-restart";
  }

  return {
    ensureSession() {
      pending ??= run().catch((error: unknown) => {
        // A failed gate check must not poison the worker forever: retry
        // on the next call, but never report a restart as same-session.
        pending = undefined;
        throw error;
      });
      return pending;
    },
  };
}
