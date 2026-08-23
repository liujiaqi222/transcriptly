import type { Capture } from "@transcriptly/schema";
import {
  MANAGER_LOCAL_PING,
  MANAGER_LOCAL_PREFLIGHT,
  MANAGER_LOCAL_SAVE,
  type ManagerLocalPreflightResponse,
  type ManagerLocalSaveResponse,
} from "@/shared/messages";
import type { LocalPreflightOutcome, LocalSaveOutcome } from "./jobs";

/**
 * Service-worker side of the Manager Local Save Host (#59).
 *
 * The worker cannot request folder permissions itself, so every local
 * batch write goes through the manager page via the shared Manager tab
 * coordinator. Permission problems come back immediately as typed
 * results (never waited for): the worker pauses the batch and focuses
 * the manager tab, whose grant button runs Chrome's prompt inside the
 * user's click gesture.
 */

/** How long the manager page may take to become message-ready. */
export const MANAGER_READY_TIMEOUT_MS = 30_000;
/**
 * Outermost deadline for one save round-trip through the manager page.
 * It ONLY guards against a lost or hung host (page closed, message or
 * file write never resolving) - it deliberately excludes user waiting:
 * permission problems return immediately as typed outcomes (#59).
 */
export const LOCAL_SAVE_TIMEOUT_MS = 60_000;
/** A preflight answer involves no user action, so it must be fast. */
export const LOCAL_PREFLIGHT_TIMEOUT_MS = 15_000;
const PING_INTERVAL_MS = 500;

export interface LocalSaveClientDependencies {
  /** Manager tab coordinator: finds or reopens the manager tab. */
  managerTabs: {
    ensureOpen(): Promise<number>;
    focus(): Promise<void>;
  };
  tabs: {
    sendMessage<T>(tabId: number, message: unknown): Promise<T>;
  };
  delay?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Timer plumbing for the outermost deadline; injectable for tests. */
  timers?: {
    setTimeout(callback: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
  };
}

export interface LocalSaveClient {
  /** Ask the host whether local saving can proceed without a prompt. */
  preflight(): Promise<LocalPreflightOutcome>;
  /** Save one capture locally through the host. */
  save(capture: Capture): Promise<LocalSaveOutcome>;
}

export function createLocalSaveClient(
  deps: LocalSaveClientDependencies,
): LocalSaveClient {
  const delay =
    deps.delay ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => Date.now());
  const timers =
    deps.timers ??
    ({
      setTimeout: (callback: () => void, ms: number) =>
        setTimeout(callback, ms),
      clearTimeout: (handle: unknown) =>
        clearTimeout(handle as ReturnType<typeof setTimeout>),
    } as NonNullable<LocalSaveClientDependencies["timers"]>);

  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async function withDeadline<T>(
    work: Promise<T>,
    ms: number,
    message: string,
  ): Promise<T> {
    let timer: unknown;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = timers.setTimeout(
            () => reject(new Error(message)),
            Math.max(0, ms),
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) timers.clearTimeout(timer);
    }
  }

  async function ping(tabId: number): Promise<boolean> {
    try {
      await deps.tabs.sendMessage(tabId, { type: MANAGER_LOCAL_PING });
      return true;
    } catch {
      return false;
    }
  }

  /** The manager tab, reopened in the background when the user closed it. */
  async function ensureHost(): Promise<number> {
    const deadline = now() + MANAGER_READY_TIMEOUT_MS;
    for (;;) {
      const tabId = await deps.managerTabs.ensureOpen();
      if (await ping(tabId)) return tabId;
      if (now() >= deadline) {
        throw new Error(
          "The Transcriptly manager page did not respond in time.",
        );
      }
      await delay(PING_INTERVAL_MS);
    }
  }

  async function preflight(): Promise<LocalPreflightOutcome> {
    let response: ManagerLocalPreflightResponse;
    try {
      const tabId = await ensureHost();
      response = await withDeadline(
        deps.tabs.sendMessage<ManagerLocalPreflightResponse>(tabId, {
          type: MANAGER_LOCAL_PREFLIGHT,
        }),
        LOCAL_PREFLIGHT_TIMEOUT_MS,
        "The Transcriptly manager page did not answer the folder check.",
      );
    } catch (error) {
      return { status: "unavailable", message: errorMessage(error) };
    }
    if (response.ok) {
      return { status: "ok", directoryName: response.directoryName };
    }
    if (
      response.reason === "permission-required" ||
      response.reason === "no-directory"
    ) {
      // The manager tab carries the grant prompt; bring it forward.
      void deps.managerTabs.focus().catch(() => undefined);
      return response.reason === "permission-required"
        ? { status: "permission-required" }
        : { status: "no-directory" };
    }
    return { status: "unavailable", message: response.message };
  }

  async function save(capture: Capture): Promise<LocalSaveOutcome> {
    let response: ManagerLocalSaveResponse;
    try {
      const tabId = await ensureHost();
      response = await withDeadline(
        deps.tabs.sendMessage<ManagerLocalSaveResponse>(tabId, {
          type: MANAGER_LOCAL_SAVE,
          capture,
        }),
        LOCAL_SAVE_TIMEOUT_MS,
        "Timed out waiting for the Transcriptly manager page while saving.",
      );
    } catch (error) {
      // Host lost or the outermost deadline hit: pause, do not burn the
      // rest of the batch on repeated timeouts. A late write may still
      // land - the receipt check on resume decides, not this message.
      return {
        status: "unavailable",
        message:
          `The Transcriptly manager page stopped responding during a local save (${errorMessage(error)}). ` +
          "Check the target folder for a possibly written file, then continue.",
      };
    }
    if (response.ok) {
      return {
        status: "saved",
        result: {
          directoryName: response.directoryName,
          filename: response.filename,
          ...(response.receiptError
            ? { receiptError: response.receiptError }
            : {}),
        },
      };
    }
    if (
      response.reason === "permission-required" ||
      response.reason === "no-directory"
    ) {
      void deps.managerTabs.focus().catch(() => undefined);
      return { status: "permission-required" };
    }
    return { status: "error", message: response.message };
  }

  return { preflight, save };
}
